-- +migrate up

-- What a storyline is known to establish, as opposed to what any one article
-- claims. Articles come and go and contradict each other; a fact is the line
-- someone — the reader or the analyst — was willing to write down, with how
-- far they would stand behind it.
--
-- Kept per storyline rather than per story: the useful ones outlive the day's
-- event ("Wildberries warehouses supply drone parts, per Ukrainian claims"),
-- and that is the level the analyst reasons at.
create table facts (
  id           bigserial primary key,
  dashboard_id text not null
    references dashboards (id) on delete cascade on update cascade,
  storyline_id bigint not null
    references storylines (id) on delete cascade,
  -- one line, the whole point of it: what is true, not a paragraph of context
  content      text not null,
  -- 1 someone said it, 5 established beyond doubt. A number rather than words
  -- so an analyst can weigh two facts against each other without parsing prose
  confidence   smallint not null default 3
    check (confidence between 1 and 5),
  -- what it rests on, when it rests on something we hold. Null for a fact from
  -- the reader's own knowledge or from the open web, and null again if the
  -- article is later deleted — losing the citation must not lose the fact
  article_id   bigint references articles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- the storyline page and the analyst's opening context both read exactly this
create index facts_storyline_idx
  on facts (dashboard_id, storyline_id, confidence desc, id);

-- +migrate down

drop table facts;
