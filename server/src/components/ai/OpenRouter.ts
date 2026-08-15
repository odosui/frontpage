/** Slow reasoning models can sit well past a minute; raise it when comparing them. */
export const AI_TIMEOUT_MS =
  Number(process.env.FRONTPAGE_AI_TIMEOUT_MS) || 120_000;

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export type Usage = {
  /** The model that actually served the request — may differ from the one asked for. */
  model: string;
  promptTokens: number;
  completionTokens: number;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function sendMessage(
  model: string,
  message: string,
): Promise<string> {
  return (await sendMessageWithUsage(model, message)).content;
}

/** As `sendMessage`, but also reports what the call cost in tokens. */
export async function sendMessageWithUsage(
  model: string,
  message: string,
): Promise<{ content: string; usage: Usage }> {
  return sendChat(model, [{ role: "user", content: message }]);
}

/** A whole conversation, for the multi-turn agent loop. */
export async function sendChat(
  model: string,
  messages: ChatMessage[],
): Promise<{ content: string; usage: Usage }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is not set");
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail =
      body?.error?.message || body?.error || JSON.stringify(body) || "";
    throw new Error(
      `OpenRouter API error (${response.status}): ${detail}`.trim(),
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
      `OpenRouter empty response from ${model} (finish_reason: ${reason}, tokens: ${prompt}→${completion})`,
    );
  }
  return {
    content,
    usage: {
      model: json.model ?? model,
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
    },
  };
}
