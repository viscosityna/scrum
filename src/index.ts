#!/usr/bin/env node
import { Command } from 'commander';
import kleur from 'kleur';
import { ApiError } from './api.js';
import { loginCommand, logoutCommand } from './commands/login.js';
import { meCommand } from './commands/me.js';
import { projectsCommand, projectCommand, tasksCommand } from './commands/projects.js';
import { timeListCommand, timeLogCommand, timeDeleteCommand } from './commands/time.js';
import { debugTokenCommand } from './commands/debug.js';

const program = new Command();

program
  .name('scrum')
  .description('CLI for scrumtime (Viscosity NA timesheet/project app)')
  .version('0.0.1');

program
  .command('login')
  .description('sign in via browser OAuth (Microsoft Entra)')
  .action(loginCommand);

program.command('logout').description('clear cached tokens').action(logoutCommand);

program
  .command('me')
  .description('show the authenticated employee')
  .option('--json', 'output JSON')
  .action(meCommand);

program
  .command('projects')
  .description('list projects')
  .option('-a, --all', 'show all visible projects (default: only those you are a resource on)')
  .option('--active', 'filter to status=active (status IDs are TODO in the SQL handler)')
  .option('-q <query>', 'filter by name substring')
  .option('--json', 'output JSON')
  .action(projectsCommand);

program
  .command('project <idOrAbbr>')
  .description('show one project by id or abbreviation')
  .option('--json', 'output JSON')
  .action(projectCommand);

program
  .command('tasks <projectIdOrAbbr>')
  .description('list tasks for a project')
  .option('--json', 'output JSON')
  .action(tasksCommand);

const time = program.command('time').description('timesheet entries');

time
  .command('list', { isDefault: true })
  .description('list entries (default: this week)')
  .option('-d, --date <YYYY-MM-DD>', 'a single day')
  .option('--from <YYYY-MM-DD>', 'range start')
  .option('--to <YYYY-MM-DD>', 'range end')
  .option('-p, --project <idOrAbbr>', 'filter to one project')
  .option('--json', 'output JSON')
  .action(timeListCommand);

time
  .command('log <project> <task> <hours>')
  .description('log time on a task today')
  .option('-n, --note <note>', 'add notes')
  .action((project, task, hours, opts) => timeLogCommand({ project, task, hours, note: opts.note }));

time
  .command('delete <id>')
  .description('delete a time entry by id')
  .action(timeDeleteCommand);

const debug = program.command('debug').description('debugging helpers');
debug
  .command('token')
  .description('decode and print the access token claims (sanity-check what ORDS sees)')
  .action(debugTokenCommand);

program.parseAsync(process.argv).catch(err => {
  if (err instanceof ApiError) {
    console.error(kleur.red(err.message));
    if (err.detail) console.error(kleur.gray(err.detail));
    process.exit(1);
  }
  console.error(kleur.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
