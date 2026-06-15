"use client";

import Link from "next/link";
import { Shield, Lock, Zap, ArrowRight, ChevronRight } from "lucide-react";
import Navbar from "./components/Navbar";

const features = [
  {
    icon: <Zap className="w-5 h-5 text-brand-400" />,
    title: "Write rules in plain English",
    desc: "Claude converts your description into a verified spending policy JSON. No config files, no code.",
  },
  {
    icon: <Shield className="w-5 h-5 text-brand-400" />,
    title: "Enforced on-chain",
    desc: "PolicyGuard verifies every agent transaction against the on-chain policy hash before it broadcasts.",
  },
  {
    icon: <Lock className="w-5 h-5 text-brand-400" />,
    title: "Ledger approval for large spends",
    desc: "Transactions above your threshold require a Ledger signature with ERC-7730 clear signing — you see exactly what you're approving.",
  },
];

const howItWorks = [
  { step: "01", title: "Agent gets an ENS name", desc: "The spending policy is anchored to the name, not the wallet. traderbot.eth carries its rules everywhere." },
  { step: "02", title: "You define the rules", desc: "Daily cap, allowlisted contracts, time window, approval threshold. Described in English, stored as JSON on ENS." },
  { step: "03", title: "Agent spends autonomously", desc: "Every transaction is checked against PolicyGuard on-chain. Blocked transactions never broadcast." },
  { step: "04", title: "Big spends need your sign-off", desc: "Anything above the threshold asks for your Ledger. The device shows exactly what the agent wants to do." },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-medium tracking-wide uppercase mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
          EthGlobal NYC 2026 · Live on Sepolia
        </div>

        <div className="relative mb-8 flex justify-center">
          <div className="w-24 h-24 rounded-3xl bg-surface-50 border border-brand-600/40 flex items-center justify-center"
            style={{ boxShadow: "0 0 60px rgba(16,185,129,0.2), inset 0 1px 0 rgba(16,185,129,0.1)" }}>
            <Shield className="w-12 h-12 text-brand-400" />
          </div>
          <div className="absolute top-0 right-[calc(50%-52px)] w-5 h-5 rounded-full bg-brand-500 border-2 border-[#070d0b]"
            style={{ boxShadow: "0 0 12px rgba(16,185,129,0.9)" }} />
        </div>

        <h1 className="text-5xl sm:text-7xl font-bold text-white mb-6 leading-tight tracking-tight">
          Spending guardrails
          <br />
          <span style={{
            backgroundImage: "linear-gradient(135deg, #34d399 0%, #10b981 50%, #06b6d4 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            for AI agents.
          </span>
        </h1>

        <p className="text-gray-400 text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
          Define what your AI agent is allowed to spend. The rules live on its{" "}
          <span className="text-brand-400 font-mono">ENS name</span> — portable across wallets,
          enforced on-chain, with Ledger approval for anything large.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/app"
            className="btn-primary text-base px-8 py-3 flex items-center gap-2"
          >
            Launch App
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="https://github.com/dankot12/allowance.eth"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-base px-8 py-3"
          >
            View on GitHub
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {features.map((f) => (
            <div key={f.title} className="card p-6">
              <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mb-4">
                {f.icon}
              </div>
              <h3 className="font-semibold text-white text-sm mb-2">{f.title}</h3>
              <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-24">
        <div className="mb-8 text-center">
          <p className="text-xs font-medium text-gray-600 uppercase tracking-widest mb-2">How it works</p>
          <h2 className="text-2xl font-bold text-white">Four steps, fully on-chain</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {howItWorks.map((item) => (
            <div key={item.step} className="card-hover p-6 flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-surface-200 border border-surface-300 flex items-center justify-center">
                <span className="font-mono text-xs font-bold text-brand-400">{item.step}</span>
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Tech stack */}
      <section className="border-t border-surface-300/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
          <p className="text-xs font-medium text-gray-600 uppercase tracking-widest text-center mb-6">Built with</p>
          <div className="flex flex-wrap justify-center gap-2">
            {["ENS v2", "PolicyGuard", "ERC-7730", "Ledger", "Dynamic", "Anthropic Claude", "Foundry", "viem", "Sepolia"].map((tech) => (
              <span key={tech} className="badge badge-muted text-xs px-3 py-1">{tech}</span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA footer */}
      <section className="border-t border-surface-300/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">Ready to give your agent a spending limit?</h2>
          <p className="text-gray-500 text-sm mb-8 max-w-md mx-auto">
            Connect your wallet, enter your agent&apos;s ENS name, and publish a policy in under two minutes.
          </p>
          <Link href="/app" className="btn-primary text-base px-8 py-3 inline-flex items-center gap-2">
            Get Started
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
