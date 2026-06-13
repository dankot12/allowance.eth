"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Wand2,
  Code2,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import type { AllowancePolicy } from "@/lib/policySchema";
import { validatePolicy, EXAMPLE_POLICY } from "@/lib/policySchema";

interface PolicyEditorProps {
  value: AllowancePolicy | null;
  onChange: (policy: AllowancePolicy | null) => void;
}

type Tab = "nl" | "json";

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = "json-number";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "json-key" : "json-string";
      } else if (/true|false/.test(match)) {
        cls = "json-boolean";
      } else if (/null/.test(match)) {
        cls = "json-null";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

export default function PolicyEditor({ value, onChange }: PolicyEditorProps) {
  const [tab, setTab] = useState<Tab>("nl");
  const [nlInput, setNlInput] = useState("");
  const [jsonInput, setJsonInput] = useState(
    value ? JSON.stringify(value, null, 2) : JSON.stringify(EXAMPLE_POLICY, null, 2)
  );
  const [nlLoading, setNlLoading] = useState(false);
  const [nlError, setNlError] = useState<string | null>(null);
  const [nlAmbiguous, setNlAmbiguous] = useState(false);
  const [jsonErrors, setJsonErrors] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(true);
  const [copied, setCopied] = useState(false);

  // Validate initial JSON on mount
  useEffect(() => {
    const initial = value ?? EXAMPLE_POLICY;
    const result = validatePolicy(initial);
    setJsonErrors(result.errors);
    if (result.valid) onChange(initial as AllowancePolicy);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── NL Translation ────────────────────────────────────────
  const translatePolicy = useCallback(async () => {
    if (!nlInput.trim()) return;
    setNlLoading(true);
    setNlError(null);
    setNlAmbiguous(false);

    try {
      const res = await fetch("/api/translate-policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naturalLanguage: nlInput }),
      });

      const data = await res.json();

      if (!res.ok) {
        setNlError(data.error ?? "Translation failed");
        setNlAmbiguous(data.ambiguous ?? false);
        return;
      }

      const policy = data.policy as AllowancePolicy;
      setJsonInput(JSON.stringify(policy, null, 2));
      onChange(policy);
      setTab("json"); // switch to JSON view to show result
    } catch (err) {
      setNlError("Network error — is the API key configured?");
    } finally {
      setNlLoading(false);
    }
  }, [nlInput, onChange]);

  // ── JSON editing ──────────────────────────────────────────
  const handleJsonChange = useCallback(
    (raw: string) => {
      setJsonInput(raw);
      try {
        const parsed = JSON.parse(raw);
        const result = validatePolicy(parsed);
        setJsonErrors(result.errors);
        if (result.valid) {
          onChange(parsed as AllowancePolicy);
        } else {
          onChange(null);
        }
      } catch {
        setJsonErrors(["Invalid JSON syntax"]);
        onChange(null);
      }
    },
    [onChange]
  );

  const copyJson = () => {
    navigator.clipboard.writeText(jsonInput);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const loadExample = () => {
    const ex = JSON.stringify(EXAMPLE_POLICY, null, 2);
    setJsonInput(ex);
    onChange(EXAMPLE_POLICY);
    setJsonErrors([]);
  };

  const jsonValid = jsonErrors.length === 0 && !!value;

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex items-center gap-1 p-1 bg-surface-100 rounded-xl w-fit">
        <button
          onClick={() => setTab("nl")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "nl"
              ? "bg-brand-600/30 text-brand-300 border border-brand-500/40"
              : "text-gray-400 hover:text-white"
          }`}
        >
          <Wand2 className="w-3.5 h-3.5" />
          Natural Language
        </button>
        <button
          onClick={() => setTab("json")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "json"
              ? "bg-brand-600/30 text-brand-300 border border-brand-500/40"
              : "text-gray-400 hover:text-white"
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          JSON Editor
        </button>
      </div>

      {/* NL panel */}
      {tab === "nl" && (
        <div className="space-y-3">
          <div>
            <label className="label mb-2 block">Describe the policy in plain English</label>
            <textarea
              className="textarea-field h-32"
              placeholder={`e.g. "$50 daily cap to Uniswap only, between 9 AM and 5 PM UTC, anything above $30 needs human approval"`}
              value={nlInput}
              onChange={(e) => {
                setNlInput(e.target.value);
                setNlError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) translatePolicy();
              }}
            />
            <p className="mt-1 text-xs text-gray-600">⌘ + Enter to translate</p>
          </div>

          {nlError && (
            <div
              className={`flex items-start gap-2.5 p-3 rounded-xl border text-sm ${
                nlAmbiguous
                  ? "bg-warning/10 border-warning/30 text-warning"
                  : "bg-danger/10 border-danger/30 text-danger"
              }`}
            >
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">{nlAmbiguous ? "Policy too ambiguous" : "Translation error"}</p>
                <p className="text-xs mt-0.5 opacity-80">{nlError}</p>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              className="btn-primary flex-1"
              onClick={translatePolicy}
              disabled={nlLoading || !nlInput.trim()}
            >
              {nlLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Translating…
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  Translate to JSON
                </>
              )}
            </button>
            <button className="btn-secondary" onClick={loadExample}>
              Load Example
            </button>
          </div>

          <div className="p-3 rounded-xl bg-surface-200/50 border border-surface-300/50">
            <p className="text-xs text-gray-500 font-medium mb-2">Try these examples:</p>
            <div className="space-y-1.5">
              {[
                "$50 daily cap to Uniswap only, between 9 AM and 5 PM UTC, anything above $30 needs human approval",
                "Max 0.1 ETH per day on Aave, no time restrictions",
                "Allow only Uniswap and Compound, $200 daily cap in USDC, never allow more than $100 to one contract",
              ].map((ex) => (
                <button
                  key={ex}
                  className="block w-full text-left text-xs text-gray-400 hover:text-brand-300 p-2 rounded-lg hover:bg-surface-300/50 transition-colors font-mono"
                  onClick={() => setNlInput(ex)}
                >
                  "{ex}"
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* JSON panel */}
      {tab === "json" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="label">Policy JSON</label>
            <div className="flex items-center gap-2">
              {jsonErrors.length === 0 && jsonValid ? (
                <span className="flex items-center gap-1 text-xs text-success">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Valid
                </span>
              ) : jsonErrors.length > 0 ? (
                <span className="flex items-center gap-1 text-xs text-danger">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {jsonErrors.length} error{jsonErrors.length !== 1 ? "s" : ""}
                </span>
              ) : null}
              <button className="btn-ghost py-1 px-2 text-xs" onClick={copyJson}>
                {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button className="btn-ghost py-1 px-2 text-xs" onClick={loadExample}>
                Example
              </button>
            </div>
          </div>

          <div className="relative">
            <textarea
              className={`textarea-field h-72 text-xs leading-relaxed transition-colors ${
                jsonErrors.length > 0
                  ? "border-danger/50 focus:border-danger focus:ring-danger/20"
                  : jsonValid
                  ? "border-success/50 focus:border-success focus:ring-success/20"
                  : ""
              }`}
              value={jsonInput}
              onChange={(e) => handleJsonChange(e.target.value)}
              spellCheck={false}
            />
          </div>

          {jsonErrors.length > 0 && (
            <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 space-y-1">
              {jsonErrors.map((err, i) => (
                <p key={i} className="text-xs text-danger flex items-center gap-1.5">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  {err}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Collapsible preview */}
      {value && (
        <div className="border border-surface-300/50 rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-300 hover:text-white hover:bg-surface-200/50 transition-colors"
            onClick={() => setShowPreview((p) => !p)}
          >
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Policy preview
            </span>
            {showPreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showPreview && (
            <div className="px-4 pb-4 space-y-2 border-t border-surface-300/50 pt-3">
              {value.name && <p className="text-sm font-semibold text-white">{value.name}</p>}
              <div className="grid grid-cols-1 gap-2">
                {value.dailyCap && (
                  <Row label="Daily cap" value={`${value.dailyCap.amount} ${value.dailyCap.token}`} />
                )}
                {value.approvalThreshold && (
                  <Row label="Human approval above" value={`${value.approvalThreshold.amount} ${value.approvalThreshold.token}`} />
                )}
                {value.allowlist && value.allowlist.length > 0 && (
                  <Row label={`Allowlist (${value.allowlist.length})`} value={value.allowlist.join(", ")} mono />
                )}
                {value.timeWindow && (
                  <Row label="Time window" value={`${value.timeWindow.start}–${value.timeWindow.end} ${value.timeWindow.timezone}`} />
                )}
                {value.perCounterpartyCap && (
                  <Row label="Per-contract cap" value={`${value.perCounterpartyCap.amount} ${value.perCounterpartyCap.token}/day`} />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <p className="text-xs text-gray-500 w-36 flex-shrink-0 pt-0.5">{label}</p>
      <p className={`text-xs text-gray-200 break-all ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
