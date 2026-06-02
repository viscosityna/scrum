# scrum

Command-line client for [scrumtime](https://apps.viscosityna.com/ords/f?p=112), Viscosity NA's internal timesheet/project app.

```
$ scrum me
MPEREIRA  (Marco Pereira)
  id:        260
  role:      manager
  pto hours: 82

$ scrum projects
AMP      AMP Support
INTERN   Internal
MS       Managed Services
...

$ scrum time
2026-06-01 → 2026-06-02  (2 entries, 16.00h)
  2026-06-02      8h  task#6008  Started implementing remedial action subtype...

$ scrum time log INTERN 4023 1.5 -n "weekly team sync"
logged 1.5h on 2026-06-02 (id 190104)
```

## Prerequisites

- **Node.js 20+** ([download](https://nodejs.org/)).
- **A Viscosity Microsoft account** that's been assigned the `scrumtime user` app role.
  Ask Marco (or whoever holds the "scrumtime API" Entra app registration) to add you under
  *Entra → Enterprise applications → scrumtime API → Users and groups*. Without this, sign-in succeeds but every API call returns 403.
- **GitHub access** to the [private repo](https://github.com/Markuspg1/scrumtime-cli) (ask Marco).

## Install

```
git clone https://github.com/Markuspg1/scrumtime-cli.git
cd scrumtime-cli
npm install
npm run build
npm link            # exposes `scrum` globally on this machine
```

(`npm link` requires permission to write to your global `node_modules`. If you'd rather not, run via `node dist/index.js …` from inside the cloned directory.)

## First-run

```
scrum login
```

Your default browser opens at Microsoft's sign-in page. If you're already signed into Microsoft 365 in that browser, sign-in is silent and you'll be redirected straight back to a `localhost` page that says "Signed in." Otherwise complete the Microsoft prompt as usual.

Expected terminal output:
```
signed in as YOURUSERNAME — role: self
```

`role` will be `self`, `manager` (if you appear as PM/owner/account on any project), or `admin`.

If you instead see *"Microsoft sign-in succeeded, but you do not have access to scrumtime"* — the role hasn't been assigned yet. Send the message to the scrumtime admin.

## Common commands

| | |
|---|---|
| `scrum me` | show your employee row + current role |
| `scrum projects` | projects you're a resource on |
| `scrum projects --all` | all projects you can see |
| `scrum projects --active` | filter to active status |
| `scrum projects -q PARTIAL` | search by name |
| `scrum project <ABBR>` | show one project |
| `scrum tasks <ABBR>` | list tasks on a project |
| `scrum time` | your last 14 days of entries |
| `scrum time -d 2026-06-01` | one day's entries |
| `scrum time --from 2026-05-01 --to 2026-05-31` | a date range |
| `scrum time log <ABBR> <task_id> <hours> -n "note"` | log time today |
| `scrum time delete <id>` | delete a time entry of yours |
| `scrum pto` | PTO balance + anniversary |
| `scrum logout` | clear cached tokens |
| `scrum config` | show current CLI configuration |

Add `--json` to most commands for machine-readable output.

## Where your data lives

- **Tokens** (Microsoft access + refresh tokens) cache in a per-user config file:
  - Windows — `%APPDATA%\scrumtime-nodejs\tokens.json`
  - macOS — `~/Library/Preferences/scrumtime-nodejs/tokens.json`
  - Linux — `~/.config/scrumtime-nodejs/tokens.json`
- **CLI config** (your username) sits in `config.json` in the same dir.
- **No password is ever stored** — you authenticate against Microsoft directly.

## How auth works (one paragraph)

The CLI does an OAuth2 authorization-code + PKCE flow against your Microsoft Entra tenant. The access token Microsoft issues is sent to a small Cloudflare Worker (`scrumtime-api.devops-1e0.workers.dev`) that validates it against Microsoft's public keys, then forwards your request to the scrumtime ORDS API with a short-lived shared bearer token — so your identity flows through to the SQL handlers, but no per-user secret ever lives on your laptop or in transit. See [internal/scrumtime/ARCHITECTURE.md](https://github.com/Markuspg1/internal/blob/main/scrumtime/ARCHITECTURE.md) in the ops repo for the full picture.

## Troubleshooting

| Symptom | What to try |
|---|---|
| `scrum login` → "Microsoft sign-in succeeded, but you do not have access" | The `scrumtime user` app role isn't assigned to you yet. Message the scrumtime admin. |
| `scrum login` browser doesn't open | Copy the URL from the terminal and paste it into a browser. The local listener will still catch the redirect. |
| `GET /me → 401 Unauthorized` after some time | Tokens may have expired. Run `scrum logout && scrum login` to refresh. |
| `scrum time log` returns `403 you are not a resource on this task's project` | You're not assigned as a resource on the project the task belongs to. Have your PM add you in scrumtime. |
| Anything else | `scrum debug token` shows you the current Microsoft token's claims (without printing the token itself). |

## Report bugs / feedback

File an issue at https://github.com/Markuspg1/scrumtime-cli/issues, or message Marco directly.
