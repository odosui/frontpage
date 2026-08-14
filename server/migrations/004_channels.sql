-- +migrate up

-- Widgets were tiles on a grid; channels are just sources we pull from. The
-- grid coordinates go away, and `kind` makes room for sources that aren't
-- websites (telegram, twitter, …).
alter table widgets rename to channels;

alter table channels
  drop column x,
  drop column y,
  drop column w,
  drop column h,
  add column kind text not null default 'web'
    check (kind in ('web', 'rss', 'telegram', 'twitter'));

alter table articles rename column widget_id to channel_id;

-- renaming a table leaves its constraint and index names behind
alter index widgets_pkey rename to channels_pkey;
alter table channels
  rename constraint widgets_dashboard_id_fkey to channels_dashboard_id_fkey;
alter table articles
  rename constraint articles_dashboard_id_widget_id_fkey
                 to articles_dashboard_id_channel_id_fkey;

alter index articles_widget_position_idx rename to articles_channel_position_idx;

-- the feed reads every article of a dashboard newest first, across channels
create index articles_dashboard_recent_idx
  on articles (dashboard_id, created_at desc, position);

-- +migrate down

drop index articles_dashboard_recent_idx;

alter index articles_channel_position_idx rename to articles_widget_position_idx;

alter table articles
  rename constraint articles_dashboard_id_channel_id_fkey
                 to articles_dashboard_id_widget_id_fkey;
alter table channels
  rename constraint channels_dashboard_id_fkey to widgets_dashboard_id_fkey;
alter index channels_pkey rename to widgets_pkey;

alter table articles rename column channel_id to widget_id;

alter table channels
  drop column kind,
  add column x integer not null default 0,
  add column y integer not null default 0,
  add column w integer not null default 1,
  add column h integer not null default 1;

alter table channels rename to widgets;
