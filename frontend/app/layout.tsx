import type { Metadata } from "next";
import "./globals.css";
import ClientProviders from "./components/ClientProviders";

export const metadata: Metadata = {
  title: "Allowance.eth — Agent Spending Policies",
  description: "Portable, human-readable spending policies for AI agent wallets. Stored on ENS. Enforced on-chain.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Allowance.eth",
    description: "Define what your AI agent is allowed to spend. Move the name, move the rules.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-[#070d0b] text-gray-100 antialiased relative" suppressHydrationWarning>
        <div
          suppressHydrationWarning
          className="pointer-events-none fixed inset-0 z-0"
          style={{ background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(16,185,129,0.12) 0%, transparent 70%)" }}
        />
        <div
          suppressHydrationWarning
          className="pointer-events-none fixed inset-0 z-0 opacity-[0.03]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        <div className="relative z-10">
          <ClientProviders>{children}</ClientProviders>
        </div>
      </body>
    </html>
  );
}
