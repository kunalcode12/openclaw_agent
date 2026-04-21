import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@turnkey/react-wallet-kit/styles.css";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Elyra",
  description: "Elyra Solana wallet experience powered by Turnkey",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-dvh max-h-dvh overflow-hidden antialiased`}
    >
      <body className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
