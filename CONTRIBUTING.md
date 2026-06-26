# Contributing to wrud

Thank you for your interest in contributing! wrud is a small, focused tool and we want to keep it that way - every addition should serve the four core questions in the README.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Layout](#project-layout)
- [The Contract First Rule](#the-contract-first-rule)
- [Running Checks](#running-checks)
- [Commit Style](#commit-style)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Proposing Features](#proposing-features)
- [Security Issues](#security-issues)

---

## Development Setup

**Prerequisites:** Node >= 20, npm >= 10.

```bash
git clone https://github.com/eliransu/wrud.git
cd wrud
npm install
npm run wrud
```

The dev launcher reads `.env` from the repo root if present. Useful overrides:

```
WRUD_DB=./wrud-dev.db
WRUD_PORT=8787
WRUD_ANTHROPIC_KEY=sk-...
```

---

## Project Layout

| Workspace         | Purpose                                                     |
| ----------------- | ----------------------------------------------------------- |
| `packages/shared` | Zod schemas, types, OpenAPI source (the contract)           |
| `packages/server` | Hono app, SQLite/Memory storage, auth, summarizer, insights |
| `packages/sdk`    | `@wrud/sdk` client + Claude Code hook adapter               |
| `packages/cli`    | Published `@wrud/cli` CLI                                   |
| `apps/platform`   | Ant Design dashboard (Vite + React)                         |
| `examples/`       | Reference hook scripts and a minimal SDK example            |
| `e2e/`            | Playwright end-to-end tests                                 |

---

## The Contract First Rule

**Change `packages/shared` first, then let everything else follow.**

All API shapes live in `packages/shared` as Zod schemas. They are the single source of truth for TypeScript types, runtime validation, and the generated OpenAPI spec.

---

## Running Checks

Run these before pushing. CI will reject PRs that fail any of them.

```bash
npm run typecheck
npm -w @wrud/platform run typecheck
npm test
npm run e2e
npm -w packages/cli run build
```

---

## Commit Style

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`

Scopes: `server`, `sdk`, `platform`, `cli`, `shared`, `e2e`, `oss`

Keep the summary under 72 characters, use the imperative mood, and reference issues in the footer: `Closes #42`.

---

## Pull Request Process

1. Fork the repository and create a branch from `main`.
2. Make your change - keep PRs focused; one logical change per PR.
3. Run all checks (see above) and fix any failures.
4. Write or update tests.
5. Open the PR against `main` using the PR template.
6. A maintainer will review within a few days.
7. Once approved, a maintainer will squash-merge.

### What we look for

- Does it stay within wrud's scope (the four core questions)?
- Does `packages/shared` change correctly if the API changes?
- Are adapters still swappable via DI?
- Is there a test?

---

## Reporting Bugs

Use the Bug report issue template. Please include the wrud version, Node version, OS, steps to reproduce, expected vs actual behaviour, and any relevant logs.

---

## Proposing Features

Use the Feature request issue template. Before opening, check whether the idea serves one of the four core questions in the README.

---

## Security Issues

Please do not open a public issue for security vulnerabilities. Follow the process in [SECURITY.md](SECURITY.md).

---

## Code of Conduct

All contributors are expected to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

---

_MIT (c) Eliran Suisa_
