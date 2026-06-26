import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App as AntApp, ConfigProvider } from "antd";
import "antd/dist/reset.css";
import "./theme.css";
import { wrudTheme } from "./theme";
import App from "./App";
import { AuthProvider } from "./auth";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider theme={wrudTheme}>
      <AntApp>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
