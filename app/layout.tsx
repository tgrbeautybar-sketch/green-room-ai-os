import "./globals.css";
import type { Metadata } from "next";
import Topbar from "@/components/shell/Topbar";

export const metadata: Metadata = {
  title: "Green Room AI OS",
  description: "The Green Room Beauty Bar — four AI tools, one platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <Topbar />
        <main className="mx-auto max-w-7xl px-5 pt-6 pb-24 sm:px-8">{children}</main>
      </body>
    </html>
  );
}
