import kleur from 'kleur';
import { setConfig } from '../config.js';
import { performLogin, logout } from '../oauth.js';
import { api, ApiError } from '../api.js';

export async function loginCommand(_opts: unknown) {
  await performLogin();

  try {
    const me = await api.me();
    setConfig({ username: me.username });
    console.log(kleur.green(`signed in as ${me.username} — role: ${me.role}`));
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      console.error(kleur.red('Microsoft sign-in succeeded, but you do not have access to scrumtime.'));
      console.error('');
      console.error('Ask the scrumtime admin to assign you the "scrumtime user" app role:');
      console.error('  Entra → Enterprise applications → scrumtime API → Users and groups → + Add user');
      console.error('');
      console.error(kleur.dim(`(server: ${err.detail ?? 'Forbidden'})`));
      process.exit(1);
    }
    throw err;
  }
}

export async function logoutCommand() {
  await logout();
  console.log(kleur.green('signed out — cached tokens removed'));
}

export async function configCommand(opts: { json?: boolean }) {
  const { getConfig } = await import('../config.js');
  const cfg = getConfig();
  if (opts.json) {
    process.stdout.write(JSON.stringify(cfg, null, 2) + '\n');
    return;
  }
  console.log(kleur.bold('current config'));
  console.log(`  api_base:       ${cfg.api_base}`);
  console.log(`  authorize_url:  ${cfg.authorize_url}`);
  console.log(`  token_url:      ${cfg.token_url}`);
  console.log(`  client_id:      ${cfg.client_id}`);
  console.log(`  redirect_uri:   ${cfg.redirect_uri}`);
  console.log(`  scope:          ${cfg.scope}`);
  console.log(`  username:       ${cfg.username ?? kleur.dim('(not signed in)')}`);
}
