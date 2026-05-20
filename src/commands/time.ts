import kleur from 'kleur';
import { api } from '../api.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export async function timeListCommand(opts: {
  date?: string;
  from?: string;
  to?: string;
  project?: string;
  json?: boolean;
}) {
  let from: string | undefined;
  let to: string | undefined;
  if (opts.date) {
    from = opts.date;
    to = opts.date;
  } else {
    from = opts.from ?? weekStart();
    to = opts.to ?? today();
  }

  const projectId = opts.project ? (await api.project(opts.project)).id : undefined;
  const env = await api.timesheets({ from, to, project_id: projectId });

  if (opts.json) {
    process.stdout.write(JSON.stringify(env.items, null, 2) + '\n');
    return;
  }

  if (env.items.length === 0) {
    console.log(kleur.dim(`no entries from ${from} to ${to}`));
    return;
  }

  const total = env.items.reduce((s, e) => s + (e.hours ?? 0), 0);
  console.log(kleur.bold(`${from} → ${to}  (${env.items.length} entries, ${total.toFixed(2)}h)`));
  for (const e of env.items) {
    const date = e.date.slice(0, 10);
    console.log(`  ${date}  ${String(e.hours).padStart(5)}h  task#${e.task_id}  ${kleur.dim(e.notes ?? '')}`);
  }
}

export async function timeLogCommand(args: { project: string; task: string; hours: string; note?: string }) {
  const project = await api.project(args.project);

  const taskId = /^\d+$/.test(args.task)
    ? Number(args.task)
    : await resolveTaskByName(project.id, args.task);
  const hours = Number(args.hours);
  if (!Number.isFinite(hours) || hours <= 0) {
    console.error(kleur.red(`invalid hours: ${args.hours}`));
    process.exit(2);
  }

  const entry = await api.logTime({
    task_id: taskId,
    hours,
    input_date: today(),
    notes: args.note,
  });
  console.log(kleur.green(`logged ${hours}h on ${entry.date} (id ${entry.id})`));
}

export async function timeDeleteCommand(id: string) {
  await api.deleteTime(Number(id));
  console.log(kleur.green(`deleted entry ${id}`));
}

async function resolveTaskByName(projectId: number, name: string): Promise<number> {
  const env = await api.tasks(projectId);
  const exact = env.items.find(t => (t.name ?? '').toLowerCase() === name.toLowerCase());
  if (exact) return exact.id;
  const candidates = env.items.filter(t => (t.name ?? '').toLowerCase().includes(name.toLowerCase()));
  if (candidates.length === 1) return candidates[0]!.id;
  if (candidates.length > 1) {
    console.error(kleur.red(`ambiguous task "${name}". candidates:`));
    for (const c of candidates) console.error(`  ${c.id}  ${c.name}`);
    process.exit(2);
  }
  console.error(kleur.red(`no task matching "${name}" on project ${projectId}`));
  process.exit(2);
}
