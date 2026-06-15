import kleur from 'kleur';
import { getConfig } from '../config.js';
import { getAccessToken } from '../oauth.js';
import { api, ApiError } from '../api.js';

interface PtoBalance {
  employee_id: number;
  username: string;
  email: string | null;
  pto_hours: number;
  anniversary: string | null;
  is_pto_admin: 'Y' | 'N';
}

async function fetchPto(opts: { for?: string } = {}): Promise<PtoBalance> {
  const cfg = getConfig();
  const token = await getAccessToken();
  const qs = new URLSearchParams();
  if (opts.for) qs.set('for_upn', opts.for);
  const suffix = qs.toString() ? `?${qs}` : '';
  const res = await fetch(`${cfg.api_base.replace(/\/$/, '')}/pto/balance${suffix}`, {
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

export async function ptoBalanceCommand(opts: { json?: boolean; for?: string }) {
  const balance = await fetchPto({ for: opts.for });
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

// Backwards-compat alias: the original top-level `scrum pto` action.
export const ptoCommand = ptoBalanceCommand;

// PTO request type names map to HR_TIMEOFF_REQUEST_TYPES.request_type_id.
const TYPE_IDS: Record<string, number> = {
  vacation: 61,
  unpaid: 62,
  medical: 81,
  other: 82,
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface PtoRequestOpts {
  json?: boolean;
  to?: string;
  type?: string;
  note?: string;
  countWeekends?: boolean;
}

export async function ptoRequestCommand(
  hoursStr: string,
  date: string,
  reason: string | undefined,
  opts: PtoRequestOpts,
) {
  const hours = Number(hoursStr);
  if (!Number.isFinite(hours) || (hours !== 4 && hours !== 8)) {
    throw new Error(`hours must be 4 (half day) or 8 (full day); got "${hoursStr}"`);
  }
  const hour_range_id: 13 | 14 = hours === 4 ? 13 : 14;

  if (!ISO_DATE.test(date)) {
    throw new Error(`date must be YYYY-MM-DD; got "${date}"`);
  }
  if (opts.to !== undefined && !ISO_DATE.test(opts.to)) {
    throw new Error(`--to must be YYYY-MM-DD; got "${opts.to}"`);
  }

  let type_id: number | undefined;
  if (opts.type !== undefined) {
    const key = opts.type.toLowerCase();
    type_id = TYPE_IDS[key];
    if (type_id === undefined) {
      throw new Error(
        `--type must be one of: ${Object.keys(TYPE_IDS).join(', ')}; got "${opts.type}"`,
      );
    }
  }

  // `reason` is the optional positional; `--note` / `-n` is the same field via flag.
  const finalReason = reason ?? opts.note;

  const result = await api.requestPto({
    start_date: date,
    end_date: opts.to,
    hour_range_id,
    type_id,
    count_weekends: opts.countWeekends,
    reason: finalReason,
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  const rangeShown =
    result.start_date === result.end_date
      ? result.start_date
      : `${result.start_date} → ${result.end_date}`;
  console.log(
    `submitted PTO request ${kleur.bold('#' + result.request_id)} (${kleur.bold(result.status_label)})`,
  );
  console.log(`  type:    ${result.type_label}`);
  console.log(`  range:   ${rangeShown}`);
  console.log(
    `  days:    ${result.days_inserted} × ${result.hour_range_label}` +
      (result.days_inserted > 1 ? `  [${result.days.join(', ')}]` : ''),
  );
  if (result.reason) console.log(`  reason:  ${result.reason}`);
}
