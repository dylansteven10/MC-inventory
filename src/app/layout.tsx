import type {
  Metadata
} from "next";

import "./globals.css";

import ClientLayout from "./ClientLayout";

import Providers from "./providers/Providers";

export const metadata: Metadata = {

  title: "MC Inventory",

  description:
    "Multi Cloud Inventory Platform"

};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (

    <html lang="en">

      <body>

        <Providers>

          <ClientLayout>
            {children}
          </ClientLayout>

        </Providers>

      </body>

    </html>

  );

}