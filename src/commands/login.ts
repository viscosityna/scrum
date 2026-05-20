import kleur from 'kleur';
import { setConfig } from '../config.js';
import { performLogin, logout } from '../oauth.js';
import { api } from '../api.js';

export async function loginCommand(_opts: unknown) {
  await performLogin();

  const me = await api.me();
  setConfig({ username: me.username });
  console.log(kleur.green(`signed in as ${me.username} — role: ${me.role}`));
}

export async function logoutCommand() {
  await logout();
  console.log(kleur.green('signed out — tokens removed from keyring'));
}
