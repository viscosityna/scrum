import kleur from 'kleur';
import { getConfig } from '../config.js';
import { getAccessToken } from '../oauth.js';
import { api, ApiError, type PtoRequestSummary } from '../api.js';

// Status ids the server uses — keep in lockstep with HR_TIMEOFF_REQUEST_STATUS.
const STATUS_NAME_TO_ID: Record<string, string> = {
  pending: '41,42',         // NEW + IN_REVIEW
  new: '41',
  in_review: '42',
  approved: '43',
  declined: '45',
  closed: '46',
};

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

// ============================================================================
// PTO approval workflow — Phase B of MANAGER_SURFACE.md
// ============================================================================

export interface PtoRequestsOpts {
  json?: boolean;
  status?: string;       // human-friendly: pending|new|in_review|approved|declined|closed|all|<csv>
  all?: boolean;
  for?: string;
  approver?: string;
  mine?: boolean;
}

export async function ptoRequestsCommand(opts: PtoRequestsOpts) {
  let status: string | undefined;
  let all = opts.all;
  if (opts.status) {
    const key = opts.status.toLowerCase();
    if (key === 'all') {
      all = true;
    } else if (STATUS_NAME_TO_ID[key]) {
      status = STATUS_NAME_TO_ID[key];
    } else if (/^[\d,]+$/.test(key)) {
      status = key;
    } else {
      throw new Error(
        `--status must be one of: ${Object.keys(STATUS_NAME_TO_ID).join(', ')}, all, or a CSV of status ids`,
      );
    }
  }

  const env = await api.ptoRequests({
    status,
    all,
    for: opts.for,
    approver: opts.approver,
    mine: opts.mine,
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify(env.items, null, 2) + '\n');
    return;
  }

  if (env.items.length === 0) {
    console.log(kleur.dim('no PTO requests match'));
    return;
  }

  const w = {
    id: Math.max(...env.items.map(r => String(r.id).length), 2),
    emp: Math.max(...env.items.map(r => (r.employee_username ?? '').length), 8),
    range: 0,
    type: Math.max(...env.items.map(r => (r.type_label ?? '').length), 4),
    status: Math.max(...env.items.map(r => (r.status_label ?? '').length), 6),
  };
  const ranges = env.items.map(r =>
    r.start_date === r.end_date ? r.start_date : `${r.start_date}→${r.end_date}`,
  );
  w.range = Math.max(...ranges.map(s => s.length), 5);

  for (let i = 0; i < env.items.length; i++) {
    const r = env.items[i]!;
    const range = ranges[i]!;
    const days = `${r.days_count}d`.padStart(3);
    console.log(
      `${kleur.bold('#' + String(r.id).padEnd(w.id))} ` +
        `${kleur.cyan((r.employee_username ?? '—').padEnd(w.emp))} ` +
        `${(r.type_label ?? '—').padEnd(w.type)} ` +
        `${range.padEnd(w.range)} ` +
        `${kleur.dim(days)}  ` +
        `${statusColor(r)}`,
    );
  }
  if (env.hasMore) console.log(kleur.dim(`...more (${env.count} shown)`));
}

function statusColor(r: PtoRequestSummary): string {
  const label = r.status_label ?? `#${r.status_id}`;
  switch (r.status_id) {
    case 41:
    case 42:
      return kleur.yellow(label);
    case 43:
      return kleur.green(label);
    case 45:
      return kleur.red(label);
    case 46:
      return kleur.dim(label);
    default:
      return label;
  }
}

export async function ptoApproveCommand(idStr: string, opts: { note?: string; json?: boolean }) {
  const id = Number(idStr);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`invalid request id "${idStr}"`);
  }
  const result = await api.approvePto(id, { note: opts.note });
  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }
  if (result.idempotent === 'true') {
    console.log(
      kleur.dim(`PTO request #${result.id} was already ${result.status_label} — no change`),
    );
    return;
  }
  console.log(
    `${kleur.green('approved')} PTO request ${kleur.bold('#' + result.id)} → ${kleur.bold(result.status_label)}` +
      (result.note_added === 'true' ? kleur.dim('  (note added)') : ''),
  );
}

export async function ptoDeclineCommand(idStr: string, opts: { note?: string; json?: boolean }) {
  const id = Number(idStr);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`invalid request id "${idStr}"`);
  }
  const result = await api.declinePto(id, { note: opts.note });
  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }
  if (result.idempotent === 'true') {
    console.log(
      kleur.dim(`PTO request #${result.id} was already ${result.status_label} — no change`),
    );
    return;
  }
  console.log(
    `${kleur.red('declined')} PTO request ${kleur.bold('#' + result.id)} → ${kleur.bold(result.status_label)}` +
      (result.note_added === 'true' ? kleur.dim('  (note added)') : ''),
  );
}
