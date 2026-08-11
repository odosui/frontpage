-- +migrate up

create table dashboards (
  id         text primary key,
  name       text not null,
  created_at timestamptz not null default now()
);

create table widgets (
  dashboard_id text not null
    references dashboards (id) on delete cascade on update cascade,
  id           text not null,
  position     integer not null default 0,
  x            integer not null default 0,
  y            integer not null default 0,
  w            integer not null default 1,
  h            integer not null default 1,
  url          text not null default '',
  created_at   timestamptz not null default now(),
  primary key (dashboard_id, id)
);

create table articles (
  id           bigserial primary key,
  dashboard_id text not null,
  widget_id    text not null,
  position     integer not null,
  title        text not null,
  url          text not null,
  image        text not null default '',
  is_new       boolean not null default false,
  created_at   timestamptz not null default now(),
  foreign key (dashboard_id, widget_id)
    references widgets (dashboard_id, id) on delete cascade on update cascade
);

create index articles_widget_position_idx
  on articles (dashboard_id, widget_id, position);

insert into dashboards (id, name) values ('default', 'default');

-- +migrate down

drop table articles;
drop table widgets;
drop table dashboards;
