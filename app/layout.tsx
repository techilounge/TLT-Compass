import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";
export const metadata: Metadata = {
  title: "TLT Compass",
  description:
    "Guided Teen Leadership Training, supervised records and club planning.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "TLT Compass",
    statusBarStyle: "default",
  },
  robots: { index: false, follow: false },
};
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
