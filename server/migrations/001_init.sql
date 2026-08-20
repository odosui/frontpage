-- +migrate up

-- The whole schema, in one migration.
--
-- The shape it settled on, widest first:
--
--   dashboard   the running arc — "Russian-Ukrainian war", weeks or months.
--               It owns the stories filed under it, what those stories are
--               taken to establish, what they point to, and the conversations
--               about them. It used to be called a storyline.
--     story     one event inside it — "Attack on Novorossiysk", merging the
--               several outlets that covered it
--       article one headline from one outlet
--
-- Sources sit outside that tree entirely. A source is a place we pull
-- headlines from, it belongs to nobody, and any number of dashboards may
-- read it — which is the whole point: one BBC feed serves the war arc and
-- the chip-race arc at once, without being fetched twice.

create table dashboards (
  -- the slug, and how the dashboard is addressed in a url
  id         text primary key,
  -- what the reader called it, with its spaces and punctuation intact
  name       text not null,
  created_at timestamptz not null default now()
);

-- A place we pull headlines from. Global: `kind` says how to fetch it, and
-- the validators below are the source's own state, not any dashboard's.
create table sources (
  id            text primary key,
  name          text not null,
  kind          text not null default 'web'
    check (kind in ('web', 'rss', 'telegram', 'twitter')),
  url           text not null default '',
  -- Lets a fetch ask "has this actually changed?" before paying for a model
  -- call: HTTP validators for a 304, plus a hash of what we last analyzed.
  etag          text,
  last_modified text,
  content_hash  text,
  fetched_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- Which dashboards read which sources. Many-to-many in both directions: a
-- dashboard pulls from several sources, and a source feeds several dashboards.
create table dashboard_sources (
  dashboard_id text not null
    references dashboards (id) on delete cascade on update cascade,
  source_id    text not null
    references sources (id) on delete cascade on update cascade,
  -- the order the reader put them in, per dashboard
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  primary key (dashboard_id, source_id)
);

-- the reverse lookup: every dashboard reading one source, which is what a
-- finished fetch has to reload
create index dashboard_sources_source_idx on dashboard_sources (source_id);

-- One headline, stored once however many dashboards end up reading it. It
-- belongs to the source it came from and to nothing else — where it is filed
-- is a dashboard's opinion, and lives in `article_filings`.
create table articles (
  id             bigserial primary key,
  source_id      text not null
    references sources (id) on delete cascade on update cascade,
  -- the order the source listed it in, newest first within one fetch
  position       integer not null default 0,
  title          text not null,
  url            text not null,
  image          text not null default '',
  -- What a feed tells us that a front page does not. Both stay null for web
  -- sources — the extraction model is asked for links, not for prose it would
  -- have to invent a date for.
  published_at   timestamptz,
  description    text,
  -- The one date everything sorts by. `published_at` is what the reader means
  -- by "when did this happen", but only feeds supply it, so `created_at` —
  -- when we first saw it — stands in where it is missing. `least` ignores
  -- nulls, so it is exactly that fallback, and it also keeps a publisher who
  -- post-dates an item from pinning it to the top of the feed forever.
  sorted_at      timestamptz
    generated always as (least(published_at, created_at)) stored,
  -- The article's own text, pulled from its page on demand. Separate from
  -- `description` (the outlet's blurb, which arrives with the feed) because
  -- this is the whole piece and it is fetched one article at a time, by hand.
  -- `content_at` says when we read it, which is what lets a re-read tell
  -- itself apart from a first one.
  content        text,
  content_at     timestamptz,
  -- The pictures inside it, as urls — never the bytes. Each entry is
  -- { url, alt, caption }, pointing at the publisher's own copy.
  content_images jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  -- the same link from one source is the same article, however often we refetch
  unique (source_id, url)
);

-- a source's own list, in the order it published
create index articles_source_position_idx
  on articles (source_id, position);

-- every article of a set of sources, newest first — how a dashboard's feed is
-- read
create index articles_sorted_idx on articles (sorted_at desc, position);

-- the feed asks "does this one have text yet" for every row it renders, and
-- never wants the text itself, so keep the answer out of the toasted column
create index articles_with_content_idx on articles (id) where content is not null;

-- One event, as one dashboard sees it. Two dashboards reading the same source
-- file its articles into their own stories, under their own titles.
create table stories (
  id           bigserial primary key,
  dashboard_id text not null
    references dashboards (id) on delete cascade on update cascade,
  title        text not null,
  slug         text not null,
  created_at   timestamptz not null default now(),
  unique (dashboard_id, slug)
);

create index stories_dashboard_idx on stories (dashboard_id, created_at desc);

-- Tags cut across the stories instead of nesting under them, and like stories
-- they are one dashboard's vocabulary rather than a global one.
create table tags (
  id           bigserial primary key,
  dashboard_id text not null
    references dashboards (id) on delete cascade on update cascade,
  name         text not null,
  slug         text not null,
  created_at   timestamptz not null default now(),
  unique (dashboard_id, slug)
);

-- What one dashboard decided about one article: which of its stories the
-- article belongs to, how much it matters here, or that it is not news for
-- this arc at all.
--
-- This is the row that lets a source be shared. The same Reuters piece is a
-- story under the war arc and an irrelevance under the chip-race arc, and
-- neither dashboard's judgement is visible to the other. An article with no
-- filing row in a dashboard is that dashboard's work queue.
create table article_filings (
  dashboard_id   text not null
    references dashboards (id) on delete cascade on update cascade,
  article_id     bigint not null references articles (id) on delete cascade,
  -- null while the article is filed as "not news"; losing the story must not
  -- lose the filing, hence set null rather than cascade
  story_id       bigint references stories (id) on delete set null,
  -- How much this matters, 1 (routine) to 10 (world-changing), as judged by
  -- the categorizing agent for this dashboard.
  importance     smallint
    check (importance is null or importance between 1 and 10),
  -- When the agent looked at the article and said it is not news for this
  -- arc — an affiliate post, a horoscope, or simply another arc's business.
  -- Stamping the rejection is what takes it out of the queue for good.
  skipped_at     timestamptz,
  skipped_reason text,
  created_at     timestamptz not null default now(),
  primary key (dashboard_id, article_id)
);

-- the story feed reads every article filed under a story
create index article_filings_story_idx on article_filings (story_id, article_id);

-- Tagging is per dashboard by way of the tag itself, so the pair needs no
-- dashboard of its own.
create table article_tags (
  article_id bigint not null references articles (id) on delete cascade,
  tag_id     bigint not null references tags (id) on delete cascade,
  primary key (article_id, tag_id)
);

-- the reverse lookup: every article carrying a tag
create index article_tags_tag_idx on article_tags (tag_id);

-- What this dashboard is known to establish, as opposed to what any one
-- article claims, versioned as a set rather than kept as editable rows.
--
-- What an arc establishes is one document, not a bag of independent lines:
-- raising the confidence on one fact usually happens *because* of what another
-- one now says. So every revision writes a whole new row — the complete list
-- as it stood, who wrote it, and why — and nothing is ever updated in place.
--
-- `facts` is an array of objects, newest first:
--   [{"id": "f3", "content": "...", "confidence": 2, "articleId": 9241,
--     "createdAt": "2026-08-17T09:00:00.000Z"}, ...]
-- The id is stable across versions, so the same fact can be followed from one
-- to the next, and `createdAt` is when it was first written down rather than
-- when this version was. `articleId` is a plain number rather than a foreign
-- key, so a deleted article leaves a citation that no longer resolves instead
-- of taking the fact with it.
create table fact_versions (
  id           bigserial primary key,
  dashboard_id text not null
    references dashboards (id) on delete cascade on update cascade,
  -- 1 upwards, per dashboard
  version      integer not null,
  facts        jsonb not null default '[]'::jsonb,
  -- who revised it; the reader through the ui, or the analyst through its tool
  author       text not null default 'reader'
    check (author in ('reader', 'analyst')),
  -- why the set changed. The analyst is made to give one; the reader's own
  -- edits usually speak for themselves, so it is null there
  reasoning    text,
  created_at   timestamptz not null default now(),
  unique (dashboard_id, version)
);

-- reading the current set is `order by version desc limit 1`, and the history
-- panel walks the same index
create index fact_versions_latest_idx on fact_versions (dashboard_id, version desc);

-- A claim about what happens next, written by the reader. Facts are what the
-- dashboard has established; a prediction is what it points to and has not
-- settled yet.
--
-- The reader writes the claim and leaves the number alone. Putting a
-- probability on it is the analyst's job, and it is a job it does again every
-- time the coverage moves.
create table predictions (
  id           bigserial primary key,
  dashboard_id text not null
    references dashboards (id) on delete cascade on update cascade,
  content      text not null,
  -- 0-100, or null until it has been forecast for the first time. Kept here as
  -- well as in `forecasts` so the list can be read without touching the
  -- history — this is always the newest forecast's probability
  probability  smallint check (probability between 0 and 100),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index predictions_dashboard_idx on predictions (dashboard_id, id);

-- One estimate, with why. A probability that moves without a reason is
-- unreviewable: months later the only way to judge a forecaster — human or
-- model — is to read what it thought at the time, so every move is kept rather
-- than overwriting the last.
create table forecasts (
  id            bigserial primary key,
  prediction_id bigint not null
    references predictions (id) on delete cascade,
  probability   smallint not null check (probability between 0 and 100),
  -- what it was before this, so a move can be read without its neighbours.
  -- Null for the first forecast, which moved from nothing
  previous      smallint check (previous between 0 and 100),
  -- never empty: the reason is the point of the record
  reasoning     text not null,
  -- who moved it, for when the two disagree
  author        text not null default 'analyst'
    check (author in ('analyst', 'reader')),
  created_at    timestamptz not null default now()
);

create index forecasts_prediction_idx
  on forecasts (prediction_id, created_at desc, id desc);

-- One unit of work the worker runs and retries.
create table jobs (
  id           bigserial primary key,
  type         text not null,
  status       text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  payload      jsonb not null default '{}'::jsonb,
  result       jsonb,
  error        text,
  attempts     integer not null default 0,
  max_attempts integer not null default 3,
  run_at       timestamptz not null default now(),
  locked_by    text,
  locked_at    timestamptz,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- the claim query: oldest runnable job first
create index jobs_claim_idx on jobs (run_at, id) where status = 'queued';

-- requeueing jobs abandoned by a dead worker
create index jobs_locked_idx on jobs (locked_at) where status = 'running';

-- the jobs panel lists newest first
create index jobs_recent_idx on jobs (created_at desc);

-- Cleaned page html handed from a fetch_page job to its extract_articles job.
-- Kept out of jobs.payload so the queue table stays small.
create table page_snapshots (
  id         bigserial primary key,
  url        text not null,
  html       text not null,
  hrefs      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index page_snapshots_created_idx on page_snapshots (created_at);

-- An agent run: a model working a task by calling functions we expose to it,
-- one row per conversation. Kept separate from `jobs` — a job is one unit of
-- work the worker retries, a session is a dialogue that may outlive several
-- jobs and take input from a human through a chat interface.
--
-- An agent lives inside one dashboard: every function it can call sees only
-- that dashboard's stories, facts and tags, and everything it writes lands
-- there.
create table agent_sessions (
  id           bigserial primary key,
  kind         text not null,
  dashboard_id text not null
    references dashboards (id) on delete cascade on update cascade,
  status       text not null default 'running'
    check (status in ('running', 'finished', 'failed')),
  model        text not null,
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  finished_at  timestamptz
);

-- the sessions list, newest first, per dashboard and kind
create index agent_sessions_recent_idx
  on agent_sessions (dashboard_id, kind, created_at desc);

-- Every turn of the conversation, in order — what we sent, what the model
-- answered, and what each function it called returned. This is the audit trail
-- for "why did the agent decide that", and the transcript the chat shows.
create table agent_messages (
  id                bigserial primary key,
  session_id        bigint not null
    references agent_sessions (id) on delete cascade,
  -- 0-based turn number; the conversation is replayed in this order
  position          integer not null,
  role              text not null
    check (role in ('system', 'user', 'assistant', 'tool')),
  content           text not null,
  -- role = 'tool': which function produced this content, and with what arguments
  tool_name         text,
  tool_args         jsonb,
  -- role = 'assistant': what the call cost, so a session can be priced
  model             text,
  prompt_tokens     integer,
  completion_tokens integer,
  created_at        timestamptz not null default now(),
  unique (session_id, position)
);

create index agent_messages_session_idx on agent_messages (session_id, position);

-- Something an agent wants to do to the data, waiting on a person to say yes.
--
-- A tool that rewrites what has been filed cannot be allowed to act on its own
-- judgement — an agent that merges two stories it misread has destroyed work
-- no undo puts back. So the tool writes its intent here and stops; the change
-- happens later, from the reader's click, against exactly the rows named in
-- this row's payload.
create table agent_proposals (
  id           bigserial primary key,
  session_id   bigint not null
    references agent_sessions (id) on delete cascade,
  dashboard_id text not null
    references dashboards (id) on delete cascade on update cascade,
  -- what is being proposed; only 'merge_stories' so far
  kind         text not null,
  -- the whole of the action, as the tool described it. Read back at approval
  -- time, so an approved proposal does what was shown, not what the world
  -- looks like now.
  payload      jsonb not null,
  -- what the agent said it was for, shown to the reader beside the buttons
  summary      text not null,
  status       text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'failed')),
  -- what carrying it out actually did, or why it could not
  result       jsonb,
  error        text,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);

-- the chat asks for one session's proposals every time it polls
create index agent_proposals_session_idx on agent_proposals (session_id, id);

insert into dashboards (id, name) values ('default', 'Default');

-- +migrate down

drop table agent_proposals;
drop table agent_messages;
drop table agent_sessions;
drop table page_snapshots;
drop table jobs;
drop table forecasts;
drop table predictions;
drop table fact_versions;
drop table article_tags;
drop table article_filings;
drop table tags;
drop table stories;
drop table articles;
drop table dashboard_sources;
drop table sources;
drop table dashboards;
