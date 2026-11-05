-- Classroom Survey — instructor survey actions (Phase 4)
-- Adds: activate_survey, close_survey, duplicate_survey (API.md §6–8, DATABASE.md §5–6)
-- Apply: paste into Supabase Dashboard → SQL Editor → Run.
--
-- All three run as SECURITY INVOKER, so the caller's RLS applies: only
-- authenticated instructors can use them. Execute is not granted to anon.

-- ---------------------------------------------------------------------------
-- Slug generator: 6 characters from an unambiguous alphabet (no 0/o/1/l/i),
-- drawn from gen_random_uuid() so it is non-sequential and hard to guess.
-- ---------------------------------------------------------------------------

create or replace function public.generate_public_slug()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
    v_alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
    v_bytes bytea;
    v_slug text;
    v_positions constant int[] := array[0, 1, 2, 3, 10, 11]; -- avoid UUID version/variant bits
    v_pos int;
begin
    loop
        v_bytes := uuid_send(gen_random_uuid());
        v_slug := '';
        foreach v_pos in array v_positions loop
            v_slug := v_slug || substr(v_alphabet, 1 + get_byte(v_bytes, v_pos) % length(v_alphabet), 1);
        end loop;
        exit when not exists (select 1 from public.surveys where public_slug = v_slug);
    end loop;
    return v_slug;
end;
$$;

-- ---------------------------------------------------------------------------
-- activate_survey(p_survey_id)
--   1. closes any other Active survey;
--   2. creates a public slug if the survey has none;
--   3. sets the survey to Active;
--   4. returns the survey row.
-- Only Draft surveys can be activated. The survey must have at least one
-- question, and every question at least two choices.
-- Raises: SURVEY_NOT_FOUND, SURVEY_NOT_DRAFT, SURVEY_HAS_NO_QUESTIONS,
--         QUESTION_NEEDS_CHOICES
-- ---------------------------------------------------------------------------

create or replace function public.activate_survey(p_survey_id uuid)
returns public.surveys
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_survey public.surveys;
begin
    -- Serialize concurrent activations so two clicks cannot race.
    perform pg_advisory_xact_lock(hashtext('public.activate_survey'));

    select * into v_survey from public.surveys where id = p_survey_id for update;
    if not found then
        raise exception 'SURVEY_NOT_FOUND';
    end if;

    if v_survey.status = 'active' then
        return v_survey;
    end if;

    if v_survey.status <> 'draft' then
        raise exception 'SURVEY_NOT_DRAFT';
    end if;

    if not exists (select 1 from public.questions where survey_id = p_survey_id) then
        raise exception 'SURVEY_HAS_NO_QUESTIONS';
    end if;

    if exists (
        select 1
        from public.questions q
        where q.survey_id = p_survey_id
        and (select count(*) from public.choices c where c.question_id = q.id) < 2
    ) then
        raise exception 'QUESTION_NEEDS_CHOICES';
    end if;

    update public.surveys
    set status = 'closed'
    where status = 'active' and id <> p_survey_id;

    update public.surveys
    set status = 'active',
        public_slug = coalesce(public_slug, public.generate_public_slug())
    where id = p_survey_id
    returning * into v_survey;

    return v_survey;
end;
$$;

-- ---------------------------------------------------------------------------
-- close_survey(p_survey_id): Active → Closed. Waits for in-flight
-- submissions (they hold a share lock), so none succeed after it returns.
-- Raises: SURVEY_NOT_FOUND, SURVEY_NOT_ACTIVE
-- ---------------------------------------------------------------------------

create or replace function public.close_survey(p_survey_id uuid)
returns public.surveys
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_survey public.surveys;
begin
    select * into v_survey from public.surveys where id = p_survey_id for update;
    if not found then
        raise exception 'SURVEY_NOT_FOUND';
    end if;

    if v_survey.status <> 'active' then
        raise exception 'SURVEY_NOT_ACTIVE';
    end if;

    update public.surveys
    set status = 'closed'
    where id = p_survey_id
    returning * into v_survey;

    return v_survey;
end;
$$;

-- ---------------------------------------------------------------------------
-- duplicate_survey(p_survey_id): copies title ("Copy of ..."), description,
-- questions and choices into a new Draft survey. Responses are not copied.
-- Returns the new survey's id.
-- Raises: SURVEY_NOT_FOUND
-- ---------------------------------------------------------------------------

create or replace function public.duplicate_survey(p_survey_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_source public.surveys;
    v_new_id uuid;
    v_question public.questions;
    v_new_question_id uuid;
begin
    select * into v_source from public.surveys where id = p_survey_id;
    if not found then
        raise exception 'SURVEY_NOT_FOUND';
    end if;

    insert into public.surveys (title, description, status)
    values ('Copy of ' || v_source.title, v_source.description, 'draft')
    returning id into v_new_id;

    for v_question in
        select * from public.questions where survey_id = p_survey_id order by position
    loop
        insert into public.questions (survey_id, question_text, question_type, position)
        values (v_new_id, v_question.question_text, v_question.question_type, v_question.position)
        returning id into v_new_question_id;

        insert into public.choices (question_id, choice_text, position)
        select v_new_question_id, choice_text, position
        from public.choices
        where question_id = v_question.id;
    end loop;

    return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function public.generate_public_slug() from public, anon;
grant execute on function public.generate_public_slug() to authenticated;
revoke all on function public.activate_survey(uuid) from public, anon;
revoke all on function public.close_survey(uuid) from public, anon;
revoke all on function public.duplicate_survey(uuid) from public, anon;

grant execute on function public.activate_survey(uuid) to authenticated;
grant execute on function public.close_survey(uuid) to authenticated;
grant execute on function public.duplicate_survey(uuid) to authenticated;
