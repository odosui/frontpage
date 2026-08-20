export type PromptArticle = {
  id: number;
  title: string;
  source: string;
  publishedAt: string;
  description?: string;
};

const DESCRIPTION_LIMIT = 300;

const SCHEMA = `{
  "stories": [
    {
      "story": "Attack on Novorossiysk",
      "articles": [
        { "id": 3, "importance": 7, "tags": ["russia", "ukraine", "drone strike", "black sea"] },
        { "id": 11, "importance": 6, "tags": ["russia", "ukraine", "drone strike", "oil terminal"] }
      ]
    }
  ],
  "unassigned": [{ "article_id": 7, "reason": "horoscope, not news" }]
}`;

/**
 * One level: the story. The arc above it is the dashboard, which is already
 * decided before the model is asked anything, and the broad subject below it
 * is carried by tags.
 *
 * The examples matter more than the rules here — models otherwise write one
 * story per article, or one story per week of an arc.
 *
 * Tags are attached to the article inside its story rather than listed
 * separately: a parallel id-keyed list makes models drop and duplicate ids.
 */
export const categorizeStoriesPrompt = (
  dashboard: string,
  articles: PromptArticle[],
) =>
  `Group the headlines below into stories, and tag every article.

THE DASHBOARD

Everything you file goes under one running arc, and this is it:

    ${dashboard}

That arc is already decided. You are not naming it, choosing between arcs, or
filing anything outside it — you are saying which of these headlines belong to
it, and which events they make up.

THE STORY

A story is one specific event inside the arc, written by you as a short neutral
headline in your own words rather than copied from the outlet.

Good: "Attack on Novorossiysk", "Samsung unveils a new foldable phone".
Bad: restating the whole arc, or a headline lifted verbatim from one outlet.

Articles from different outlets about the same event MUST be merged into a
single story carrying several articles. A story is an event, not a day: a
strike and the response to it a week later are two stories, and five outlets
covering the strike are one.

WHAT DOES NOT BELONG

The sources feeding this dashboard also publish things that have nothing to do
with its arc — a source may feed several dashboards, and a general outlet's
front page is mostly other arcs' business. Put those in "unassigned", with a
short reason. So does anything that is not news at all: an affiliate deal post,
a horoscope, a recipe, a section index.

This is a normal outcome for a large share of a batch, not a failure. Be
neither precious nor loose: an arc about the war takes the sanctions story and
the grain-export story, and does not take a football result because both
countries have teams.

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

IMPORTANCE

Every article also carries an "importance": a whole number from 1 to 10 saying
how much a reader following this arc should care about it.

  9-10  changes the course of the arc — war breaks out, a head of state falls,
        a market crashes
  7-8   major news within it — a big offensive, an election result, a central
        bank decision, a major company collapsing
  5-6   solid news that matters beyond its own corner — a court ruling, a
        notable product launch, a regional escalation
  3-4   routine coverage, incremental updates, local incidents
  1-2   trivia, human interest, lifestyle, sport results, celebrity

Judge the event itself, not how loudly the headline is written. Two articles in
the same story usually get the same importance; they differ only when one adds
significantly more. Use the whole range — most articles are not 8s, and a batch
where everything scores 6 or 7 is wrong.

RULES
- Every article id appears exactly once, either in a story or in "unassigned".
- Every article in a story carries both "importance" and "tags".
- Merge duplicates aggressively: same event means same story, however differently
  the outlets worded it.
- Write all story titles in English, sentence case, no final period, at most 10
  words, no clickbait. Transliterate proper nouns the usual English way
  (Novorossiysk, Zelensky, Yandex).
- Use only what the headlines and summaries say. Do not invent events, and do
  not add facts or causes that are not there.
- Put the newest story first.

OUTPUT
Return ONLY a JSON object, with no prose and no markdown fences, shaped exactly
like this:
${SCHEMA}

ARTICLES
Some articles carry the outlet's own summary on an indented line below the
headline. Where it is there, use it — it is the best evidence you have for
whether two differently-worded headlines are the same event. Where it is
missing, judge on the headline alone; its absence says nothing about the
article.

${articles.map(renderArticle).join("\n")}`;

function renderArticle(a: PromptArticle): string {
  const line = `${a.id}. [${a.publishedAt}] (${a.source}) ${a.title}`;
  const summary = a.description?.trim();
  if (!summary) return line;

  // one line per article keeps the list scannable and the ids aligned
  const flat = summary.replace(/\s+/g, " ");
  const clipped =
    flat.length > DESCRIPTION_LIMIT
      ? `${flat.slice(0, DESCRIPTION_LIMIT).trimEnd()}…`
      : flat;

  return `${line}\n    ${clipped}`;
}
