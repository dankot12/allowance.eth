/**
 * Allowance.eth — Policy Schema
 *
 * This file is the single source of truth for the policy data model.
 * It is used by:
 *   - The AI translator (as the JSON Schema passed to Claude's structured-output mode)
 *   - The frontend editor (TypeScript types + Zod validation)
 *   - The PolicyGuard.sol ABI encoder (lib/policyGuard.ts)
 */

// ─────────────────────────────────────────────────────────────
// TypeScript types
// ─────────────────────────────────────────────────────────────

export type SupportedToken = "ETH" | "USDC" | "USDT" | "DAI" | "WETH" | "WBTC";

export interface TokenAmount {
  amount: number;    // human-readable (e.g. 50 for $50 USDC)
  token: SupportedToken;
}

export interface TimeWindow {
  /** 24-hour local time, "HH:MM" format */
  start: string;
  end: string;
  /** IANA timezone string, e.g. "America/New_York" or "UTC" */
  timezone: string;
}

export interface AllowancePolicy {
  /** Schema version — always "1" for now */
  version: "1";

  /** Human-readable name for this policy */
  name: string;

  /**
   * Maximum total spend per calendar day (rolling, resets at midnight UTC).
   * Omit to allow unlimited spending.
   */
  dailyCap?: TokenAmount;

  /**
   * Whitelist of contract addresses this agent is allowed to interact with.
   * Omit or set to [] to allow any target.
   */
  allowlist?: string[];

  /**
   * Time window during which the agent is allowed to transact.
   * Omit to allow 24/7 operation.
   */
  timeWindow?: TimeWindow;

  /**
   * Transactions at or above this amount are BLOCKED and flagged for human approval.
   * The agent must route them to a human-approval queue.
   * Omit to disable the threshold (all amounts auto-approve).
   */
  approvalThreshold?: TokenAmount;

  /**
   * Maximum spend per single counterparty address per day.
   * Omit to disable per-counterparty limiting.
   */
  perCounterpartyCap?: TokenAmount;

  /**
   * ISO 8601 datetime — policy expires at this time.
   * Omit for no expiry.
   */
  expiresAt?: string;

  /** Free-form notes visible to humans but ignored by the guard */
  notes?: string;
}

// ─────────────────────────────────────────────────────────────
// JSON Schema (passed to Claude structured-output mode)
// ─────────────────────────────────────────────────────────────

export const POLICY_JSON_SCHEMA = {
  type: "object",
  title: "AllowancePolicy",
  description: "Spending policy for an AI agent wallet, enforced by PolicyGuard.sol",
  required: ["version", "name"],
  additionalProperties: false,
  properties: {
    version: {
      type: "string",
      enum: ["1"],
      description: "Schema version — always '1'"
    },
    name: {
      type: "string",
      minLength: 1,
      maxLength: 80,
      description: "Short human-readable name for this policy"
    },
    dailyCap: {
      type: "object",
      description: "Maximum total spend per calendar day (UTC midnight reset)",
      required: ["amount", "token"],
      additionalProperties: false,
      properties: {
        amount: { type: "number", minimum: 0, description: "Human-readable amount (e.g. 50 for $50)" },
        token: { type: "string", enum: ["ETH", "USDC", "USDT", "DAI", "WETH", "WBTC"] }
      }
    },
    allowlist: {
      type: "array",
      description: "Whitelisted contract addresses. Empty array or omit = allow all.",
      items: {
        type: "string",
        pattern: "^0x[a-fA-F0-9]{40}$",
        description: "EVM address"
      }
    },
    timeWindow: {
      type: "object",
      description: "Time window during which transactions are permitted",
      required: ["start", "end", "timezone"],
      additionalProperties: false,
      properties: {
        start: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$", description: "HH:MM 24-hour start" },
        end:   { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$", description: "HH:MM 24-hour end" },
        timezone: { type: "string", description: "IANA timezone, e.g. 'UTC' or 'America/New_York'" }
      }
    },
    approvalThreshold: {
      type: "object",
      description: "Transactions at or above this size are blocked and flagged for human approval",
      required: ["amount", "token"],
      additionalProperties: false,
      properties: {
        amount: { type: "number", minimum: 0 },
        token: { type: "string", enum: ["ETH", "USDC", "USDT", "DAI", "WETH", "WBTC"] }
      }
    },
    perCounterpartyCap: {
      type: "object",
      description: "Maximum daily spend to any single contract address",
      required: ["amount", "token"],
      additionalProperties: false,
      properties: {
        amount: { type: "number", minimum: 0 },
        token: { type: "string", enum: ["ETH", "USDC", "USDT", "DAI", "WETH", "WBTC"] }
      }
    },
    expiresAt: {
      type: "string",
      format: "date-time",
      description: "ISO 8601 expiry — omit for no expiry"
    },
    notes: {
      type: "string",
      maxLength: 500,
      description: "Human-readable notes, ignored by on-chain guard"
    }
  }
} as const;

// ─────────────────────────────────────────────────────────────
// Validation (no external deps — pure TypeScript)
// ─────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePolicy(policy: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof policy !== "object" || policy === null) {
    return { valid: false, errors: ["Policy must be a JSON object"] };
  }

  const p = policy as Record<string, unknown>;

  const KNOWN_FIELDS = new Set(["version", "name", "dailyCap", "allowlist", "timeWindow", "approvalThreshold", "perCounterpartyCap", "expiresAt", "notes"]);
  for (const key of Object.keys(p)) {
    if (!KNOWN_FIELDS.has(key)) errors.push(`Unknown field "${key}" — use only: ${Array.from(KNOWN_FIELDS).join(", ")}`);
  }

  if (p.version !== "1") errors.push('version must be "1"');
  if (typeof p.name !== "string" || p.name.trim().length === 0) errors.push("name is required");

  if (p.dailyCap !== undefined) {
    const cap = p.dailyCap as Record<string, unknown>;
    if (typeof cap.amount !== "number" || cap.amount < 0) errors.push("dailyCap.amount must be a non-negative number");
    if (!["ETH","USDC","USDT","DAI","WETH","WBTC"].includes(cap.token as string))
      errors.push("dailyCap.token must be one of ETH, USDC, USDT, DAI, WETH, WBTC");
  }

  if (p.approvalThreshold !== undefined) {
    const t = p.approvalThreshold as Record<string, unknown>;
    if (typeof t.amount !== "number" || t.amount < 0) errors.push("approvalThreshold.amount must be non-negative");
    if (!["ETH","USDC","USDT","DAI","WETH","WBTC"].includes(t.token as string))
      errors.push("approvalThreshold.token must be a valid token");
    if (p.dailyCap && typeof (p.dailyCap as Record<string,unknown>).amount === "number") {
      if ((t.amount as number) > ((p.dailyCap as Record<string,unknown>).amount as number))
        errors.push("approvalThreshold should be ≤ dailyCap (otherwise threshold is never reached)");
    }
  }

  if (p.allowlist !== undefined) {
    if (!Array.isArray(p.allowlist)) {
      errors.push("allowlist must be an array");
    } else {
      const ethAddrRe = /^0x[a-fA-F0-9]{40}$/;
      (p.allowlist as unknown[]).forEach((addr, i) => {
        if (typeof addr !== "string" || !ethAddrRe.test(addr))
          errors.push(`allowlist[${i}] is not a valid EVM address`);
      });
    }
  }

  if (p.timeWindow !== undefined) {
    const tw = p.timeWindow as Record<string, unknown>;
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (typeof tw.start !== "string" || !timeRe.test(tw.start))
      errors.push("timeWindow.start must be HH:MM format");
    if (typeof tw.end !== "string" || !timeRe.test(tw.end))
      errors.push("timeWindow.end must be HH:MM format");
    if (typeof tw.timezone !== "string" || tw.timezone.trim().length === 0)
      errors.push("timeWindow.timezone is required (e.g. 'UTC')");
  }

  if (p.perCounterpartyCap !== undefined) {
    const cap = p.perCounterpartyCap as Record<string, unknown>;
    if (typeof cap.amount !== "number" || cap.amount < 0)
      errors.push("perCounterpartyCap.amount must be non-negative");
    if (!["ETH","USDC","USDT","DAI","WETH","WBTC"].includes(cap.token as string))
      errors.push("perCounterpartyCap.token must be a valid token");
  }

  if (p.expiresAt !== undefined) {
    if (typeof p.expiresAt !== "string" || isNaN(Date.parse(p.expiresAt)))
      errors.push("expiresAt must be a valid ISO 8601 datetime string");
  }

  // Ambiguity checks
  const hasNoRules = !p.dailyCap && !p.allowlist && !p.timeWindow && !p.approvalThreshold && !p.perCounterpartyCap;
  if (hasNoRules) {
    errors.push("Policy has no rules — at least one constraint is required (dailyCap, allowlist, timeWindow, approvalThreshold, or perCounterpartyCap)");
  }

  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────
// Default / example policy
// ─────────────────────────────────────────────────────────────

export const EXAMPLE_POLICY: AllowancePolicy = {
  version: "1",
  name: "Uniswap Trading Policy",
  dailyCap: { amount: 50, token: "USDC" },
  allowlist: ["0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"], // Uniswap Universal Router
  timeWindow: { start: "09:00", end: "17:00", timezone: "UTC" },
  approvalThreshold: { amount: 30, token: "USDC" },
  notes: "$50 daily cap to Uniswap only, 9AM–5PM UTC, anything above $30 needs human approval"
};

export const EMPTY_POLICY: AllowancePolicy = {
  version: "1",
  name: "",
};
