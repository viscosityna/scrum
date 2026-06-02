import Conf from 'conf';

const TENANT_ID = '85acb3c0-1e01-4f12-ba06-e8da48f664c5';
const CLIENT_ID = '226a442a-d10e-423a-82c4-9fa440117017';

export interface CliConfig {
  api_base: string;
  authorize_url: string;
  token_url: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  username?: string;
}

/**
 * Immutable defaults bound to the Viscosity NA tenant + scrumtime ORDS module.
 * Env vars override at runtime (useful for testing). Never persisted.
 */
function defaults(): CliConfig {
  return {
    api_base: process.env.SCRUM_API_BASE ?? 'https://scrumtime-api.devops-1e0.workers.dev/api/v1',
    authorize_url:
      process.env.SCRUM_AUTHORIZE_URL ??
      `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`,
    token_url:
      process.env.SCRUM_TOKEN_URL ??
      `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    client_id: process.env.SCRUM_CLIENT_ID ?? CLIENT_ID,
    redirect_uri: process.env.SCRUM_REDIRECT_URI ?? 'http://localhost:8765/callback',
    scope: process.env.SCRUM_SCOPE ?? `api://${CLIENT_ID}/api.access offline_access openid profile`,
  };
}

interface PersistedConfig {
  username?: string;
}
const store = new Conf<PersistedConfig>({ projectName: 'scrumtime' });

export function getConfig(): CliConfig {
  return { ...defaults(), username: store.get('username') };
}

export function setConfig(partial: Partial<CliConfig>): void {
  if (partial.username !== undefined) store.set('username', partial.username);
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  token_type: string;
}

/**
 * Tokens live in a per-user config file. On Windows the path is
 * `%APPDATA%\scrumtime-nodejs\tokens.json` with per-user ACL. On macOS/Linux
 * the equivalent XDG config dir, mode 600 by default for new files.
 *
 * We previously tried keytar (OS keyring), but Microsoft JWTs are large enough
 * that Windows Credential Manager rejects them with RPC_X_BAD_STUB_DATA. File
 * storage avoids that. Access tokens are short-lived; refresh tokens get
 * refreshed periodically. Acceptable for an internal CLI.
 */
const tokenStore = new Conf<TokenSet>({ projectName: 'scrumtime', configName: 'tokens' });

export async function saveTokens(t: TokenSet): Promise<void> {
  tokenStore.set('access_token', t.access_token);
  if (t.refresh_token) tokenStore.set('refresh_token', t.refresh_token);
  else tokenStore.delete('refresh_token');
  tokenStore.set('expires_at', t.expires_at);
  tokenStore.set('token_type', t.token_type);
}

export async function loadTokens(): Promise<TokenSet | null> {
  const access_token = tokenStore.get('access_token');
  if (!access_token) return null;
  return {
    access_token,
    refresh_token: tokenStore.get('refresh_token'),
    expires_at: tokenStore.get('expires_at') ?? 0,
    token_type: tokenStore.get('token_type') ?? 'Bearer',
  };
}

export async function clearTokens(): Promise<void> {
  tokenStore.clear();
}
