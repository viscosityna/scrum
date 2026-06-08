import Conf from 'conf';
import { unlink } from 'fs/promises';
import { setSecret, getSecret, deleteSecret } from './secure-storage.js';

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
 * Tokens are persisted via the OS-native data-protection API: DPAPI on
 * Windows, Keychain on macOS, libsecret on Linux. See secure-storage.ts.
 *
 * History: older builds wrote `%APPDATA%\scrumtime-nodejs\tokens.json` in
 * plaintext because Microsoft access tokens exceeded the Windows Credential
 * Manager size cap. The DPAPI-blob path used by secure-storage has no such
 * cap, so we get encryption back without the keytar workaround. Existing
 * plaintext files are silently migrated on the next `loadTokens()` call.
 */
const legacyTokenStore = new Conf<TokenSet>({ projectName: 'scrumtime', configName: 'tokens' });

export async function saveTokens(t: TokenSet): Promise<void> {
  await setSecret(JSON.stringify(t));
  await deleteLegacyPlaintext();
}

export async function loadTokens(): Promise<TokenSet | null> {
  const secret = await getSecret();
  if (secret) {
    try {
      return JSON.parse(secret) as TokenSet;
    } catch {
      return null;
    }
  }
  // No secret on disk yet — check whether an older plaintext file exists and
  // migrate it transparently. The user sees nothing different.
  return await migrateLegacyPlaintext();
}

export async function clearTokens(): Promise<void> {
  await deleteSecret();
  await deleteLegacyPlaintext();
}

async function migrateLegacyPlaintext(): Promise<TokenSet | null> {
  const legacyAccess = legacyTokenStore.get('access_token');
  if (!legacyAccess) return null;
  const migrated: TokenSet = {
    access_token: legacyAccess,
    refresh_token: legacyTokenStore.get('refresh_token'),
    expires_at: legacyTokenStore.get('expires_at') ?? 0,
    token_type: legacyTokenStore.get('token_type') ?? 'Bearer',
  };
  try {
    await setSecret(JSON.stringify(migrated));
    await deleteLegacyPlaintext();
  } catch {
    // If secure storage is unavailable on this host (e.g. Linux without
    // libsecret-tools), keep the legacy plaintext as a fallback so the user
    // is not stranded. They will be re-prompted by ensureSecretToolAvailable
    // when they next try to save anything.
  }
  return migrated;
}

async function deleteLegacyPlaintext(): Promise<void> {
  try {
    legacyTokenStore.clear();
  } catch { /* ignore */ }
  try {
    await unlink(legacyTokenStore.path);
  } catch { /* file might not exist, or conf re-creates it on next access */ }
}
