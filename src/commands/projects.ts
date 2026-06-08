import kleur from 'kleur';
import { api } from '../api.js';

export async function projectsCommand(opts: { all?: boolean; includeClosed?: boolean; q?: string; json?: boolean }) {
  const env = await api.projects({
    mine: !opts.all,
    active: !opts.includeClosed,   // default: active only; --include-closed widens
    q: opts.q,
  });
  if (opts.json) {
    process.stdout.write(JSON.stringify(env.items, null, 2) + '\n');
    return;
  }
  if (env.items.length === 0) {
    console.log(kleur.dim('no projects'));
    return;
  }
  for (const p of env.items) {
    const abbr = (p.project_abbr ?? '').padEnd(8);
    console.log(`${kleur.cyan(abbr)} ${kleur.bold(p.name)}`);
  }
  if (env.hasMore) console.log(kleur.dim(`...more (${env.count} shown)`));
}

export async function projectCommand(idOrAbbr: string, opts: { json?: boolean }) {
  const p = await api.project(idOrAbbr);
  if (opts.json) {
    process.stdout.write(JSON.stringify(p, null, 2) + '\n');
    return;
  }
  // Prefer the *_label / *_name fields the v1 handler returns alongside the
  // raw foreign keys (v1_projects_labels.sql). Fall back to the id with an
  // annotation when the lookup row is missing so the human at least sees
  // something to grep for.
  const labelOrId = (label: unknown, id: unknown): string => {
    if (label != null && String(label).trim().length > 0) return String(label);
    if (id == null) return '—';
    return `#${id}`;
  };
  console.log(kleur.bold(`${p.project_abbr ?? p.id}  ${p.name}`));
  if (p.description) console.log(`  ${p.description}`);
  console.log(`  id:           ${p.id}`);
  console.log(`  client:       ${labelOrId((p as any).client_name, p.client_id)}`);
  console.log(`  status:       ${labelOrId((p as any).status_label, p.status)}`);
  console.log(`  cycle:        ${labelOrId((p as any).cycle_label, p.project_cycle_id)}`);
  console.log(`  budget_hours: ${p.budget_hours ?? '—'}`);
  console.log(`  manager:      ${labelOrId((p as any).manager_name, p.project_manager_id)}`);
  console.log(`  owner:        ${labelOrId((p as any).owner_name, p.project_owner_id)}`);
}

export async function tasksCommand(idOrAbbr: string, opts: { json?: boolean }) {
  const project = await api.project(idOrAbbr);
  const env = await api.tasks(project.id);
  if (opts.json) {
    process.stdout.write(JSON.stringify(env.items, null, 2) + '\n');
    return;
  }
  console.log(kleur.bold(`tasks for ${project.project_abbr ?? project.id} — ${project.name}`));
  for (const t of env.items) {
    const billable = t.billable === 'Y' ? kleur.green('$') : kleur.dim('-');
    console.log(`  ${billable}  ${String(t.id).padStart(6)}  ${t.name ?? '(unnamed)'}`);
  }
  if (env.items.length === 0) console.log(kleur.dim('  no tasks'));
}
