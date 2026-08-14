export type PromptArticle = {
  id: number;
  title: string;
  source: string;
  publishedAt: string;
};

const SCHEMA = `{
  "storylines": [
    {
      "storyline": "Russian-Ukrainian war",
      "standalone": false,
      "stories": [
        {
          "story": "Attack on Novorossiysk",
          "articles": [
            { "id": 3, "tags": ["russia", "ukraine", "drone strike", "black sea"] },
            { "id": 11, "tags": ["russia", "ukraine", "drone strike", "oil terminal"] }
          ]
        }
      ]
    }
  ],
  "unassigned": [{ "article_id": 7, "reason": "horoscope, not news" }]
}`;

/**
 * Two levels, widest first: storyline (the running arc) and story (the single
 * event), with tags carrying the broad subject that used to be a third level.
 * The examples matter more than the rules here — models otherwise collapse the
 * two levels into one.
 *
 * Tags are attached to the article inside its story rather than listed
 * separately: a parallel id-keyed list makes models drop and duplicate ids.
 */
export const categorizeStoriesPrompt = (articles: PromptArticle[]) =>
  `You are a news desk editor. Group the headlines below into stories, and tag every article.

THE TWO LEVELS

1. storyline — an ongoing narrative that spans weeks or months and that
   individual events belong to.
   Good: "Russian-Ukrainian war", "Western sanctions on Russia", "AI chip race",
   "Apple's foldable line", "Bird flu outbreak".
   Bad: restating one single event.
   Several stories normally share one storyline. If an event truly belongs to
   no running arc, name the general thread it would start and set "standalone": true.

2. story — one specific event, written by you as a short neutral headline in your
   own words rather than copied from the outlet.
   Good: "Attack on Novorossiysk", "Samsung unveils a new foldable phone".
   Articles from different outlets about the same event MUST be merged into a
   single story carrying several articles.

So: "Attack on Novorossiysk" (story) sits under "Russian-Ukrainian war"
(storyline).

TAGS

Every article carries its own tags — two articles in the same story may differ.

- 3 to 5 tags per article, ordered broadest first.
- The first tag is the broad subject the article would be filed under: russia,
  ukraine, technology, science, business, politics, culture, sport, health.
- The rest name what this article is specifically about: places, people,
  organisations, and the kind of event. Novorossiysk, zelensky, samsung,
  drone strike, interest rates, earthquake.
- Lowercase, English, one to three words, no punctuation, no hashtags, singular
  where it reads naturally (drone strike, not drone strikes).
- Reuse tags relentlessly. The same idea MUST get the exact same string every
  time it appears — never "us election" in one article and "u.s. elections" in
  the next. Prefer a tag you have already used over a new near-duplicate.
- Do not restate the story headline as a tag, and do not tag the outlet name.

RULES
- Every article id appears exactly once, either in a story or in "unassigned".
- Merge duplicates aggressively: same event means same story, however differently
  the outlets worded it.
- Write all storyline and story titles in English, sentence case, no final
  period, at most 10 words, no clickbait. Transliterate proper nouns the usual
  English way (Novorossiysk, Zelensky, Yandex).
- Use only what the headlines say. Do not invent events, and do not add facts or
  causes that are not there.
- Sort storylines by how many articles they hold, largest first; inside each
  storyline, put the newest story first.

OUTPUT
Return ONLY a JSON object, with no prose and no markdown fences, shaped exactly
like this:
${SCHEMA}

ARTICLES
${articles
  .map((a) => `${a.id}. [${a.publishedAt}] (${a.source}) ${a.title}`)
  .join("\n")}`;
