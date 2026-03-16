export const extractArticlesPrompt = (baseOrigin: string, html: string) =>
  `Extract up to 20 articles from this webpage HTML. Return ONLY a JSON array of objects with fields: title (string), url (string), image (string, empty if none).

Rules:
- Only include actual articles/posts with a real, specific article URL found in the HTML (in an <a> href). Do NOT use the homepage or base URL as a fallback — if you cannot find a specific article URL, skip that entry entirely.
- Not navigation links or ads.
- Return newest first.
- Convert relative paths to absolute URLs using the base: "${baseOrigin}".

HTML:\n${html}`;
