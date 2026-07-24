// Default to Haiku for cost -- roughly 1/3 the price of Sonnet at this
// app's token volumes (see README for per-request cost estimates). Set
// ANTHROPIC_MODEL=claude-sonnet-5 for noticeably better narrative quality
// on the profile report, at ~3x the cost.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const API_VERSION = "2023-06-01";

const RETRYABLE_STATUSES = new Set([429, 500, 503, 529]); // 529 = Anthropic "overloaded"
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Claude has no native "return only JSON" mode (Anthropic's Structured
// Outputs beta needs extra headers/schema plumbing per model) -- instead we
// just instruct it clearly in the system prompt and defensively strip any
// ```json ... ``` fences it might wrap the answer in.
function stripCodeFences(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

// Same shape as the Groq/Gemini helpers it replaces: { system, user, jsonMode }
// in, plain text (or a JSON string when jsonMode) out.
async function callClaude({ system, user, jsonMode = false, maxRetries = 2 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set in the site's environment variables");
  }

  const systemPrompt = jsonMode
    ? `${system}\n\nRespond with ONLY the raw JSON object. No markdown code fences, no explanation before or after it.`
    : system;

  const body = {
    model: MODEL,
    max_tokens: 1024,
    temperature: 0.1,
    system: systemPrompt,
    messages: [{ role: "user", content: user }],
  };

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": API_VERSION,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw err;
    }

    if (!res.ok) {
      const text = await res.text();
      lastError = new Error(`Claude API error (${res.status}): ${text}`);
      if (RETRYABLE_STATUSES.has(res.status) && attempt < maxRetries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw lastError;
    }

    const data = await res.json();
    const block = (data.content || []).find((b) => b.type === "text");
    const text = block && block.text;
    if (!text) {
      throw new Error(`Claude returned no text (stop_reason: ${data.stop_reason || "unknown"})`);
    }
    return jsonMode ? stripCodeFences(text) : text;
  }

  throw lastError;
}

module.exports = { callClaude };
