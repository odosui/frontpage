-- +migrate up

-- A fact rests on however many articles it rests on, not one.
--
-- The single `articleId` was a bad fit for what actually happens: a claim is
-- reported, then corroborated somewhere else, then dated by a third piece a
-- week later. Under one slot each of those either overwrote the last citation
-- or was dropped, so the fact ended up pointing at whichever article was read
-- most recently rather than at what it stands on.
--
-- So `facts` entries carry `articleIds`, an array, newest citation last:
--   [{"id": "f3", "content": "...", "confidence": 4, "articleIds": [9241, 9310],
--     "createdAt": "2026-08-17T09:00:00.000Z"}, ...]
-- They are still plain numbers rather than foreign keys, so a deleted article
-- leaves a citation that no longer resolves instead of taking the fact with it.

update fact_versions
   set facts = (
     select coalesce(jsonb_agg(
              (f - 'articleId') || jsonb_build_object(
                'articleIds',
                case when jsonb_typeof(f -> 'articleId') = 'number'
                     then jsonb_build_array(f -> 'articleId')
                     else '[]'::jsonb
                end
              )
              order by ord
            ), '[]'::jsonb)
       from jsonb_array_elements(fact_versions.facts) with ordinality as t(f, ord)
   )
 where jsonb_array_length(facts) > 0;

-- +migrate down

-- Only the first citation survives going back; the rest have nowhere to live.
update fact_versions
   set facts = (
     select coalesce(jsonb_agg(
              (f - 'articleIds') || jsonb_build_object(
                'articleId',
                coalesce(f -> 'articleIds' -> 0, 'null'::jsonb)
              )
              order by ord
            ), '[]'::jsonb)
       from jsonb_array_elements(fact_versions.facts) with ordinality as t(f, ord)
   )
 where jsonb_array_length(facts) > 0;
