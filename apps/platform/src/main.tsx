import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App as AntApp } from "antd";
import "antd/dist/reset.css";
// Self-hosted fonts (bundled woff2, served from 'self') - the CSP forbids egress, so we can't
// @import Google Fonts. These register "<Name> Variable" families used in theme.css.
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/hanken-grotesk";
import "@fontsource-variable/bricolage-grotesque";
import "./theme.css";
import { ThemeProvider } from "./theme-mode";
import App from "./App";
import { AuthProvider } from "./auth";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AntApp>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </AntApp>
    </ThemeProvider>
  </React.StrictMode>,
);
