#!/usr/bin/env node
import { Command } from 'commander';
import kleur from 'kleur';
import pkg from '../package.json' with { type: 'json' };
import { ApiError } from './api.js';
import { loginCommand, logoutCommand, configCommand } from './commands/login.js';
import { meCommand } from './commands/me.js';
import { projectsCommand, projectCommand, tasksCommand } from './commands/projects.js';
import { timeListCommand, timeLogCommand, timeDeleteCommand } from './commands/time.js';
import { debugTokenCommand } from './commands/debug.js';
import {
  ptoBalanceCommand,
  ptoRequestCommand,
  ptoRequestsCommand,
  ptoApproveCommand,
  ptoDeclineCommand,
} from './commands/pto.js';
import { employeesCommand } from './commands/employees.js';
import { reportProjectCommand, reportTeamCommand } from './commands/report.js';
import { updateCommand } from './commands/update.js';

const program = new Command();

program
  .name('scrum')
  .description('CLI for scrumtime (Viscosity NA timesheet/project app)')
  .version(pkg.version);

program
  .command('login')
  .description('sign in via browser OAuth (Microsoft Entra)')
  .action(loginCommand);

program.command('logout').description('clear cached tokens').action(logoutCommand);

program
  .command('config')
  .description('show current CLI configuration (no secrets)')
  .option('--json', 'output JSON')
  .action(configCommand);

program
  .command('me')
  .description('show the authenticated employee (or another via --for, manager-only)')
  .option('--json', 'output JSON')
  .option('--for <username>', 'manager/admin: show another employee instead')
  .action(meCommand);

program
  .command('projects')
  .description('list YOUR active projects')
  .option('-a, --all', 'show all visible projects (default: only those you are a resource on)')
  .option('--include-closed', 'include closed / inactive projects (default: active only)')
  .option('-q <query>', 'filter by name substring')
  .option('--for <username>', "manager/admin: list this employee's projects instead")
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
  .option('--for <username>', "manager/admin: list this employee's entries instead")
  .option('--json', 'output JSON')
  .action(timeListCommand);

time
  .command('log <project> <task> <hours>')
  .description('log time on a task (today by default; use -d for a different date)')
  .option('-n, --note <note>', 'add notes')
  .option('-d, --date <YYYY-MM-DD>', 'log on this date instead of today')
  .action((project, task, hours, opts) => timeLogCommand({ project, task, hours, note: opts.note, date: opts.date }));

time
  .command('delete <id>')
  .description('delete a time entry by id')
  .action(timeDeleteCommand);

const pto = program.command('pto').description('PTO balance + requests');

pto
  .command('balance', { isDefault: true })
  .description('show your PTO balance (or someone else\'s via --for, manager-only)')
  .option('--json', 'output JSON')
  .option('--for <username>', "manager/admin: show this employee's PTO balance instead")
  .action(ptoBalanceCommand);

pto
  .command('request <hours> <date> [reason]')
  .description(
    'submit a PTO request (hours = 4 half-day or 8 full-day; date = YYYY-MM-DD)',
  )
  .option('--to <YYYY-MM-DD>', 'last day of a multi-day request (default: same as <date>)')
  .option('--type <name>', 'vacation | unpaid | medical | other (default: vacation)')
  .option('-n, --note <note>', 'optional reason — overrides the [reason] positional')
  .option('--count-weekends', 'include Sat/Sun in the request (default: skip weekends)')
  .option('--json', 'output JSON')
  .action((hours, date, reason, opts) =>
    ptoRequestCommand(hours, date, reason, opts),
  );

pto
  .command('requests')
  .description('list PTO requests (default: org-wide pending — manager/admin only)')
  .option(
    '--status <name|csv>',
    'pending (default) | new | in_review | approved | declined | closed | all | <csv of ids>',
  )
  .option('--all', 'shorthand for --status all')
  .option('--for <username>', 'filter to this requestor (manager-only if not yourself)')
  .option('--approver <username>', 'filter to this approver (manager-only if not yourself)')
  .option('--mine', 'requests routed to you for approval (alias for --approver <self>)')
  .option('--json', 'output JSON')
  .action(ptoRequestsCommand);

pto
  .command('approve <request_id>')
  .description('approve a PTO request (manager/admin only)')
  .option('-n, --note <note>', 'optional note attached to the approval')
  .option('--json', 'output JSON')
  .action((id, opts) => ptoApproveCommand(id, opts));

pto
  .command('decline <request_id>')
  .description('decline a PTO request (manager/admin only)')
  .option('-n, --note <note>', 'optional reason attached to the decline')
  .option('--json', 'output JSON')
  .action((id, opts) => ptoDeclineCommand(id, opts));

const report = program
  .command('report')
  .description('manager reports (manager/admin only)');

report
  .command('project <idOrAbbr>')
  .description('actuals vs budget + by-resource breakdown for one project')
  .option('--json', 'output JSON')
  .action(reportProjectCommand);

report
  .command('team')
  .description('weekly hours summary (org-wide or one employee via --for)')
  .option('--week <YYYY-MM-DD>', 'anchor to the week containing this date (default: this week)')
  .option('--for <username>', 'limit to one employee')
  .option('--json', 'output JSON')
  .action(reportTeamCommand);

program
  .command('employees')
  .description('list employees (manager/admin only)')
  .option('-q <query>', 'filter by name / email / username substring')
  .option('--include-inactive', 'include inactive employees (default: active only)')
  .option('--json', 'output JSON')
  .action(employeesCommand);

program
  .command('update')
  .description('check for a newer version (prints the command to update)')
  .option('--json', 'output JSON')
  .action(updateCommand);

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
