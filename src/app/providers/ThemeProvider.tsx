"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState
} from "react";

export type ThemeName =
  | "purple"
  | "ocean"
  | "sunset"
  | "forest"
  | "midnight"
  | "cherry";

type Appearance =
  | "dark"
  | "light"
  | "system";

interface ThemeContextType {

  theme: ThemeName;

  setTheme: (
    theme: ThemeName
  ) => void;

  appearance: Appearance;

  setAppearance: (
    mode: Appearance
  ) => void;

  themeName: string;

}

const ThemeContext =
  createContext<
    ThemeContextType | undefined
  >(undefined);

export const themeLabels = {

  purple: "Purple Passion",
  ocean: "Ocean Breeze",
  sunset: "Sunset Glow",
  forest: "Forest Mist",
  midnight: "Midnight Blue",
  cherry: "Cherry Blossom",

};

export function ThemeProvider({
  children
}: {
  children: React.ReactNode;
}) {

  const [mounted, setMounted] =
    useState(false);

  const [theme, setThemeState] =
    useState<ThemeName>("purple");

  const [appearance, setAppearanceState] =
    useState<Appearance>("dark");

  useEffect(() => {

    setMounted(true);

    const savedTheme =
      localStorage.getItem(
        "app-theme"
      ) as ThemeName;

    const savedAppearance =
      localStorage.getItem(
        "app-appearance"
      ) as Appearance;

    if (
      savedTheme &&
      themeLabels[savedTheme]
    ) {

      setThemeState(savedTheme);

      document.documentElement.setAttribute(
        "data-theme",
        savedTheme
      );

    }

    if (savedAppearance) {

      setAppearanceState(
        savedAppearance
      );

      applyAppearance(
        savedAppearance
      );

    }

  }, []);

  const applyAppearance = (
    mode: Appearance
  ) => {

    const html =
      document.documentElement;

    if (mode === "system") {

      const isDark =
        window.matchMedia(
          "(prefers-color-scheme: dark)"
        ).matches;

      html.setAttribute(
        "data-mode",
        isDark
          ? "dark"
          : "light"
      );

      return;

    }

    html.setAttribute(
      "data-mode",
      mode
    );

  };

  const setTheme = (
    newTheme: ThemeName
  ) => {

    setThemeState(newTheme);

    localStorage.setItem(
      "app-theme",
      newTheme
    );

    document.documentElement.setAttribute(
      "data-theme",
      newTheme
    );

  };

  const setAppearance = (
    mode: Appearance
  ) => {

    setAppearanceState(mode);

    localStorage.setItem(
      "app-appearance",
      mode
    );

    applyAppearance(mode);

  };

  if (!mounted) {

    return <>{children}</>;

  }

  return (

    <ThemeContext.Provider
      value={{

        theme,
        setTheme,

        appearance,
        setAppearance,

        themeName:
          themeLabels[theme],

      }}
    >

      {children}

    </ThemeContext.Provider>

  );

}

export function useTheme() {

  const context =
    useContext(ThemeContext);

  if (!context) {

    throw new Error(
      "useTheme must be used within ThemeProvider"
    );

  }

  return context;

}