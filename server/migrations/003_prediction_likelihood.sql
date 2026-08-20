-- +migrate up

-- Predictions move from a percentage to the same 1-5 rungs the facts use.
--
-- A percentage promised a precision nobody had. Nothing downstream ever read
-- the difference between 64% and 67%, and neither did a reader — the number
-- was skimmed into "leaning yes" and the two spare digits only made the
-- estimate look better calibrated than it was. Five rungs say what was
-- actually meant, and say it in the same vocabulary as a fact's confidence, so
-- the two columns on the screen are read the same way.

alter table predictions
  rename column probability to likelihood;

alter table forecasts
  rename column probability to likelihood;

-- The old bands, which is how the ui was already reading them: everything
-- under 20 was "unlikely", 40-59 was "even", 80 and over was "likely".
alter table predictions
  drop constraint predictions_probability_check;

update predictions set likelihood = case
  when likelihood >= 80 then 5
  when likelihood >= 60 then 4
  when likelihood >= 40 then 3
  when likelihood >= 20 then 2
  else 1
end
where likelihood is not null;

alter table predictions
  add constraint predictions_likelihood_check
    check (likelihood between 1 and 5);

alter table forecasts
  drop constraint forecasts_probability_check,
  drop constraint forecasts_previous_check;

update forecasts set
  likelihood = case
    when likelihood >= 80 then 5
    when likelihood >= 60 then 4
    when likelihood >= 40 then 3
    when likelihood >= 20 then 2
    else 1
  end,
  previous = case
    when previous is null then null
    when previous >= 80 then 5
    when previous >= 60 then 4
    when previous >= 40 then 3
    when previous >= 20 then 2
    else 1
  end;

alter table forecasts
  add constraint forecasts_likelihood_check
    check (likelihood between 1 and 5),
  add constraint forecasts_previous_check
    check (previous between 1 and 5);

comment on column predictions.likelihood is
  '1-5, or null until it has been forecast for the first time. Always the newest forecast''s rung.';

-- +migrate down

-- Back to percentages, at the midpoint of each rung: the precision the old
-- column claimed was never there to restore.
alter table predictions drop constraint predictions_likelihood_check;
alter table forecasts
  drop constraint forecasts_likelihood_check,
  drop constraint forecasts_previous_check;

update predictions set likelihood = likelihood * 20 - 10
where likelihood is not null;

update forecasts set
  likelihood = likelihood * 20 - 10,
  previous = case when previous is null then null else previous * 20 - 10 end;

alter table predictions
  rename column likelihood to probability;

alter table forecasts
  rename column likelihood to probability;

alter table predictions
  add constraint predictions_probability_check
    check (probability between 0 and 100);

alter table forecasts
  add constraint forecasts_probability_check
    check (probability between 0 and 100),
  add constraint forecasts_previous_check
    check (previous between 0 and 100);
