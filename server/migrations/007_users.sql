-- +migrate up

-- Who is allowed in.
--
-- There is no sign-up: the app is one reader's (or a small group's) instance,
-- and accounts are made from the command line — `npm run user:create`. All the
-- table has to hold is enough to check a password, so it holds exactly that.
--
-- Nothing else in the schema references a user. The arcs, sources and stories
-- are the instance's, not any one account's; users are the gate in front of
-- them rather than an owner of them.
create table users (
  id            serial primary key,
  -- lower-cased on the way in, so the unique index is the real constraint
  email         text not null unique,
  -- scrypt, salt and parameters inline; see models/users
  password_hash text not null,
  created_at    timestamptz not null default now()
);

comment on table users is
  'Accounts that may use the api. Created from the cli; there is no sign-up.';

-- +migrate down

drop table users;
