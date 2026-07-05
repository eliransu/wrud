# wrud menu bar app (macOS)

A native menu bar shell over the `wrud` CLI — no Electron, no dependencies, one Swift file.

- **record icon** in the menu bar: filled = server running, outline = stopped
- **Open Dashboard** — opens the keyed dashboard URL in your browser
- **Today** — sessions, tokens in/out, and estimated cost for today
- **Start / Stop Server** — start runs `wrud -d` (falls back to `npx -y @wrud/cli -d`;
  set `WRUD_CLI` to point at a local build), stop SIGTERMs the port like `wrud stop`
- **Launch at Login** — registers via SMAppService (macOS 13+)

## Build & run

```sh
./build.sh          # needs Xcode Command Line Tools (swiftc)
open dist/Wrud.app
```

Headless smoke test: `dist/Wrud.app/Contents/MacOS/wrud-menubar --check`
prints server state + today's stats and exits non-zero if unhealthy.

Respects `WRUD_PORT` (default 11190); reads the dashboard token from `~/.wrud/token`.
