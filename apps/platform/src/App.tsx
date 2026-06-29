import { Layout, Menu, Button } from "antd";
import {
  DashboardOutlined,
  ApiOutlined,
  KeyOutlined,
  BulbOutlined,
  BarChartOutlined,
} from "@ant-design/icons";
import {
  Routes,
  Route,
  useNavigate,
  useLocation,
  Navigate,
} from "react-router-dom";
import { AuthGate, useAuth } from "./auth";
import { useThemeMode } from "./theme-mode";
import Overview from "./pages/Overview";
import Sessions from "./pages/Sessions";
import SessionDetail from "./pages/SessionDetail";
import Reports from "./pages/Reports";
import Keys from "./pages/Keys";
import Lessons from "./pages/Lessons";

const items = [
  { key: "/", label: "Overview", icon: <DashboardOutlined /> },
  { key: "/sessions", label: "Sessions", icon: <ApiOutlined /> },
  { key: "/reports", label: "Reports", icon: <BarChartOutlined /> },
  { key: "/keys", label: "API Keys", icon: <KeyOutlined /> },
  { key: "/lessons", label: "Lessons", icon: <BulbOutlined /> },
];

function ThemeToggle() {
  const { mode, toggle } = useThemeMode();
  return (
    <Button
      size="small"
      type="text"
      onClick={toggle}
      aria-label={
        mode === "dark" ? "Switch to light theme" : "Switch to dark theme"
      }
      icon={
        mode === "dark" ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
          </svg>
        )
      }
    />
  );
}

export default function App() {
  const nav = useNavigate();
  const loc = useLocation();
  const { clear } = useAuth();
  const selected = "/" + (loc.pathname.split("/")[1] ?? "");

  return (
    <AuthGate>
      <Layout style={{ minHeight: "100vh" }}>
        <header className="wd-topbar">
          <div className="wd-topbar-inner">
            <div
              className="wd-brand"
              onClick={() => nav("/")}
              style={{ cursor: "pointer", flex: "none" }}
            >
              <img className="wd-mascot" src="/wrud-mascot.png" alt="" />
              wrud
            </div>
            <Menu
              className="wd-nav"
              mode="horizontal"
              selectedKeys={[selected]}
              items={items}
              onClick={(e) => nav(e.key)}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flex: "none",
              }}
            >
              <ThemeToggle />
              <Button size="small" onClick={clear}>
                Change key
              </Button>
            </div>
          </div>
        </header>
        <Layout.Content style={{ padding: "30px 28px 56px" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/sessions/:id" element={<SessionDetail />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/keys" element={<Keys />} />
              <Route path="/lessons" element={<Lessons />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </Layout.Content>
      </Layout>
    </AuthGate>
  );
}
