import { Article } from "../../api/types";
import { sendMessage } from "../ai/OpenRouter";
import { SMALL_MODEL } from "../ai/models";
import { PageSnapshot } from "./download";
import { extractArticlesPrompt } from "./prompt";

/** Ask the model for the articles on an already-downloaded page. */
export async function extractArticles(
  url: string,
  snapshot: PageSnapshot,
): Promise<Article[]> {
  const baseUrl = new URL(url);

  const aiResp = await sendMessage(
    SMALL_MODEL,
    extractArticlesPrompt(baseUrl.origin, snapshot.html),
  );

  const jsonMatch = aiResp.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("failed to parse AI response");
  }

  const articles: Article[] = JSON.parse(jsonMatch[0]);

  // exclude hallucinated links
  const filtered = filterByRealLinks(articles, snapshot.hrefs);

  // make sure the order matches the order of links on the page
  return fixOrder(filtered, snapshot.hrefs);
}

function filterByRealLinks(articles: Article[], hrefs: string[]): Article[] {
  const realLinks = new Set(hrefs);
  let hallucinated = 0;

  const filtered = articles.filter((a) => {
    try {
      const parsed = new URL(a.url);
      if (parsed.pathname === "/" && parsed.search === "") return false;
    } catch {
      return false;
    }

    if (!realLinks.has(a.url)) {
      console.log(`[analyze] filtered out AI-hallucinated link: ${a.url}`);
      hallucinated++;
      return false;
    }

    return true;
  });

  if (hallucinated > 0) {
    console.log(
      `[analyze] ${hallucinated} hallucinated link(s) out of ${articles.length} total`,
    );
  }

  return filtered;
}

function fixOrder(articles: Article[], hrefs: string[]): Article[] {
  const hrefIndex = new Map(hrefs.map((href, i) => [href, i]));
  return [...articles].sort(
    (a, b) =>
      (hrefIndex.get(a.url) ?? Infinity) - (hrefIndex.get(b.url) ?? Infinity),
  );
}
