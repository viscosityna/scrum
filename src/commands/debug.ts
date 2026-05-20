import kleur from 'kleur';
import { loadTokens } from '../config.js';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = parts[1]!;
  // base64url -> base64
  const b64 = payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (payload.length % 4)) % 4);
  try {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export async function debugTokenCommand() {
  const tokens = await loadTokens();
  if (!tokens) {
    console.error(kleur.red('no tokens — run `scrum login` first'));
    process.exit(2);
  }

  const claims = decodeJwtPayload(tokens.access_token);
  if (!claims) {
    console.error(kleur.red('access token is not a valid JWT'));
    process.exit(1);
  }

  console.log(kleur.bold('=== access token claims ==='));
  console.log(JSON.stringify(claims, null, 2));

  console.log(kleur.bold('\n=== checks against ORDS expectations ==='));
  const expectations: Array<{ name: string; want: string; got: unknown }> = [
    { name: 'iss (issuer)', want: 'https://login.microsoftonline.com/85acb3c0-1e01-4f12-ba06-e8da48f664c5/v2.0', got: claims.iss },
    { name: 'aud (audience)', want: 'api://226a442a-d10e-423a-82c4-9fa440117017', got: claims.aud },
    { name: 'upn (identifier)', want: '<your @viscosityna.com>', got: claims.upn ?? '(missing)' },
    { name: 'roles', want: '["scrumtime_user"]', got: claims.roles ?? '(missing)' },
  ];
  for (const e of expectations) {
    console.log(`  ${e.name}: ${JSON.stringify(e.got)}`);
    console.log(`     want: ${e.want}`);
  }

  console.log(kleur.bold('\n=== expiry ==='));
  const exp = claims.exp as number | undefined;
  if (exp) {
    const left = Math.round((exp * 1000 - Date.now()) / 1000);
    console.log(`  expires in ${left}s (${new Date(exp * 1000).toISOString()})`);
  }
}
