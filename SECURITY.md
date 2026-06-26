# Security policy

## Reporting a vulnerability

Please report security issues privately via GitHub's
[private vulnerability reporting](https://github.com/eliransu/wrud/security/advisories/new)
rather than opening a public issue. We'll acknowledge and triage as quickly as we can.

## Threat model & known caveats

wrud is **local-first**: the default deployment is a Node server bound to localhost with a
local SQLite file. With that in mind:

- **API keys** are stored only as SHA-256 hashes; the plaintext is shown once at creation and
  never persisted. Keys are scoped (`ingest` / `read` / `admin`). Treat a key like a password.
- **`wrud_sk_local_...` keys grant access to your local server only.** They are still secrets -
  don't commit them. `.claude/` (which can hold local keys and command history) is gitignored.
- **Captured content is real, not redacted.** Hooks and the SDK record prompts, tool
  inputs/outputs, and assistant text (capped per field). Don't point wrud at sessions whose
  content you wouldn't store in a local database, and don't expose the server beyond localhost
  without adding your own transport security and access controls.
- **CORS** is restricted to configured origins (`WRUD_CORS_ORIGIN`); the dashboard's default
  origins are localhost only.
- **No egress.** wrud doesn't phone home. The only outbound call is the optional LLM narrator
  (`WRUD_ANTHROPIC_KEY`), which is off unless you set the key, and fails closed.

If you deploy wrud beyond your machine, you are responsible for authentication at the edge,
transport encryption, and storage hardening - those are explicitly out of scope for the
local-first defaults.
