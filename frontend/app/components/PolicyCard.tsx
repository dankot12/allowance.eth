"use client";

import { Clock, DollarSign, Shield, User, AlertTriangle, Calendar } from "lucide-react";
import type { AllowancePolicy } from "@/lib/policySchema";
import { formatPolicyForDisplay, shortenAddress } from "@/lib/ensClient";

interface PolicyCardProps {
  policy: AllowancePolicy;
  ensName?: string;
  policyHash?: string;
  className?: string;
}

const ruleIcons = {
  cap: DollarSign,
  allowlist: Shield,
  time: Clock,
  approval: User,
  expiry: Calendar,
};

const ruleColors = {
  cap: "text-brand-300",
  allowlist: "text-info",
  time: "text-warning",
  approval: "text-success",
  expiry: "text-gray-400",
};

export default function PolicyCard({ policy, ensName, policyHash, className = "" }: PolicyCardProps) {
  const { rules } = formatPolicyForDisplay(policy);

  return (
    <div className={`card p-5 ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="status-dot-active" />
            <h3 className="font-semibold text-white">{policy.name || "Unnamed Policy"}</h3>
          </div>
          {ensName && (
            <p className="text-xs text-gray-500 font-mono">{ensName}</p>
          )}
        </div>
        <span className="badge badge-muted">v{policy.version}</span>
      </div>

      {/* Rules grid */}
      {rules.length > 0 ? (
        <div className="space-y-2.5">
          {rules.map((rule, i) => {
            const Icon = ruleIcons[rule.type];
            const color = ruleColors[rule.type];
            return (
              <div
                key={i}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-200/50 border border-surface-300/50"
              >
                <div className={`flex-shrink-0 ${color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-500">{rule.label}</p>
                  <p className="text-sm text-gray-100 font-medium truncate">{rule.value}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
          <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
          <p className="text-sm text-warning">No enforcement rules defined</p>
        </div>
      )}

      {/* Notes */}
      {policy.notes && (
        <p className="mt-3 text-xs text-gray-500 italic border-t border-surface-300 pt-3">
          {policy.notes}
        </p>
      )}

      {/* Policy hash */}
      {policyHash && (
        <div className="mt-3 pt-3 border-t border-surface-300">
          <p className="label mb-1">On-chain hash</p>
          <p className="font-mono text-xs text-gray-500 truncate">{policyHash}</p>
        </div>
      )}
    </div>
  );
}
