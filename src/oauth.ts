import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { URL } from 'node:url';
import { getConfig, saveTokens, loadTokens, clearTokens, type TokenSet } from './config.js';

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function makePkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

async function captureCode(port: number, expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');
      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h1>Sign-in failed</h1><pre>${error}\n${errorDescription ?? ''}</pre>`);
        server.close();
        reject(new Error(`oauth error: ${error}${errorDescription ? ' — ' + errorDescription : ''}`));
        return;
      }
      if (!code || state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Invalid response</h1>');
        server.close();
        reject(new Error('missing code or state mismatch'));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Signed in.</h1><p>You can close this tab and return to the terminal.</p>');
      server.close();
      resolve(code);
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1');
  });
}

async function openBrowser(url: string): Promise<void> {
  const { spawn } = await import('node:child_process');
  try {
    if (process.platform === 'win32') {
      // rundll32 + FileProtocolHandler is the canonical URL-open on Windows.
      // No shell parsing of `&`, no PowerShell handoff to break on weird machine state.
      spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {
        stdio: 'ignore',
        detached: true,
      }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    } else {
      spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
    }
  } catch {
    // If we can't auto-open, the URL was already printed to the console for manual paste.
  }
}

export async function performLogin(): Promise<TokenSet> {
  const cfg = getConfig();
  if (!cfg.client_id) throw new Error('client_id not configured');
  const port = Number(new URL(cfg.redirect_uri).port || '8765');
  const { verifier, challenge } = makePkce();
  const state = b64url(randomBytes(16));

  const authUrl = new URL(cfg.authorize_url);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', cfg.client_id);
  authUrl.searchParams.set('redirect_uri', cfg.redirect_uri);
  authUrl.searchParams.set('scope', cfg.scope);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('response_mode', 'query');
  if (process.env.SCRUM_FORCE_LOGIN === '1') {
    authUrl.searchParams.set('prompt', 'login');
  }

  console.log('Opening browser to sign in via Microsoft. If it does not open, visit:');
  console.log(`  ${authUrl.toString()}`);
  console.log('');
  console.log('Waiting for redirect to localhost...');

  const capturePromise = captureCode(port, state);
  await openBrowser(authUrl.toString());
  const code = await capturePromise;

  return exchangeCode(code, verifier);
}

async function exchangeCode(code: string, verifier: string): Promise<TokenSet> {
  const cfg = getConfig();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.redirect_uri,
    client_id: cfg.client_id,
    code_verifier: verifier,
    scope: cfg.scope,
  });

  const res = await fetch(cfg.token_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`token exchange failed: ${res.status} ${text}`);
  }
  const json = JSON.parse(text) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type: string;
  };
  const tokens: TokenSet = {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + (json.expires_in ?? 3600) * 1000,
    token_type: json.token_type ?? 'Bearer',
  };
  await saveTokens(tokens);
  return tokens;
}

export async function getAccessToken(): Promise<string> {
  const tokens = await loadTokens();
  if (!tokens) throw new Error('not signed in — run `scrum login`');
  if (tokens.expires_at - 60_000 > Date.now()) return tokens.access_token;
  if (!tokens.refresh_token) {
    await clearTokens();
    throw new Error('token expired and no refresh available — run `scrum login`');
  }
  return refresh(tokens.refresh_token);
}

async function refresh(refresh_token: string): Promise<string> {
  const cfg = getConfig();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token,
    client_id: cfg.client_id,
    scope: cfg.scope,
  });
  const res = await fetch(cfg.token_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    await clearTokens();
    throw new Error(`refresh failed (${res.status}) — run \`scrum login\``);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type: string;
  };
  const tokens: TokenSet = {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? refresh_token,
    expires_at: Date.now() + (json.expires_in ?? 3600) * 1000,
    token_type: json.token_type ?? 'Bearer',
  };
  await saveTokens(tokens);
  return tokens.access_token;
}

export async function logout(): Promise<void> {
  await clearTokens();
}
