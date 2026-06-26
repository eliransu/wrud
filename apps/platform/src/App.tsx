import { Layout, Menu, Button } from "antd";
import {
  DashboardOutlined,
  ApiOutlined,
  KeyOutlined,
  BulbOutlined,
} from "@ant-design/icons";
import {
  Routes,
  Route,
  useNavigate,
  useLocation,
  Navigate,
} from "react-router-dom";
import { AuthGate, useAuth } from "./auth";
import Overview from "./pages/Overview";
import Sessions from "./pages/Sessions";
import SessionDetail from "./pages/SessionDetail";
import Keys from "./pages/Keys";
import Lessons from "./pages/Lessons";

const items = [
  { key: "/", label: "Overview", icon: <DashboardOutlined /> },
  { key: "/sessions", label: "Sessions", icon: <ApiOutlined /> },
  { key: "/keys", label: "API Keys", icon: <KeyOutlined /> },
  { key: "/lessons", label: "Lessons", icon: <BulbOutlined /> },
];

const sectionEyebrow: Record<string, string> = {
  "/": "Mission control",
  "/sessions": "Telemetry",
  "/keys": "Access",
  "/lessons": "Memory",
};

export default function App() {
  const nav = useNavigate();
  const loc = useLocation();
  const { clear } = useAuth();
  const selected = "/" + (loc.pathname.split("/")[1] ?? "");

  return (
    <AuthGate>
      <Layout style={{ minHeight: "100vh" }}>
        <Layout.Sider width={232} theme="light">
          <div style={{ padding: "24px 20px 18px" }}>
            <div className="wd-brand">
              <img className="wd-mascot" src="/wrud-mascot.png" alt="" />
              wrud
            </div>
            <div className="wd-eyebrow" style={{ marginTop: 8 }}>
              What R U Doing
            </div>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[selected]}
            items={items}
            onClick={(e) => nav(e.key)}
          />
        </Layout.Sider>
        <Layout>
          <Layout.Header
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0 28px",
              background: "transparent",
            }}
          >
            <div className="wd-eyebrow">
              {sectionEyebrow[selected] ?? "wrud"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <Button size="small" onClick={clear}>
                Change key
              </Button>
            </div>
          </Layout.Header>
          <Layout.Content style={{ padding: "30px 28px 56px" }}>
            <div style={{ maxWidth: 1180, margin: "0 auto" }}>
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/sessions" element={<Sessions />} />
                <Route path="/sessions/:id" element={<SessionDetail />} />
                <Route path="/keys" element={<Keys />} />
                <Route path="/lessons" element={<Lessons />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </Layout.Content>
        </Layout>
      </Layout>
    </AuthGate>
  );
}
