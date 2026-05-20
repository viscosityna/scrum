# scrum

CLI for [scrumtime](https://apps.viscosityna.com/ords/f?p=112), Viscosity NA's internal timesheet/project app.

## Install

```
git clone <repo> scrumtime-cli && cd scrumtime-cli
npm install
npm run build
npm link            # exposes `scrum` globally
```

## First-time setup

```
scrum login --client-id <oauth_client_id>
```

The `--client-id` is needed once; thereafter the value is stored in your config and `scrum login` is enough. Ask an admin if you don't have it (it's the value from `SELECT client_id FROM user_ords_clients WHERE name = 'scrumtime-cli'` in the scrumtm schema).

`scrum login` opens your browser to the Microsoft sign-in page (Viscosity NA tenant). After you sign in, Microsoft redirects to a local port the CLI is listening on, completes the OAuth2 authorization-code + PKCE exchange, and stores the access + refresh tokens in a per-user config file:

- Windows — `%APPDATA%\scrumtime-nodejs\tokens.json`
- macOS — `~/Library/Preferences/scrumtime-nodejs/tokens.json`
- Linux — `~/.config/scrumtime-nodejs/tokens.json`

The CLI never sees or stores your password. Tokens are protected by per-user filesystem permissions; access tokens are short-lived (Microsoft rotates them).

## Usage

```
scrum me                                       # show authenticated employee + role (self/manager/admin)
scrum projects                                 # projects you're a resource on
scrum projects --all                           # all projects you can see (role-scoped server-side)
scrum project <ABBR>                           # one project (by abbr or id)
scrum tasks <ABBR>                             # tasks of a project
scrum time                                     # this week's entries (yours)
scrum time --date 2026-05-19                   # one day
scrum time log <project> <task> <hours> [-n "note"]
scrum time delete <id>
scrum logout                                   # clear cached tokens
```

## Config location

`api_base`, `client_id`, OAuth URLs, etc. are hardcoded to the Viscosity NA tenant. The per-user config dir just caches the signed-in `username` so `scrum me` can tell you whether you need to re-login. Tokens live in a separate `tokens.json` in the same directory.

## Authorization

The CLI doesn't enforce permissions client-side; the server is the source of truth. `scrum me` shows your effective role (`self` / `manager` / `admin`), and the CLI uses it only to hide commands that would always return 403 for your role.

See [internal/scrumtime/AUTHORIZATION.md](../internal/scrumtime/AUTHORIZATION.md) for the full permission matrix.
