"use client";

import Providers from "./providers/Providers";
import { ThemeProvider } from "./providers/ThemeProvider";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <Providers>
        {children}
      </Providers>
    </ThemeProvider>
  );
}