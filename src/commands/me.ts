import kleur from 'kleur';
import { api } from '../api.js';

export async function meCommand(opts: { json?: boolean }) {
  const me = await api.me();
  if (opts.json) {
    process.stdout.write(JSON.stringify(me, null, 2) + '\n');
    return;
  }
  const fullName = [me.first_name, me.last_name].filter(Boolean).join(' ');
  console.log(kleur.bold(me.username) + (fullName ? `  (${fullName})` : ''));
  console.log(`  id:        ${me.id}`);
  console.log(`  email:     ${me.email ?? '—'}`);
  console.log(`  title:     ${me.title ?? '—'}`);
  console.log(`  role:      ${me.role}`);
  console.log(`  active:    ${me.is_active}`);
  console.log(`  pto hours: ${me.pto_hours}`);
}
