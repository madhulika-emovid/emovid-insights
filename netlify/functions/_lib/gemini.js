// gemini-2.5-flash was deprecated for new API users -- gemini-3.5-flash is
// the current stable, free-tier-eligible model as of mid-2026. Use
// gemini-3.5-flash-lite (set GEMINI_MODEL) if you hit rate limits, it has
// higher free-tier headroom at slightly lower narrative quality.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

const RETRYABLE_STATUSES = new Set([429, 500, 503]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Same shape as the old Groq helper it replaces: { system, user, jsonMode }
// in, plain text (or a JSON string when jsonMode) out.
async function callGemini({ system, user, jsonMode = false, maxRetries = 2 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in the site's environment variables");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: jsonMode ? "application/json" : "text/plain",
    },
  };

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // network-level failure -- worth a retry too
      lastError = err;
      if (attempt < maxRetries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw err;
    }

    if (!res.ok) {
      const text = await res.text();
      lastError = new Error(`Gemini API error (${res.status}): ${text}`);
      if (RETRYABLE_STATUSES.has(res.status) && attempt < maxRetries) {
        await sleep(500 * 2 ** attempt); // 500ms, then 1000ms
        continue;
      }
      throw lastError;
    }

    const data = await res.json();
    const candidate = data.candidates && data.candidates[0];
    const text = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0]?.text;
    if (!text) {
      throw new Error(
        `Gemini returned no text (finishReason: ${candidate?.finishReason || "unknown"})`
      );
    }
    return text;
  }

  throw lastError;
}

module.exports = { callGemini };
