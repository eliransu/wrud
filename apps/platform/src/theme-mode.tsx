import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ConfigProvider } from "antd";
import { wrudThemes, type Mode } from "./theme";

const KEY = "wrud_theme"; // "light" | "dark"; absent = follow system

const system = (): Mode =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
const stored = (): Mode | null => {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : null;
};
const resolved = (): Mode => stored() ?? system();

function apply(m: Mode) {
  const el = document.documentElement;
  el.classList.toggle("dark", m === "dark");
  el.style.colorScheme = m;
}

const Ctx = createContext<{ mode: Mode; toggle: () => void }>({
  mode: "dark",
  toggle: () => {},
});
export const useThemeMode = () => useContext(Ctx);

/** Wraps AntD's ConfigProvider, flips the `.dark` class for theme.css, defaults
 * to the OS preference, and persists an explicit toggle. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(resolved);

  useEffect(() => apply(mode), [mode]);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (!stored()) setMode(system());
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next: Mode = mode === "dark" ? "light" : "dark";
    localStorage.setItem(KEY, next);
    setMode(next);
  };

  return (
    <Ctx.Provider value={{ mode, toggle }}>
      <ConfigProvider theme={wrudThemes[mode]}>{children}</ConfigProvider>
    </Ctx.Provider>
  );
}
