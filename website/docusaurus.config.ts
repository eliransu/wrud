import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const GITHUB = "https://github.com/eliransu/wrud";
const NPM = "https://www.npmjs.com/package/@wrud/cli";
const SITE = "https://site-ashy-iota-61.vercel.app";

const config: Config = {
  title: "wrud docs",
  tagline: "Local-first telemetry for AI coding-agent sessions",
  favicon: "img/wrud-mascot.png",

  future: { v4: true },

  url: "https://wrud-docs.vercel.app",
  baseUrl: "/",

  organizationName: "eliransu",
  projectName: "wrud",

  onBrokenLinks: "warn",

  i18n: { defaultLocale: "en", locales: ["en"] },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          routeBasePath: "/", // docs ARE the site (marketing lives on the landing page)
          editUrl: "https://github.com/eliransu/wrud/tree/main/website/",
        },
        blog: false,
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/wrud-mascot.png",
    colorMode: {
      defaultMode: "dark",
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: "wrud",
      logo: { alt: "wrud", src: "img/wrud-mascot.png" },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docs",
          position: "left",
          label: "Docs",
        },
        { href: SITE, label: "Home", position: "right" },
        { href: NPM, label: "npm", position: "right" },
        { href: GITHUB, label: "GitHub", position: "right" },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Getting started", to: "/" },
            { label: "CLI", to: "/cli" },
            { label: "SDK", to: "/sdk" },
            { label: "HTTP API", to: "/api" },
          ],
        },
        {
          title: "Project",
          items: [
            { label: "GitHub", href: GITHUB },
            { label: "npm", href: NPM },
            { label: "Website", href: SITE },
          ],
        },
      ],
      copyright: `wrud - What R U Doing. MIT licensed. © ${new Date().getFullYear()}.`,
    },
    prism: {
      theme: prismThemes.oneLight,
      darkTheme: prismThemes.oneDark,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
