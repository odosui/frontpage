import { Article } from "../../api/types";
import { sendMessage } from "../ai/OpenRouter";

import fs from "fs/promises";

const MODEL = "google/gemini-3-flash-preview";
// const MODEL = "claude-sonnet-4-6";

const HTML_LIMIT = 200_000;

export async function fetchLatestArticles(url: string) {
  const rawHtml = await fetchUrlHtml(url);

  const cleanedHtml = cleanHtml(rawHtml);
  console.log(cleanedHtml.length, "characters of cleaned HTML");

  // save to a tmp file
  const path = `tmp/aaa.html`;
  await fs.mkdir("tmp", { recursive: true });
  await fs.writeFile(path, cleanedHtml);
  console.log("Cleaned HTML saved to", path);

  const croppedHtml = cleanedHtml.slice(0, HTML_LIMIT);

  const baseUrl = new URL(url);

  const aiResponse = await sendMessage(
    MODEL,
    `Extract up to 20 articles from this webpage HTML. Return ONLY a JSON array of objects with fields: title (string), url (string), image (string, empty if none).

Rules:
- Only include actual articles/posts with a real, specific article URL found in the HTML (in an <a> href). Do NOT use the homepage or base URL as a fallback — if you cannot find a specific article URL, skip that entry entirely.
- Not navigation links or ads.
- Return newest first.
- Convert relative paths to absolute URLs using the base: "${baseUrl.origin}".

HTML:\n${croppedHtml}`,
  );

  console.log("AI response:", aiResponse);

  const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("failed to parse AI response");
  }

  const articles: Article[] = JSON.parse(jsonMatch[0]);

  return articles.filter((a) => {
    try {
      const parsed = new URL(a.url);
      return parsed.pathname !== "/" || parsed.search !== "";
    } catch {
      return false;
    }
  });
}

async function fetchUrlHtml(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Frontpage-Bot/1.0 (+https://github.com/odosui/frontpage)",
    },
  });
  const html = await res.text();
  return html;
}

function cleanHtml(html: string) {
  return (
    (html.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? html)
      // Remove non-content tags
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<svg[\s\S]*?<\/svg>/gi, "")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      // Remove non-content self-closing tags
      .replace(
        /<(meta|link|input|button|iframe|source|video|audio)\b[^>]*\/?>/gi,
        "",
      )
      // Strip all attributes except href and src
      .replace(
        /\s+(?:class|id|style|role|tabindex|loading|decoding|fetchpriority|sizes|srcset|width|height|data-[a-z0-9-]*|aria-[a-z0-9-]*)="[^"]*"/gi,
        "",
      )
      // Remove empty tags and whitespace
      .replace(/<([a-z][a-z0-9]*)>\s*<\/\1>/gi, "")
      .replace(/\s{2,}/g, " ")
  );
}
