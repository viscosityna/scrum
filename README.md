# scrum — command line for scrumtime

```
$ scrum me
MPEREIRA  (Marco Pereira)
  id:        260
  role:      manager
  pto hours: 82

$ scrum time
2026-06-01 → 2026-06-02  (2 entries, 16.00h)
  2026-06-02      8h  task#6008  ...

$ scrum time log INTERN 4023 1.5 -n "weekly team sync"
logged 1.5h on 2026-06-02 (id 190104)
```

---

## ⚡ Install in 30 seconds

**You don't need to clone this repo. You don't need Node. Just paste the command for your OS in a terminal.**

### macOS / Linux (Terminal):

```sh
curl -fsSL https://raw.githubusercontent.com/viscosityna/scrum/main/install.sh | sh
```

### Windows (PowerShell):

```powershell
iwr -useb https://raw.githubusercontent.com/viscosityna/scrum/main/install.ps1 | iex
```

> The script downloads the right binary for your machine, drops it in `~/.scrum/bin/scrum` (Windows: `%USERPROFILE%\.scrum\bin\scrum.exe`), adds that folder to your PATH, and clears macOS's quarantine flag so Gatekeeper doesn't bounce the first run. Total: ~5 seconds, no admin rights needed.

**After it finishes**, open a **new** terminal (so PATH refreshes) and run:

```
scrum login
```

A browser opens for Viscosity Microsoft sign-in. After that you're in.

---

## What you need

- A Viscosity Microsoft account (`@viscosityna.com`). No per-user setup needed; just sign in.
- A scrumtime employee record under your `@viscosityna.com` email. (If you've used scrumtime in the web before, you have one.)

If sign-in succeeds but `scrum me` says "no scrumtime employee record was found", ping `@MarcoVNA` on Teams — your email may not match an existing record.

---

## What scrum can do

| | |
|---|---|
| `scrum me` | your employee row + role (self/manager/admin) |
| `scrum projects` | **your active projects** |
| `scrum projects --all` | every active project you can see |
| `scrum projects --include-closed` | also show closed/inactive projects |
| `scrum projects -q PARTIAL` | search by name |
| `scrum project <ABBR>` | details for one project |
| `scrum tasks <ABBR>` | tasks on a project |
| `scrum time` | your last 14 days of entries |
| `scrum time -d 2026-06-01` | one day |
| `scrum time --from 2026-05-01 --to 2026-05-31` | a date range |
| `scrum time log <ABBR> <task_id> <hours> -n "note"` | log time today |
| `scrum time delete <id>` | delete one of your entries |
| `scrum pto` | PTO balance + anniversary |
| `scrum logout` | clear cached tokens |
| `scrum update` | check for a newer release |
| `scrum config` | show current CLI config |

Add `--json` to most commands for machine-readable output.

---

## Updating

```sh
scrum update
```

That prints the latest version and, if newer, the exact command to update (which is just re-running the install one-liner above). Idempotent — overwrites the binary in place.

---

## Troubleshooting

| Symptom | What to try |
|---|---|
| `scrum: command not found` after install | Open a **new** terminal window (the install script added `~/.scrum/bin` to your PATH for new shells). On macOS, run `source ~/.zshrc` (or `~/.bashrc`) in the same terminal. |
| `scrum login` → "no scrumtime employee record was found" | Your `@viscosityna.com` email isn't in scrumtime. Ping `@MarcoVNA`. |
| `scrum login` → "Only viscosityna.com accounts are accepted" | You signed in with a personal Microsoft account instead of your work one. |
| `scrum time log` → "you are not a resource on this task's project" | You're not assigned to that project in scrumtime. Have your PM add you. |
| Anything else | `scrum debug token` shows what the server sees about your identity (no secrets in the output). |

---

## Where things live

- **Tokens** (Microsoft access + refresh tokens) cache in a per-user config file:
  - Windows — `%APPDATA%\scrumtime-nodejs\tokens.json`
  - macOS — `~/Library/Preferences/scrumtime-nodejs/tokens.json`
  - Linux — `~/.config/scrumtime-nodejs/tokens.json`
- **No password is ever stored** — you authenticate against Microsoft directly.

---

## For contributors only (rest of you can stop reading)

```
git clone https://github.com/viscosityna/scrum.git
cd scrum
npm install
npm run build
npm link
```

How auth works under the hood: the CLI does Microsoft Entra OAuth2 (auth-code + PKCE), sends the access token to a Cloudflare Worker BFF that validates it and exchanges it for an ORDS bearer, then forwards to the scrumtime ORDS API with the validated UPN as a `?upn=` param. See [internal/scrumtime/ARCHITECTURE.md](https://github.com/Markuspg1/internal/blob/main/scrumtime/ARCHITECTURE.md) (Viscosity-internal repo) for the full picture.

Report bugs at https://github.com/viscosityna/scrum/issues, or ping `@MarcoVNA` on Teams.
