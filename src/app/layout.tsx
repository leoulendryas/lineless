import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
});

export const metadata: Metadata = {
  title: "Lineless",
  description: "The decentralized energy and fuel grid terminal.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} h-full antialiased`}
    >
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="h-full flex flex-col font-sans overflow-hidden bg-white selection:bg-zinc-900 selection:text-white">
        <div className="fixed inset-0 pointer-events-none opacity-[0.03] animate-grid bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
