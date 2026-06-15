import kleur from 'kleur';
import { api, ApiError, type Employee } from '../api.js';

export interface EmployeesOpts {
  q?: string;
  includeInactive?: boolean;
  json?: boolean;
}

export async function employeesCommand(opts: EmployeesOpts) {
  // The server-side `GET /employees` handler enforces the manager-or-admin
  // gate. We fail-fast client-side too: a `self`-role caller hitting this
  // endpoint just gets an empty list, which is harder to diagnose than a
  // clear "this command needs a manager role" message.
  let me: Employee;
  try {
    me = await api.me();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw err;
  }
  if (me.role !== 'manager' && me.role !== 'admin') {
    console.error(
      kleur.red(`scrum employees requires a manager or admin role; your role is "${me.role}"`),
    );
    process.exit(2);
  }

  const env = await api.employees({ q: opts.q, include_inactive: opts.includeInactive });

  if (opts.json) {
    process.stdout.write(JSON.stringify(env.items, null, 2) + '\n');
    return;
  }

  if (env.items.length === 0) {
    console.log(kleur.dim(opts.q ? `no employees match "${opts.q}"` : 'no employees'));
    return;
  }

  // Column-aligned table — short and scannable. Avoid ASCII box-drawing chars
  // so the output stays grep-friendly.
  const rows = env.items.map(e => {
    const name = [e.first_name, e.last_name].filter(Boolean).join(' ') || '—';
    return {
      username: e.username ?? '—',
      name,
      title: e.title ?? '',
      role: e.role,
      inactive: e.is_active === 'N',
    };
  });
  const w = {
    username: Math.max(...rows.map(r => r.username.length), 8),
    name: Math.max(...rows.map(r => r.name.length), 4),
    title: Math.max(...rows.map(r => r.title.length), 0),
  };
  for (const r of rows) {
    const tag = r.inactive ? kleur.dim('  [inactive]') : '';
    console.log(
      `${kleur.cyan(r.username.padEnd(w.username))}  ${kleur.bold(r.name.padEnd(w.name))}  ` +
        `${r.title.padEnd(w.title)}  ${kleur.dim(r.role)}${tag}`,
    );
  }
  if (env.hasMore) console.log(kleur.dim(`...more (${env.count} shown)`));
}
