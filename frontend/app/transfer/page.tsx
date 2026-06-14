"use client";

import { useState, useEffect } from "react";
import { Repeat2 } from "lucide-react";
import Navbar from "../components/Navbar";
import TransferIdentityPanel from "../components/TransferIdentityPanel";

const SAVED_NAMES_KEY = "allowance_ens_names";

function getSavedNames(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_NAMES_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

export default function TransferPage() {
  const [ensName, setEnsName] = useState("");
  const [savedNames, setSavedNames] = useState<string[]>([]);

  useEffect(() => {
    const names = getSavedNames();
    setSavedNames(names);
    if (names.length > 0) setEnsName(names[0]);
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Repeat2 className="w-5 h-5 text-amber-400" />
            <h1 className="text-2xl font-bold text-white">Transfer Agent Identity</h1>
          </div>
          <p className="text-gray-400 text-sm">
            Hand off your agent to a new wallet. ENS resolver access and the spending policy both
            move — nothing resets, no reconfiguration needed.
          </p>
        </div>

        {/* ENS name selector */}
        <div className="card p-4 mb-4">
          <label className="label mb-2 block">Agent ENS name</label>
          <input
            list="transfer-saved-names"
            className="input-field font-mono"
            placeholder="yourname.eth"
            value={ensName}
            onChange={(e) => setEnsName(e.target.value)}
          />
          <datalist id="transfer-saved-names">
            {savedNames.map((n) => <option key={n} value={n} />)}
          </datalist>
          <p className="text-xs text-gray-600 mt-1">
            Select a saved name or type a new one.
          </p>
        </div>

        <TransferIdentityPanel ensName={ensName} />
      </div>
    </div>
  );
}
