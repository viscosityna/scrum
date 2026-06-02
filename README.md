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

- **A Viscosity Microsoft account.** Any `@viscosityna.com` Microsoft sign-in works — no per-user role setup.
  You also need a scrumtime employee record under your `@viscosityna.com` email; if you've never been logged into scrumtime, you may not have one yet — message the scrumtime admin.
- **GitHub access** to [`viscosityna/scrumtime-cli`](https://github.com/viscosityna/scrumtime-cli). All Viscosity org members should have it; if you don't, ping `@MarcoVNA`.

## Install

Two paths:

### A. Download a prebuilt binary (no Node needed)

Head to **[Releases](https://github.com/viscosityna/scrumtime-cli/releases/latest)** → Assets, grab the one for your OS:

| | |
|---|---|
| Windows | `scrum-win-x64.exe` |
| macOS (Apple Silicon) | `scrum-macos-arm64` |
| macOS (Intel) | `scrum-macos-x64` |
| Linux | `scrum-linux-x64` |

Rename to `scrum` (or `scrum.exe` on Windows), drop it somewhere on your `PATH`, make it executable on macOS/Linux (`chmod +x scrum`).

On **macOS**, first run will trigger Gatekeeper; right-click → Open → "Open anyway" once. After that it runs normally.

### B. From source (if you have Node 20+ or want to contribute)

```
git clone https://github.com/viscosityna/scrumtime-cli.git
cd scrumtime-cli
npm install
npm run build
npm link            # exposes `scrum` globally
```

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

If you see *"no scrumtime employee record was found for your account"* — you signed in fine, you just don't have an employee row under your `@viscosityna.com` email in scrumtime. Message the scrumtime admin to confirm your record. (If you only see *"Only viscosityna.com accounts are accepted"*, you signed in with a personal Microsoft account instead of your work account.)

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
| `scrum login` → "no scrumtime employee record was found" | Your `@viscosityna.com` email isn't in `SCT_EMPLOYEES`. Message the scrumtime admin. |
| `scrum login` → "Only viscosityna.com accounts are accepted" | You signed in with a personal Microsoft account; use your work account instead. |
| `scrum login` browser doesn't open | Copy the URL from the terminal and paste it into a browser. The local listener will still catch the redirect. |
| `GET /me → 401 Unauthorized` after some time | Tokens may have expired. Run `scrum logout && scrum login` to refresh. |
| `scrum time log` returns `403 you are not a resource on this task's project` | You're not assigned as a resource on the project the task belongs to. Have your PM add you in scrumtime. |
| Anything else | `scrum debug token` shows you the current Microsoft token's claims (without printing the token itself). |

## Report bugs / feedback

File an issue at https://github.com/viscosityna/scrumtime-cli/issues, or message `@MarcoVNA` on Slack/Teams.
