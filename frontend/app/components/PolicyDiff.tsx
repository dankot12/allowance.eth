"use client";

import { useState, useEffect } from "react";
import { ArrowRight, Loader2, CheckCircle2, GitCompare, Minus, Plus } from "lucide-react";
import { fetchPolicyFromENS } from "@/lib/ensClient";
import type { AllowancePolicy } from "@/lib/policySchema";

// ─── Field extraction ─────────────────────────────────────────

interface PolicyFields {
  name?: string;
  dailyCap?: string;
  approvalThreshold?: string;
  perCounterpartyCap?: string;
  timeWindow?: string;
  allowlist?: string;
  expiresAt?: string;
  notes?: string;
}

function extract(p: AllowancePolicy | null): PolicyFields {
  if (!p) return {};
  return {
    name:               p.name || undefined,
    dailyCap:           p.dailyCap          ? `${p.dailyCap.amount} ${p.dailyCap.token}`                     : undefined,
    approvalThreshold:  p.approvalThreshold ? `${p.approvalThreshold.amount} ${p.approvalThreshold.token}`   : undefined,
    perCounterpartyCap: p.perCounterpartyCap? `${p.perCounterpartyCap.amount} ${p.perCounterpartyCap.token}/day` : undefined,
    timeWindow:         p.timeWindow        ? `${p.timeWindow.start}–${p.timeWindow.end} ${p.timeWindow.timezone}` : undefined,
    allowlist:          p.allowlist?.length ? p.allowlist.length === 1
                                               ? p.allowlist[0]
                                               : `${p.allowlist.length} addresses`
                                             : undefined,
    expiresAt:          p.expiresAt         ? new Date(p.expiresAt).toLocaleDateString() : undefined,
    notes:              p.notes             ? p.notes.slice(0, 60) + (p.notes.length > 60 ? "…" : "") : undefined,
  };
}

const FIELD_LABELS: Record<keyof PolicyFields, string> = {
  name:               "Name",
  dailyCap:           "Daily cap",
  approvalThreshold:  "Approval above",
  perCounterpartyCap: "Per-contract cap",
  timeWindow:         "Time window",
  allowlist:          "Allowlist",
  expiresAt:          "Expires",
  notes:              "Notes",
};

type RowStatus = "same" | "changed" | "added" | "removed";

interface DiffRow {
  field: keyof PolicyFields;
  label: string;
  status: RowStatus;
  liveValue?: string;
  localValue?: string;
}

function buildDiff(live: PolicyFields, local: PolicyFields): DiffRow[] {
  const allKeys = Array.from(
    new Set([...Object.keys(live), ...Object.keys(local)])
  ) as (keyof PolicyFields)[];

  return allKeys.map((field) => {
    const lv = live[field];
    const lo = local[field];
    let status: RowStatus = "same";
    if (lv && lo)       status = lv === lo ? "same" : "changed";
    else if (!lv && lo) status = "added";
    else if (lv && !lo) status = "removed";
    return { field, label: FIELD_LABELS[field] ?? field, status, liveValue: lv, localValue: lo };
  });
}

// ─── Component ────────────────────────────────────────────────

interface Props {
  ensName: string;
  localPolicy: AllowancePolicy | null;
}

export default function PolicyDiff({ ensName, localPolicy }: Props) {
  const [livePolicy, setLivePolicy] = useState<AllowancePolicy | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!ensName.includes(".")) {
      setLivePolicy(null);
      setFetched(false);
      return;
    }
    setLoading(true);
    setFetched(false);
    fetchPolicyFromENS(ensName)
      .then((raw) => {
        setLivePolicy(raw ? JSON.parse(raw) as AllowancePolicy : null);
        setFetched(true);
      })
      .catch(() => { setLivePolicy(null); setFetched(true); })
      .finally(() => setLoading(false));
  }, [ensName]);

  const liveFields  = extract(livePolicy);
  const localFields = extract(localPolicy);
  const rows        = buildDiff(liveFields, localFields);
  const changedRows = rows.filter((r) => r.status !== "same");
  const inSync      = fetched && livePolicy !== null && changedRows.length === 0;
  const noLive      = fetched && livePolicy === null;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-brand-400" />
          Policy Diff
        </h3>
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500" />}
        {inSync && (
          <span className="flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="w-3.5 h-3.5" /> In sync
          </span>
        )}
        {fetched && !inSync && !noLive && changedRows.length > 0 && (
          <span className="text-xs text-yellow-400">{changedRows.length} change{changedRows.length > 1 ? "s" : ""}</span>
        )}
      </div>

      {!ensName.includes(".") && (
        <p className="text-xs text-gray-600">Enter an ENS name above to compare with the live policy.</p>
      )}

      {ensName.includes(".") && !loading && noLive && (
        <p className="text-xs text-gray-600">No policy published to ENS yet — this will be the first version.</p>
      )}

      {inSync && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20 text-xs text-success">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
          Local policy matches what&apos;s live on ENS.
        </div>
      )}

      {fetched && !noLive && changedRows.length > 0 && (
        <div className="space-y-1">
          <div className="grid grid-cols-3 gap-2 px-2 mb-1">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider">Field</p>
            <p className="text-[10px] text-gray-600 uppercase tracking-wider">Live (ENS)</p>
            <p className="text-[10px] text-gray-600 uppercase tracking-wider">Local</p>
          </div>
          {changedRows.map((row) => (
            <div
              key={row.field}
              className={`grid grid-cols-3 gap-2 px-2 py-1.5 rounded-lg text-xs ${
                row.status === "changed" ? "bg-yellow-900/20"
                : row.status === "added"   ? "bg-emerald-900/20"
                : "bg-red-900/20"
              }`}
            >
              <span className="text-gray-400 font-medium">{row.label}</span>

              <span className={`font-mono truncate ${row.status === "removed" ? "text-red-400" : "text-gray-500"}`}>
                {row.liveValue ?? <span className="italic text-gray-700">—</span>}
              </span>

              <span className={`font-mono truncate flex items-center gap-1 ${
                row.status === "added"   ? "text-emerald-400"
                : row.status === "changed" ? "text-yellow-300"
                : "text-gray-500"
              }`}>
                {row.status === "changed" && <ArrowRight className="w-3 h-3 flex-shrink-0 text-yellow-600" />}
                {row.status === "added"   && <Plus  className="w-3 h-3 flex-shrink-0" />}
                {row.status === "removed" && <Minus className="w-3 h-3 flex-shrink-0 text-red-400" />}
                {row.localValue ?? <span className="italic text-gray-700">—</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Show unchanged fields collapsed */}
      {fetched && !noLive && rows.filter((r) => r.status === "same").length > 0 && changedRows.length > 0 && (
        <p className="text-[10px] text-gray-700">
          {rows.filter((r) => r.status === "same").length} field{rows.filter((r) => r.status === "same").length > 1 ? "s" : ""} unchanged
        </p>
      )}
    </div>
  );
}
