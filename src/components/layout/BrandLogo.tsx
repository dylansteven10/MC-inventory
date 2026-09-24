"use client";

import { useSyncExternalStore } from "react";

const LOGO_DARK = "/logo-dark.png";
const LOGO_LIGHT = "/logo-light.png";

function subscribeToColorScheme(callback: () => void) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function getColorSchemeSnapshot() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getServerColorSchemeSnapshot() {
  return true;
}

function useIsDark() {
  return useSyncExternalStore(
    subscribeToColorScheme,
    getColorSchemeSnapshot,
    getServerColorSchemeSnapshot,
  );
}

export default function BrandLogo({ size = 44 }: { size?: number }) {
  const dark = useIsDark();
  const src = dark ? LOGO_DARK : LOGO_LIGHT;
  const w = size;
  const h = Math.round(size * 80 / 150);

  return (
    <img
      src={src}
      alt="UX Technology"
      width={w}
      height={h}
      style={{ objectFit: "contain", display: "block" }}
    />
  );
}

export { LOGO_DARK, LOGO_LIGHT };
