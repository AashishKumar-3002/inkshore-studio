"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "./ui";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "inkshore-theme";
const LEGACY_STORAGE_KEY = "inkdrop-theme";

const ThemeContext = React.createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
}>({ theme: "system", setTheme: () => {} });

export function useTheme() {
  return React.useContext(ThemeContext);
}

/**
 * Applies the theme class to <html>. Kept out of React's render path so it
 * also runs for the inline pre-hydration script below — the two must agree
 * or the first paint flashes the wrong colours.
 */
function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * Runs before React hydrates, so the correct theme is painted on the very
 * first frame instead of flashing light-then-dark.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}")||localStorage.getItem("${LEGACY_STORAGE_KEY}")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

/**
 * localStorage is an external store, so the theme is read through
 * useSyncExternalStore rather than copied into state by an effect. That
 * keeps the server snapshot ("system") and the client snapshot consistent
 * during hydration, and means a change in another tab updates this one.
 */
const themeStore = {
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    themeStore.listeners.add(listener);
    // `storage` fires when another tab changes the preference.
    window.addEventListener("storage", listener);
    return () => {
      themeStore.listeners.delete(listener);
      window.removeEventListener("storage", listener);
    };
  },
  emit() {
    for (const listener of themeStore.listeners) listener();
  },
  getSnapshot(): Theme {
    try {
      return (
        (localStorage.getItem(STORAGE_KEY) as Theme | null) ??
        (localStorage.getItem(LEGACY_STORAGE_KEY) as Theme | null) ??
        "system"
      );
    } catch {
      // Storage can be unavailable (private mode, blocked cookies) —
      // "system" is a perfectly good fallback.
      return "system";
    }
  },
  getServerSnapshot(): Theme {
    return "system";
  },
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = React.useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot
  );

  React.useEffect(() => {
    // Follow the OS while the user is on "system".
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(theme);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = React.useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal: the theme still applies for this session.
    }
    applyTheme(next);
    themeStore.emit();
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
  );
}

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5",
        className
      )}
      role="group"
      aria-label="Colour theme"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          aria-label={label}
          aria-pressed={theme === value}
          title={label}
          className={cn(
            "rounded-[6px] p-1 transition-colors",
            theme === value
              ? "bg-surface text-ink shadow-xs"
              : "text-ink-subtle hover:text-ink"
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
