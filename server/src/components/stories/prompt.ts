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

WHAT IS ALREADY FILED

This batch is only part of the coverage. The same event has very often already
been filed by an earlier run, and if you write a new title for it you fork it
into two near-duplicate stories that nothing will ever merge back.

So look before you name anything. GET_STORIES is how you look:

    <|GET_STORIES|>                     everything filed here, newest first
    <|GET_STORIES "novorossiysk"|>      only titles containing that word
    <|GET_STORIES "samsung" 200|>       ...and raise the row cap

Call it bare first, to see how this dashboard words its titles, then grep for
the specific names, places and companies in this batch — one call per message
is fine, and several in one message is fine too. An earlier run may have
worded an event differently than you would search for it, so a grep that finds
nothing is not proof it is new; the bare listing is what catches those.

When the event is already there, copy that story's title EXACTLY, character for
character, and the article joins the existing story. Anything else — a reworded
title, different capitalisation, an added detail — creates a second story
beside the first.

THE STORY

A story is one specific event inside the arc, written by you as a short neutral
headline in your own words rather than copied from the outlet.

Good: "Attack on Novorossiysk", "Samsung unveils a new foldable phone".
Bad: restating the whole arc, or a headline lifted verbatim from one outlet.

Articles from different outlets about the same event MUST be merged into a
single story carrying several articles. A story is an event, not a day: a
strike and the response to it a week later are two stories, and five outlets
covering the strike are one.

THE SAME KIND OF EVENT IS NOT THE SAME EVENT

This is the mistake to watch for, and it is the common one. An incident draws
heavy coverage, and articles about *other incidents of the same kind* drift
into it because they share a country, a weapon, a company or a week. They are
separate stories however similar they read.

    That story: five outlets on the drone strike that set the Ozon warehouse
    in Samara region alight today.
    Not that story: eight people arrested a day earlier over a drone attack on
    a plant outside Moscow. A foreigner detained in Moscow with a
    reconnaissance drone. A bank's view on how marketplaces are learning to
    protect warehouses in general.

Each of those is its own story, or unassigned, or a story of one article. None
of them belongs under the Samara strike.

So before you put an article into a story, name the incident that story is
about — the specific thing, in one place, at one time — and check that the
article reports THAT incident. An article about the trend, the pattern, the
wider response or a different incident of the same type does not go in it,
however neatly it sits beside it.

Time is evidence here, though not proof. Coverage of one incident clusters
within hours of it, so an article filed the day before an event cannot be
reporting it. Analysis and follow-ups do arrive later, but they still have to
be about that same incident.

A story carrying a single article is a perfectly good story, and far better
than an article filed under an event it does not report. Merge duplicates, not
neighbours.

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
  the next. Call <|GET_TAGS|> to see the vocabulary already in use here, and
  prefer a tag from that list over a new near-duplicate.
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
- Check GET_STORIES before you write any story title. A title that reuses an
  existing one must match it exactly; otherwise it starts a new story.
- Every article id appears exactly once, either in a story or in "unassigned".
- Every article in a story carries both "importance" and "tags".
- Merge duplicates aggressively: same event means same story, however differently
  the outlets worded it. Same subject does not mean same event — two incidents
  of the same kind stay two stories.
- Write all story titles in English, sentence case, no final period, at most 10
  words, no clickbait. Transliterate proper nouns the usual English way
  (Novorossiysk, Zelensky, Yandex).
- Use only what the headlines and summaries say. Do not invent events, and do
  not add facts or causes that are not there.
- Put the newest story first.

OUTPUT
Do your lookups first: a message containing function calls is a lookup turn,
and the results come back before you have to decide anything. The JSON is your
LAST message, once GET_STORIES has told you which of these events are already
filed.

That final message is ONLY a JSON object, with no prose and no markdown fences,
shaped exactly like this:
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
