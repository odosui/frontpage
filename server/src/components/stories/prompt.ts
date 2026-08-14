export type PromptArticle = {
  id: number;
  title: string;
  source: string;
  publishedAt: string;
};

const SCHEMA = `{
  "categories": [
    {
      "category": "Russia",
      "bigger_stories": [
        {
          "bigger_story": "Russian-Ukrainian war",
          "standalone": false,
          "stories": [
            { "story": "Attack on Novorossiysk", "article_ids": [3, 11] }
          ]
        }
      ]
    }
  ],
  "unassigned": [{ "article_id": 7, "reason": "horoscope, not news" }]
}`;

/**
 * Three levels, widest first: category (a newspaper section), bigger story (the
 * running arc), story (the single event). The examples matter more than the
 * rules here — models otherwise collapse the middle level into the top one.
 */
export const categorizeStoriesPrompt = (articles: PromptArticle[]) =>
  `You are a news desk editor. Organize the headlines below into a three-level hierarchy.

THE THREE LEVELS

1. category — a broad desk or section that would still exist a year from now.
   Good: Russia, Ukraine war, Technology, Science, Business, Politics, Culture, Sports.
   Bad: anything naming a single event, company or person.
   Keep the set small (aim for 8 or fewer) and reuse categories across many stories.

2. bigger_story — an ongoing narrative that spans weeks or months and that
   individual events belong to.
   Good: "Russian-Ukrainian war", "Western sanctions on Russia", "AI chip race",
   "Apple's foldable line", "Bird flu outbreak".
   Bad: restating the category, or restating one event.
   Several stories normally share one bigger story. If an event truly belongs to
   no running arc, name the general thread it would start and set "standalone": true.

3. story — one specific event, written by you as a short neutral headline in your
   own words rather than copied from the outlet.
   Good: "Attack on Novorossiysk", "Samsung unveils a new foldable phone".
   Articles from different outlets about the same event MUST be merged into a
   single story carrying several article ids.

So: "Attack on Novorossiysk" (story) sits under "Russian-Ukrainian war"
(bigger story) which sits under "Russia" (category).

RULES
- Every article id appears exactly once, either in a story or in "unassigned".
- Merge duplicates aggressively: same event means same story, however differently
  the outlets worded it.
- Write all category, bigger_story and story titles in English, sentence case, no
  final period, at most 10 words, no clickbait. Transliterate proper nouns the
  usual English way (Novorossiysk, Zelensky, Yandex).
- Use only what the headlines say. Do not invent events, and do not add facts or
  causes that are not there.
- Sort categories by how many articles they hold, largest first; inside each
  bigger story, put the newest story first.

OUTPUT
Return ONLY a JSON object, with no prose and no markdown fences, shaped exactly
like this:
${SCHEMA}

ARTICLES
${articles
  .map((a) => `${a.id}. [${a.publishedAt}] (${a.source}) ${a.title}`)
  .join("\n")}`;
