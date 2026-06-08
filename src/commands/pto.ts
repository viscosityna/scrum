import kleur from 'kleur';
import { getConfig } from '../config.js';
import { getAccessToken } from '../oauth.js';
import { ApiError } from '../api.js';

interface PtoBalance {
  employee_id: number;
  username: string;
  email: string | null;
  pto_hours: number;
  anniversary: string | null;
  is_pto_admin: 'Y' | 'N';
}

async function fetchPto(): Promise<PtoBalance> {
  const cfg = getConfig();
  const token = await getAccessToken();
  const res = await fetch(`${cfg.api_base.replace(/\/$/, '')}/pto/balance`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    let detail = '';
    try {
      const j = (await res.json()) as { title?: string; detail?: string; message?: string };
      detail = j.detail ?? j.title ?? j.message ?? '';
    } catch {
      detail = await res.text();
    }
    throw new ApiError(res.status, `GET /pto/balance → ${res.status}`, detail);
  }
  return (await res.json()) as PtoBalance;
}

export async function ptoCommand(opts: { json?: boolean }) {
  const balance = await fetchPto();
  if (opts.json) {
    process.stdout.write(JSON.stringify(balance, null, 2) + '\n');
    return;
  }
  console.log(kleur.bold(`PTO balance — ${balance.username}`));
  console.log(`  employee_id:  ${balance.employee_id}`);
  console.log(`  email:        ${balance.email ?? '—'}`);
  console.log(`  pto_hours:    ${kleur.bold(String(balance.pto_hours))}`);
  console.log(`  anniversary:  ${balance.anniversary ?? '—'}`);
  // `is_pto_admin` is operator metadata, omitted from the default view per
  // P1.2 of cli/UPGRADES.md. Still present in --json output above.
}
