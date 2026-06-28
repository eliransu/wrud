---
sidebar_position: 6
title: Resources
---

# Resources

- **Website** — [the landing page](https://site-ashy-iota-61.vercel.app)
- **GitHub** — [github.com/eliransu/wrud](https://github.com/eliransu/wrud) (source, issues, CHANGELOG)
- **npm** — [`@wrud/cli`](https://www.npmjs.com/package/@wrud/cli)
- **Provider prompts** — [`providers/`](https://github.com/eliransu/wrud/tree/main/providers) — paste into your assistant to set wrud up

## Quick reference

```bash
npx @wrud/cli                 # start the dashboard + server (viewer)
npx @wrud/cli install-hooks   # wire every installed agent (recorder)
npx @wrud/cli doctor          # verify capture works end-to-end
npx @wrud/cli cleanup         # remove everything wrud installed
```

## FAQ

**Does anything leave my machine?**
No. wrud is local-first: a Node server + one SQLite file at `~/.wrud/wrud.db`. The summary recap runs on your agent's own login (no API key, no egress) unless you opt into `WRUD_ANTHROPIC_KEY`.

**I ran `npx @wrud/cli` but nothing recorded.**
The bare command is only the viewer. You also need to [`install-hooks`](./cli#wrud-install-hooks) and **restart your agent** — recording is done by the agent's hooks pushing to the server.

**How do I remove it?**
`npx @wrud/cli cleanup` — strips the hooks, deletes `~/.wrud` and temp buffers, and edits shared agent config surgically (your own hooks are left intact).
