import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { POLICY_JSON_SCHEMA, validatePolicy, type AllowancePolicy } from "@/lib/policySchema";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a policy compiler for Allowance.eth, a system that enforces AI agent spending rules on-chain.

Your job: convert a natural language spending policy description into a precise JSON object.

The ONLY allowed top-level fields are:
  - version (string, always "1")
  - name (string, required — short descriptive name)
  - dailyCap (object: { amount: number, token: string }) — max total spend per day
  - allowlist (array of "0x..." EVM addresses) — which contracts are allowed
  - timeWindow (object: { start: "HH:MM", end: "HH:MM", timezone: "IANA timezone" })
  - approvalThreshold (object: { amount: number, token: string }) — amounts at or above this need human approval
  - perCounterpartyCap (object: { amount: number, token: string }) — max per single contract per day
  - expiresAt (ISO 8601 datetime string)
  - notes (string, human-readable notes)

Valid token values: "ETH", "USDC", "USDT", "DAI", "WETH", "WBTC"

Rules:
- Use EXACT field names above. Do NOT invent other field names (no "spendingLimit", no "cap", etc.).
- Be precise and literal. "around $50" → use 50 exactly.
- If a token is not specified but an amount is mentioned with a "$" symbol, assume USDC.
- If a time window references a timezone like "New York time", use "America/New_York". Default to "UTC" if unspecified.
- If the user mentions "human approval" or "manual approval" above a threshold, set approvalThreshold.
- If the user mentions specific protocols like Uniswap, set the allowlist to the well-known contract address:
  - Uniswap V3 Router: 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45
  - Uniswap Universal Router: 0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD
  - Aave V3 Pool (Sepolia): 0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951
  - Compound USDC: 0xc3d688B66703497DAA19211EEdff47f25384cdc3
- ALWAYS set version to "1".
- ALWAYS set a descriptive name based on the user's input.
- At least one constraint field (dailyCap, allowlist, timeWindow, approvalThreshold, or perCounterpartyCap) must be present.
- If the input is too vague to produce a valid policy (e.g. "don't spend too much"), do NOT produce a policy. Instead, set a special field "__error__" explaining what information is missing.
- Do NOT include fields that were not requested. Omit optional fields when not applicable.

You MUST respond with ONLY valid JSON. No explanations, no markdown fences, no commentary.`;

export async function POST(req: NextRequest) {
  try {
    const { naturalLanguage } = await req.json();

    if (!naturalLanguage || typeof naturalLanguage !== "string") {
      return NextResponse.json({ error: "naturalLanguage field is required" }, { status: 400 });
    }

    if (naturalLanguage.trim().length < 5) {
      return NextResponse.json({ error: "Policy description too short" }, { status: 400 });
    }

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Translate this natural language policy into JSON:\n\n"${naturalLanguage.trim()}"`,
        },
      ],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text.trim() : "";

    // Strip any accidental markdown fences
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return NextResponse.json(
        { error: "Model returned invalid JSON — try rephrasing your policy", raw: rawText },
        { status: 422 }
      );
    }

    // Check for the model's own error signal
    if (typeof parsed === "object" && parsed !== null && "__error__" in parsed) {
      return NextResponse.json(
        { error: (parsed as Record<string, unknown>).__error__ as string, ambiguous: true },
        { status: 422 }
      );
    }

    // Run our validator
    const validation = validatePolicy(parsed);
    if (!validation.valid) {
      // Retry once with the validation errors as feedback
      const retryMessage = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Translate this natural language policy into JSON:\n\n"${naturalLanguage.trim()}"`,
          },
          {
            role: "assistant",
            content: jsonText,
          },
          {
            role: "user",
            content: `Your JSON failed validation with these errors:\n${validation.errors.map((e) => `- ${e}`).join("\n")}\n\nPlease fix these issues and return corrected JSON only.`,
          },
        ],
      });

      const retryText =
        retryMessage.content[0].type === "text" ? retryMessage.content[0].text.trim() : "";
      const retryJson = retryText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

      try {
        parsed = JSON.parse(retryJson);
      } catch {
        return NextResponse.json(
          { error: "Model could not produce valid JSON after retry", errors: validation.errors },
          { status: 422 }
        );
      }

      const retryValidation = validatePolicy(parsed);
      if (!retryValidation.valid) {
        return NextResponse.json(
          { error: "Policy validation failed", errors: retryValidation.errors, policy: parsed },
          { status: 422 }
        );
      }
    }

    return NextResponse.json({ policy: parsed as AllowancePolicy }, { status: 200 });
  } catch (err: unknown) {
    console.error("[translate-policy]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
