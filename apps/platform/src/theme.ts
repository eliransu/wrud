import { theme as antdTheme, type ThemeConfig } from "antd";

export type Mode = "light" | "dark";

/** Accents are shared across both themes; only surfaces/text/borders flip. */
const accents = {
  colorInfo: "#5be0d6",
  colorSuccess: "#7fae33",
  colorWarning: "#ffb454",
  colorError: "#ff6b6b",
  borderRadius: 12,
  fontFamily: "'Hanken Grotesk', system-ui, -apple-system, sans-serif",
  fontSize: 14,
  controlHeight: 38,
  wireframe: false,
};

/** wrud "mission control" dark theme - acid-lime signal on a near-black canvas. */
const dark: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    ...accents,
    colorPrimary: "#b6f24e",
    colorBgBase: "#0a0e0d",
    colorTextBase: "#e8efe9",
    colorBgContainer: "#111715",
    colorBgElevated: "#161e1b",
    colorBorder: "rgba(182,242,78,0.10)",
    colorBorderSecondary: "rgba(255,255,255,0.06)",
  },
  components: {
    Layout: {
      siderBg: "#0b110f",
      headerBg: "rgba(11,17,15,0.72)",
      bodyBg: "transparent",
      headerHeight: 64,
    },
    Menu: {
      itemBg: "transparent",
      itemSelectedBg: "rgba(182,242,78,0.12)",
      itemSelectedColor: "#caff5e",
      itemColor: "#9fb0a6",
      itemHoverColor: "#e8efe9",
      itemHoverBg: "rgba(255,255,255,0.04)",
      itemBorderRadius: 10,
      itemMarginInline: 10,
      itemHeight: 44,
    },
    Card: { colorBgContainer: "#111715", paddingLG: 22, borderRadiusLG: 16 },
    Table: {
      headerBg: "rgba(255,255,255,0.02)",
      headerColor: "#8fa298",
      rowHoverBg: "rgba(182,242,78,0.05)",
      borderColor: "rgba(255,255,255,0.06)",
      colorBgContainer: "transparent",
      cellPaddingBlock: 14,
    },
    Modal: { contentBg: "#121916", headerBg: "#121916", borderRadiusLG: 16 },
    Button: { primaryColor: "#08120a", fontWeight: 600, borderRadius: 10 },
    Tag: { defaultBg: "rgba(255,255,255,0.05)", borderRadiusSM: 6 },
    Input: { colorBgContainer: "#0e1513", activeBorderColor: "#b6f24e" },
    Select: { colorBgContainer: "#0e1513" },
  },
};

/** Light theme - the same observatory palette on a warm off-white canvas.
 * Lime stays the brand accent for fills; a deeper green is used where lime
 * would be illegible on white. */
const light: ThemeConfig = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    ...accents,
    colorPrimary: "#5f9410", // deep lime-green: legible as a control/link color on white
    colorBgBase: "#f4f7f0",
    colorTextBase: "#14201b",
    colorBgContainer: "#ffffff",
    colorBgElevated: "#ffffff",
    colorBorder: "rgba(20,32,27,0.14)",
    colorBorderSecondary: "rgba(20,32,27,0.08)",
  },
  components: {
    Layout: {
      siderBg: "#eef2ea",
      headerBg: "rgba(244,247,240,0.72)",
      bodyBg: "transparent",
      headerHeight: 64,
    },
    Menu: {
      itemBg: "transparent",
      itemSelectedBg: "rgba(95,148,16,0.12)",
      itemSelectedColor: "#3d630a",
      itemColor: "#5c6b62",
      itemHoverColor: "#14201b",
      itemHoverBg: "rgba(20,32,27,0.04)",
      itemBorderRadius: 10,
      itemMarginInline: 10,
      itemHeight: 44,
    },
    Card: { colorBgContainer: "#ffffff", paddingLG: 22, borderRadiusLG: 16 },
    Table: {
      headerBg: "rgba(20,32,27,0.03)",
      headerColor: "#5c6b62",
      rowHoverBg: "rgba(95,148,16,0.07)",
      borderColor: "rgba(20,32,27,0.08)",
      colorBgContainer: "transparent",
      cellPaddingBlock: 14,
    },
    Modal: { contentBg: "#ffffff", headerBg: "#ffffff", borderRadiusLG: 16 },
    Button: { primaryColor: "#ffffff", fontWeight: 600, borderRadius: 10 },
    Tag: { defaultBg: "rgba(20,32,27,0.05)", borderRadiusSM: 6 },
    Input: { colorBgContainer: "#ffffff", activeBorderColor: "#5f9410" },
    Select: { colorBgContainer: "#ffffff" },
  },
};

export const wrudThemes: Record<Mode, ThemeConfig> = { light, dark };
