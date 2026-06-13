"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, Activity, Search, LogOut } from "lucide-react";
import { DynamicWidget } from "@dynamic-labs/sdk-react-core";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useEffect, useState } from "react";

function WalletPill() {
  const { primaryWallet, handleLogOut } = useDynamicContext();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !primaryWallet) return null;

  const addr = primaryWallet.address;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-200 border border-surface-300 text-xs font-mono text-gray-300">
        <span className="status-dot-active flex-shrink-0" />
        {addr.slice(0, 6)}…{addr.slice(-4)}
      </div>
      <button
        onClick={() => handleLogOut()}
        className="p-1.5 rounded-lg text-gray-500 hover:text-danger hover:bg-surface-200 transition-colors"
        title="Disconnect"
      >
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const { primaryWallet } = useDynamicContext();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const links = [
    { href: "/", label: "Policy Editor", icon: Shield },
    { href: "/agent", label: "Agent Log", icon: Activity },
    { href: "/profile", label: "ENS Profile", icon: Search },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-surface-300/50 backdrop-blur-xl bg-[#08080f]/80">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shadow-glow-sm group-hover:shadow-glow-md transition-all">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-white tracking-tight">
            allowance<span className="text-brand-400">.eth</span>
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? "bg-brand-600/20 text-brand-300 border border-brand-500/30"
                    : "text-gray-400 hover:text-white hover:bg-surface-200"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          {/* Testnet badge */}
          <div className="badge badge-warning text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse-slow" />
            Sepolia
          </div>

          {/* Wallet — shows connect button or connected pill */}
          {mounted && primaryWallet ? <WalletPill /> : <DynamicWidget />}
        </div>
      </div>
    </nav>
  );
}
