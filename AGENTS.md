# Agent handoff — scrumtime CLI

Short orientation note for the next AI agent picking this repo up on a different machine. Read this first, then dive in.

## What this repo is

The `scrum` CLI for [Viscosity NA scrumtime](https://www.viscosityna.com). A standalone Node 22 SEA binary that talks to a Cloudflare Worker BFF, which in turn talks to ORDS at `prodapx.apxpubnet.apxvcn.oraclevcn.com`. Distributed via GitHub Releases on this repo; `viscosityna/scrum` is the canonical origin. Users install with a one-liner from the README.

Architecture, BFF + ORDS internals, and Microsoft Entra JWT validation live in the **internal** sibling repo at `Markuspg1/internal` → `scrumtime/` folder. That repo is where the SQL handlers and the Worker source live; this repo is just the CLI surface.

## How to find Marco's broader context

This repo is normally checked out under Marco's workspace at `c:\Users\Marco\Documents\context\scrumtime-cli\` (Windows). The parent `context/` folder has a top-level `CLAUDE.md` that's the entry point for everything Marco works on. If you have access to that filesystem, read it. If you're on a different box (a fresh checkout, no sibling folders), the codebase + this file are self-sufficient.

## Latest state — 2026-06-11

**Last release tag: `v0.1.17`** (committed locally; pushed to origin in the same session this file was added). It closes P2.1 of [internal/scrumtime/cli/UPGRADES.md](https://github.com/Markuspg1/internal/blob/main/scrumtime/cli/UPGRADES.md) — adds `scrum pto request <hours> <date> [reason]` plus a sibling ORDS handler at `POST /api/v1/pto/request`.

The SQL handler ([v2_pto_request.sql](https://github.com/Markuspg1/internal/blob/main/scrumtime/sql/v2_pto_request.sql) in the sibling repo) was applied to the live `scrumtm` schema on the same day. It writes to three tables — `HR_TIMEOFF_REQUESTS` (parent), `HR_TIMEOFF_REQUEST_DETAILS` (one row per business day), `HR_TIMEOFF_REQUEST_NOTES` (optional reason) — in one transaction.

## Backlog state

All of Kevin Herrarte's 2026-06-04 review feedback is now shipped:

| Item | State |
|---|---|
| P0.1 binary integrity (SHA256 + checksums.txt) | shipped v0.1.11/12 |
| P0.2 token encryption (DPAPI / Keychain / libsecret) | shipped v0.1.13/14 |
| P1.1 project labels (FK → human names) | shipped v0.1.15/16 + SQL |
| P1.2 hide internal-only flags (`active`, `pto_admin`) | shipped v0.1.15 |
| P2.1 PTO request | shipped v0.1.17 + SQL |
| P2.2 AI-agent docs in README | shipped doc-only |

There is no other written backlog. New work would come from a fresh user request — most likely a Teams ping to Marco / `@MarcoVNA`.

## Open verification

The DPAPI/Keychain/libsecret token migration from v0.1.13 was tested on Marco's primary Windows machine. **Mac side-test still pending** as of this writing — Marco said he'd run it when next on Mac hardware. If you see this note and a Mac smoke test has not been logged anywhere, ask before assuming the migration is fully proven on macOS.

## Two gh accounts — heads up

The remotes here mix `viscosityna/scrum` (the origin, Viscosity-internal) with `Markuspg1/scrumtime-cli` (Marco's personal mirror). Pushes to either work, but **CI builds only fire on `viscosityna/scrum` tags**. The local git identity is `marco.pereira@viscosityna.com` / `MarcoVNA` and must stay that way for commits in this repo. Marco runs two `gh auth` profiles; switch to `MarcoVNA` for push operations and switch back to `Markuspg1` when done.

## How releases work

Push a `vX.Y.Z` tag to `viscosityna/scrum`. The `release.yml` workflow:

1. Bakes the tag version into `package.json` at build time (so `--version` reads correctly).
2. Builds four binaries via Node SEA: `scrum-linux-x64`, `scrum-macos-x64`, `scrum-macos-arm64`, `scrum-win-x64.exe`.
3. Computes SHA256 for each, assembles `checksums.txt`.
4. Publishes a GitHub Release with all five assets.

The install scripts ([install.sh](install.sh), [install.ps1](install.ps1)) download the binary + `checksums.txt`, verify, install to `~/.scrum/bin/`, add to PATH, and clear macOS quarantine. Both scripts are byte[]-aware and CRLF-tolerant — do not "simplify" the response-parsing or weekend-line-splitting code without re-testing across all three OSes.
