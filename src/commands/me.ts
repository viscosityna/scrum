import kleur from 'kleur';
import { api } from '../api.js';

export async function meCommand(opts: { json?: boolean; for?: string }) {
  const me = await api.me({ for: opts.for });
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
  console.log(`  pto hours: ${me.pto_hours}`);
  // `is_active` is intentionally omitted from the default human view per
  // P1.2 of cli/UPGRADES.md: if the caller reaches /me at all they are
  // active. Field is still present in --json output above for scripting.
}
