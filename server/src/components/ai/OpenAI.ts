const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export async function sendMessage(
  model: string,
  message: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: message }],
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail =
      body?.error?.message || body?.error || JSON.stringify(body) || "";
    throw new Error(
      `OpenAI API error (${response.status}): ${detail}`.trim(),
    );
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    const reason = json.choices?.[0]?.finish_reason;
    const model = json.model;
    const prompt = json.usage?.prompt_tokens;
    const completion = json.usage?.completion_tokens;
    throw new Error(
      `OpenAI empty response from ${model} (finish_reason: ${reason}, tokens: ${prompt}→${completion})`,
    );
  }
  return content;
}
