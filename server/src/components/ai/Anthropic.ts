const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export async function sendMessage(
  model: string,
  message: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 16384,
      messages: [{ role: "user", content: message }],
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.error?.message || JSON.stringify(body) || "";
    throw new Error(
      `Anthropic API error (${response.status}): ${detail}`.trim(),
    );
  }

  const json = await response.json();
  const content = json.content?.[0]?.text;
  if (!content) {
    throw new Error(
      `Anthropic returned empty response${json.stop_reason ? ` (stop_reason: ${json.stop_reason})` : ""}`,
    );
  }
  return content;
}
