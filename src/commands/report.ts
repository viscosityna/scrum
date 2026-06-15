import kleur from 'kleur';
import { api, type ProjectReport, type TeamReport } from '../api.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const fmtHours = (n: number): string => {
  if (n === Math.floor(n)) return `${n}h`;
  return `${n.toFixed(2)}h`;
};

const padHours = (n: number, width = 7): string => fmtHours(n).padStart(width);

export async function reportProjectCommand(
  idOrAbbr: string,
  opts: { json?: boolean },
) {
  // Reuse the existing project lookup so abbr → id resolution is shared
  // with `scrum project <abbr>` and `scrum tasks <abbr>`.
  const project = await api.project(idOrAbbr);
  const report = await api.reportProject(project.id);

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  renderProjectReport(report);
}

export async function reportTeamCommand(opts: {
  week?: string;
  for?: string;
  json?: boolean;
}) {
  if (opts.week && !ISO_DATE.test(opts.week)) {
    throw new Error(`--week must be YYYY-MM-DD; got "${opts.week}"`);
  }

  const report = await api.reportTeam({ week: opts.week, for: opts.for });

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  renderTeamReport(report);
}

function renderProjectReport(r: ProjectReport): void {
  const title = `${r.project_abbr ?? r.project_id} — ${r.name}`;
  console.log(kleur.bold(title));
  if (r.client_name) console.log(`  client:        ${r.client_name}`);
  if (r.status_label) console.log(`  status:        ${r.status_label}`);
  console.log('');

  // Budget block
  if (r.budget_hours != null) {
    const pct = r.pct_of_budget ?? 0;
    const pctColored =
      pct < 80
        ? kleur.green(`${pct}%`)
        : pct < 100
        ? kleur.yellow(`${pct}%`)
        : kleur.red(`${pct}%`);
    console.log(
      `  budget:        ${padHours(r.budget_hours)}    used: ${padHours(r.total_hours)}  ${pctColored}  remaining: ${padHours(r.remaining_hours ?? 0)}`,
    );
  } else {
    console.log(`  budget:        ${kleur.dim('(none set)')}    used: ${padHours(r.total_hours)}`);
  }
  console.log(`  this month:    ${padHours(r.mtd_hours)}`);
  console.log(`  this week:     ${padHours(r.wtd_hours)}`);

  if (r.resources.length === 0) {
    console.log('');
    console.log(kleur.dim('  no resources have logged hours yet'));
    return;
  }

  console.log('');
  console.log(kleur.bold('  By resource:'));
  const w = {
    user: Math.max(...r.resources.map(r => (r.username ?? '').length), 8),
    name: Math.max(...r.resources.map(r => (r.name ?? '').length), 4),
  };
  for (const res of r.resources) {
    const inactive = res.is_active === 'N' ? kleur.dim('  [inactive]') : '';
    const user = (res.username ?? '—').padEnd(w.user);
    const name = (res.name ?? '—').padEnd(w.name);
    console.log(
      `    ${kleur.cyan(user)}  ${name}  ${padHours(res.total_hours, 8)}   ` +
        `${kleur.dim('MTD ' + fmtHours(res.mtd_hours).padStart(6))}   ` +
        `${kleur.dim('WTD ' + fmtHours(res.wtd_hours).padStart(6))}` +
        inactive,
    );
  }
}

function renderTeamReport(r: TeamReport): void {
  const range = `${r.week_start} (Mon) → ${r.week_end} (Sun)`;
  const ptoSummary =
    r.total_pto_hours != null && r.total_pto_hours > 0
      ? `, ${fmtHours(r.total_pto_hours)} PTO`
      : '';
  const capSummary =
    r.capacity_per_person != null
      ? `, capacity ${fmtHours(r.capacity_per_person)}/person`
      : '';
  console.log(
    kleur.bold(`Team — week of ${range}`) +
      kleur.dim(
        `   ${fmtHours(r.total_hours)} worked${ptoSummary} across ${r.employees.length} people${capSummary}`,
      ),
  );
  if (r.employees.length === 0) {
    console.log(kleur.dim('  no entries this week'));
    return;
  }
  console.log('');

  for (const e of r.employees) {
    const pto = e.pto_hours ?? 0;
    const cap = e.capacity_hours;
    const util = e.utilization_pct;

    const utilStr =
      util != null
        ? `  ${utilColor(util)}`
        : '';
    const ptoStr = pto > 0 ? `  ${kleur.dim('PTO ' + fmtHours(pto))}` : '';
    const capStr = cap != null ? `  ${kleur.dim('cap ' + fmtHours(cap))}` : '';

    console.log(
      `${kleur.cyan((e.username ?? '—').padEnd(12))} ` +
        `${kleur.bold(padHours(e.week_hours, 6))}` +
        ptoStr +
        capStr +
        utilStr +
        `   ${kleur.dim(e.name ?? '')}`,
    );
    for (const bp of e.by_project) {
      const abbr = (bp.project_abbr ?? '?').padEnd(8);
      console.log(
        `              ${kleur.dim(abbr)}  ${padHours(bp.hours, 6)}   ${kleur.dim(bp.name ?? '')}`,
      );
    }
  }
}

function utilColor(pct: number): string {
  const label = `util ${pct}%`;
  if (pct >= 90 && pct <= 110) return kleur.green(label);
  if (pct >= 75) return kleur.yellow(label);
  return kleur.red(label);
}
