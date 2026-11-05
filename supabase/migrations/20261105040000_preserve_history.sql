-- Classroom Survey — preserve historical response data (Phase 10)
-- Apply: paste into Supabase Dashboard → SQL Editor → Run. Safe to re-run.
--
-- Database-level guarantees, independent of the UI:
--   1. Questions and choices of a non-Draft survey cannot be inserted, edited
--      or deleted (results would otherwise silently change). Raises SURVEY_LOCKED.
--   2. Responses and answers can never be edited. Raises RESPONSES_READ_ONLY.
--   3. Responses and answers cannot be deleted on their own — only as part of
--      deleting the whole survey (the cascade). Raises RESPONSES_READ_ONLY.
-- Deleting an entire survey (with confirmation in the UI) still works.
--
-- During a cascading survey delete the parent rows are already gone when these
-- triggers fire, which is how they tell a cascade apart from a direct delete.

-- ---------------------------------------------------------------------------
-- 1. Lock questions/choices once a survey has left Draft
-- ---------------------------------------------------------------------------

create or replace function public.guard_survey_content()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_question_id uuid;
    v_survey_id uuid;
    v_status text;
begin
    if tg_table_name = 'questions' then
        v_survey_id := case when tg_op = 'DELETE' then old.survey_id else new.survey_id end;
    else
        v_question_id := case when tg_op = 'DELETE' then old.question_id else new.question_id end;
        select survey_id into v_survey_id from public.questions where id = v_question_id;
    end if;

    select status into v_status from public.surveys where id = v_survey_id;

    -- Parent already gone (cascading delete of the whole survey): allow.
    if v_status is not null and v_status <> 'draft' then
        raise exception 'SURVEY_LOCKED';
    end if;

    -- An update must not move a row out of a locked survey either. Nested IFs on
    -- purpose: SQL does not short-circuit AND, and choices rows have no survey_id.
    if tg_op = 'UPDATE' then
        if tg_table_name = 'questions' then
            if old.survey_id <> new.survey_id then
                select status into v_status from public.surveys where id = old.survey_id;
                if v_status is not null and v_status <> 'draft' then
                    raise exception 'SURVEY_LOCKED';
                end if;
            end if;
        elsif old.question_id <> new.question_id then
            select s.status into v_status
            from public.questions q join public.surveys s on s.id = q.survey_id
            where q.id = old.question_id;
            if v_status is not null and v_status <> 'draft' then
                raise exception 'SURVEY_LOCKED';
            end if;
        end if;
    end if;

    return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists questions_locked_after_draft on public.questions;
create trigger questions_locked_after_draft
before insert or update or delete on public.questions
for each row execute function public.guard_survey_content();

drop trigger if exists choices_locked_after_draft on public.choices;
create trigger choices_locked_after_draft
before insert or update or delete on public.choices
for each row execute function public.guard_survey_content();

-- ---------------------------------------------------------------------------
-- 2 & 3. Responses and answers are append-only (except during a survey delete)
-- ---------------------------------------------------------------------------

create or replace function public.guard_response_data()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    -- UPDATE and DELETE are allowed only while the owning survey is being
    -- deleted. (Deleting a survey cascades to choices, whose ON DELETE SET NULL
    -- turns into an UPDATE of answers.choice_id — that must not be blocked.)
    if tg_table_name = 'responses' then
        if exists (select 1 from public.surveys where id = old.survey_id) then
            raise exception 'RESPONSES_READ_ONLY';
        end if;
    else
        if exists (
            select 1
            from public.responses r
            join public.surveys s on s.id = r.survey_id
            where r.id = old.response_id
        ) then
            raise exception 'RESPONSES_READ_ONLY';
        end if;
    end if;

    return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists responses_append_only on public.responses;
create trigger responses_append_only
before update or delete on public.responses
for each row execute function public.guard_response_data();

drop trigger if exists answers_append_only on public.answers;
create trigger answers_append_only
before update or delete on public.answers
for each row execute function public.guard_response_data();
