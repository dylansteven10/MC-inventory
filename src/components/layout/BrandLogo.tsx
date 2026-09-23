"use client";

import { useEffect, useState } from "react";

const LOGO_DARK = "/logo-dark.png";
const LOGO_LIGHT = "/logo-light.png";

function useIsDark() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return dark;
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
