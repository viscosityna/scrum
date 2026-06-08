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

- **Tokens** (Microsoft access + refresh tokens) are persisted encrypted at rest, via the OS-native data-protection API:
  - Windows — DPAPI (per-user scope). Ciphertext blob at `%APPDATA%\scrumtime-nodejs\tokens.dpapi`. Only the logged-in Windows user can decrypt.
  - macOS — Keychain (login keychain). Item visible via `security find-generic-password -s scrumtime-cli -a tokens`.
  - Linux — libsecret (requires `libsecret-tools` installed). Item visible via `secret-tool lookup service scrumtime-cli account tokens`.
- **No password is ever stored** — you authenticate against Microsoft directly. Only the OAuth tokens are cached.
- Older installs that wrote a plaintext `tokens.json` are migrated to the encrypted form transparently on the next command after upgrade. No re-login required.

---

## Using scrum from an AI agent

`scrum` is built to be called by AI agents the same way a human at a terminal calls it. Every read command supports `--json`; every write command exits 0 on success and prints the new entity's id. There is no separate MCP server — the agent's host process shells out to the binary, inherits the human's encrypted token cache, and gets the same data the human gets.

**One-time setup (the human runs this):**

```sh
scrum login
```

The agent runs in the same OS user's environment from then on. Token reads cost about 50-200 ms per command (OS keychain access).

**Recommended patterns:**

- **Discovery first.** Most agent flows start by asking what's available. `scrum projects --json` returns a typed list the agent can ground its next steps on. `scrum tasks <abbr> --json` gives the tasks under one project.
- **State reads use `--json`.** `scrum me --json`, `scrum time --from 2026-06-01 --to 2026-06-08 --json`, `scrum pto --json`. The non-JSON output is for humans and includes ANSI colour codes — do not parse it.
- **Writes are short and idempotent-shaped.** `scrum time log INTERN 4023 1.5 -n "weekly sync"` exits 0 on success and prints `logged 1.5h on 2026-06-08 (id 19xxxx)`. The id in that line is grep-able if the agent needs to reference or delete the row later. Backdated logs use `-d YYYY-MM-DD`.
- **Errors come back on stderr** with a clear short message. Exit code 1 means "command did not succeed" — no partial-success states the agent has to reason about.

**Anti-patterns:**

- Don't ask the agent to parse the table-style human output. Always pass `--json`.
- Don't bake the agent's authentication into the binary's first launch — let the human do the OAuth dance once, then the agent inherits the encrypted token. The CLI does not have a service-account flow on purpose.
- Don't loop `scrum me` to "check connectivity" — every call decrypts a token. Cache the result for the session if you need to refer to the calling user.

This is the build pattern I wrote up in [Your Oracle APEX app deserves a CLI](https://markuspg.com/blog/your-apex-app-deserves-a-cli). The scrumtime CLI is the working example: one binary, two audiences (humans and AI), one ORDS module behind it.

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
