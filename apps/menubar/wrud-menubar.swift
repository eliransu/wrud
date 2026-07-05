/**
 * wrud menu bar app - a thin native shell over the `wrud` CLI. No Electron, no deps.
 *   - record.circle icon in the macOS menu bar; filled = server running
 *   - Open Dashboard (keyed URL, same as the CLI banner)
 *   - Today section: sessions / tokens / est. cost from GET /v1/sessions?from=<midnight>
 *   - Start/Stop the server (start = `wrud -d` via a login shell; stop = SIGTERM by port,
 *     the exact behavior of `wrud stop`)
 *   - Launch at Login (SMAppService)
 *
 * `wrud-menubar --check` runs a headless self-check (health + today stats) and exits.
 * Build: ./build.sh  ->  dist/Wrud.app
 */
import AppKit
import ServiceManagement

let PORT = ProcessInfo.processInfo.environment["WRUD_PORT"].flatMap(Int.init) ?? 11190
let BASE = "http://localhost:\(PORT)"
let TOKEN_FILE = FileManager.default.homeDirectoryForCurrentUser
  .appendingPathComponent(".wrud/token")

func token() -> String? {
  guard let t = try? String(contentsOf: TOKEN_FILE, encoding: .utf8) else { return nil }
  let trimmed = t.trimmingCharacters(in: .whitespacesAndNewlines)
  return trimmed.isEmpty ? nil : trimmed
}

/** GET BASE+path, calling done(data) with nil on any failure. Short timeout - localhost. */
func get(_ path: String, timeout: TimeInterval = 3, done: @escaping (Data?) -> Void) {
  guard let url = URL(string: BASE + path) else { return done(nil) }
  var req = URLRequest(url: url, timeoutInterval: timeout)
  if let t = token() { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
  URLSession.shared.dataTask(with: req) { data, res, _ in
    let ok = (res as? HTTPURLResponse)?.statusCode == 200
    done(ok ? data : nil)
  }.resume()
}

struct TodayStats {
  var sessions = 0
  var tokensIn = 0
  var tokensOut = 0
  var costUsd = 0.0
}

struct SessionsPage: Decodable {
  struct Tokens: Decodable { let input: Int; let output: Int }
  struct Item: Decodable { let tokens: Tokens; let estCostUsd: Double? }
  let items: [Item]
  let total: Int
}

/** Start of today (local midnight) as a UTC ISO string the server's string compare understands. */
func todayFromISO() -> String {
  let f = ISO8601DateFormatter()
  f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return f.string(from: Calendar.current.startOfDay(for: Date()))
}

func fetchToday(done: @escaping (TodayStats?) -> Void) {
  // ponytail: sums the first 100 sessions (the API page cap); `total` stays exact.
  // Paginate with nextCursor if a single day ever exceeds 100 sessions.
  get("/v1/sessions?from=\(todayFromISO())&limit=100") { data in
    guard let data, let page = try? JSONDecoder().decode(SessionsPage.self, from: data)
    else { return done(nil) }
    var s = TodayStats(sessions: page.total)
    for it in page.items {
      s.tokensIn += it.tokens.input
      s.tokensOut += it.tokens.output
      s.costUsd += it.estCostUsd ?? 0
    }
    done(s)
  }
}

func fmtTokens(_ n: Int) -> String {
  if n >= 1_000_000 { return String(format: "%.1fM", Double(n) / 1_000_000) }
  if n >= 1_000 { return String(format: "%.1fk", Double(n) / 1_000) }
  return "\(n)"
}

/** Run a line through a login shell so PATH has nvm/homebrew node (Finder-launched apps don't). */
@discardableResult
func shell(_ line: String) -> Process {
  let p = Process()
  p.executableURL = URL(fileURLWithPath: "/bin/zsh")
  p.arguments = ["-lc", line]
  p.standardOutput = FileHandle.nullDevice
  p.standardError = FileHandle.nullDevice
  try? p.run()
  return p
}

// MARK: - headless self-check (`wrud-menubar --check`)

if CommandLine.arguments.contains("--check") {
  let sem = DispatchSemaphore(value: 0)
  var healthy = false
  get("/health", timeout: 2) { healthy = $0 != nil; sem.signal() }
  sem.wait()
  print("server : \(healthy ? "running" : "stopped") (\(BASE))")
  if healthy {
    var stats: TodayStats?
    fetchToday { stats = $0; sem.signal() }
    sem.wait()
    if let s = stats {
      print("today  : \(s.sessions) sessions, \(fmtTokens(s.tokensIn)) in / \(fmtTokens(s.tokensOut)) out, ~$\(String(format: "%.2f", s.costUsd))")
    } else {
      print("today  : stats unavailable (missing/expired token at \(TOKEN_FILE.path)?)")
      exit(1)
    }
  }
  exit(healthy ? 0 : 1)
}

// MARK: - menu bar app

final class App: NSObject, NSApplicationDelegate, NSMenuDelegate {
  let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
  let menu = NSMenu()

  let statusLine = NSMenuItem(title: "Checking…", action: nil, keyEquivalent: "")
  let openItem = NSMenuItem(title: "Open Dashboard", action: #selector(openDashboard), keyEquivalent: "o")
  let sessionsItem = NSMenuItem(title: "Sessions  —", action: nil, keyEquivalent: "")
  let tokensItem = NSMenuItem(title: "Tokens  —", action: nil, keyEquivalent: "")
  let costItem = NSMenuItem(title: "Est. cost  —", action: nil, keyEquivalent: "")
  let toggleItem = NSMenuItem(title: "Start Server", action: #selector(toggleServer), keyEquivalent: "")
  let loginItem = NSMenuItem(title: "Launch at Login", action: #selector(toggleLogin), keyEquivalent: "")

  var running = false

  func applicationDidFinishLaunching(_ n: Notification) {
    statusItem.button?.toolTip = "wrud"
    setIcon()

    let today = NSMenuItem(title: "Today", action: nil, keyEquivalent: "")
    for (item, target) in [
      (statusLine, nil), (openItem, self), (today, nil),
      (sessionsItem, nil), (tokensItem, nil), (costItem, nil),
      (toggleItem, self), (loginItem, self),
    ] as [(NSMenuItem, AnyObject?)] {
      item.target = target
      if target == nil { item.isEnabled = false }
    }
    for it in [sessionsItem, tokensItem, costItem] { it.indentationLevel = 1 }

    menu.autoenablesItems = false
    menu.delegate = self
    menu.items = [
      statusLine, openItem, .separator(),
      today, sessionsItem, tokensItem, costItem, .separator(),
      toggleItem, loginItem, .separator(),
      NSMenuItem(title: "Quit wrud", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"),
    ]
    statusItem.menu = menu

    refresh()
    Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { _ in self.refresh() }
  }

  func menuWillOpen(_ menu: NSMenu) { refresh() }

  /** Bold "W" drawn as a template image (matches the app icon); dimmed when stopped. */
  static let wIcon: NSImage = {
    let img = NSImage(size: NSSize(width: 18, height: 18), flipped: false) { rect in
      let str = NSAttributedString(
        string: "W",
        attributes: [
          .font: NSFont.systemFont(ofSize: 13, weight: .black),
          .foregroundColor: NSColor.black,
        ])
      let sz = str.size()
      str.draw(at: NSPoint(x: (rect.width - sz.width) / 2, y: (rect.height - sz.height) / 2))
      return true
    }
    img.isTemplate = true
    return img
  }()

  func setIcon() {
    statusItem.button?.image = App.wIcon
    statusItem.button?.appearsDisabled = !running
  }

  /** Poll health, then today's stats; update the menu in place (NSMenu updates while open). */
  func refresh() {
    get("/health", timeout: 2) { data in
      DispatchQueue.main.async {
        self.running = data != nil
        self.setIcon()
        self.statusLine.title = self.running ? "Running on localhost:\(PORT)" : "Stopped"
        self.openItem.isEnabled = self.running
        self.toggleItem.title = self.running ? "Stop Server" : "Start Server"
        if !self.running {
          for it in [self.sessionsItem, self.tokensItem, self.costItem] {
            it.title = it.title.components(separatedBy: "  ")[0] + "  —"
          }
          return
        }
        fetchToday { stats in
          guard let s = stats else { return }
          DispatchQueue.main.async {
            self.sessionsItem.title = "Sessions  \(s.sessions)"
            self.tokensItem.title = "Tokens  \(fmtTokens(s.tokensIn)) in · \(fmtTokens(s.tokensOut)) out"
            self.costItem.title = String(format: "Est. cost  $%.2f", s.costUsd)
          }
        }
      }
    }
    loginItem.state = SMAppService.mainApp.status == .enabled ? .on : .off
  }

  @objc func openDashboard() {
    var url = BASE + "/"
    if let t = token()?.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
      url += "?key=\(t)"
    }
    NSWorkspace.shared.open(URL(string: url)!)
  }

  @objc func toggleServer() {
    if running {
      // same behavior as `wrud stop`: SIGTERM whatever listens on the port
      shell("lsof -ti tcp:\(PORT) -sTCP:LISTEN | xargs kill 2>/dev/null")
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { self.refresh() }
    } else {
      // WRUD_CLI lets a dev point at a local build; everyone else gets wrud-on-PATH or npx
      shell("\"${WRUD_CLI:-wrud}\" -d 2>/dev/null || npx -y @wrud/cli -d")
      for delay in [1.0, 2.5, 5.0, 10.0, 20.0] {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { self.refresh() }
      }
    }
  }

  @objc func toggleLogin() {
    let svc = SMAppService.mainApp
    if svc.status == .enabled { try? svc.unregister() } else { try? svc.register() }
    loginItem.state = svc.status == .enabled ? .on : .off
  }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = App()
app.delegate = delegate
app.run()
