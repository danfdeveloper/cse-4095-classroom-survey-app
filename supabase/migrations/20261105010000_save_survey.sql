-- Classroom Survey — survey editor save (Phase 5)
-- Adds: save_survey — creates or updates a Draft survey with all of its
-- questions and choices in one transaction.
-- Apply: paste into Supabase Dashboard → SQL Editor → Run.
--
-- save_survey(p_survey_id, p_title, p_description, p_questions)
--   p_survey_id: null to create a new Draft, or the id of an existing Draft
--   p_questions: [{ "question_text": text,
--                   "question_type": "multiple_choice" | "true_false",
--                   "choices": [{ "choice_text": text }, ...] }, ...]
--   Positions are taken from array order (1-based).
-- Returns: the survey id.
-- Raises: TITLE_REQUIRED, INVALID_PAYLOAD, SURVEY_NOT_FOUND,
--         SURVEY_NOT_EDITABLE, QUESTION_TEXT_REQUIRED, CHOICE_TEXT_REQUIRED
--
-- Only Draft surveys can be edited. Drafts have never been active and so have
-- no responses, which makes replacing their questions and choices safe.

create or replace function public.save_survey(
    p_survey_id uuid,
    p_title text,
    p_description text,
    p_questions jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_id uuid;
    v_status text;
    v_question jsonb;
    v_choice jsonb;
    v_question_id uuid;
    v_question_pos integer := 0;
    v_choice_pos integer;
begin
    if coalesce(btrim(p_title), '') = '' then
        raise exception 'TITLE_REQUIRED';
    end if;

    if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
        raise exception 'INVALID_PAYLOAD';
    end if;

    if p_survey_id is null then
        insert into public.surveys (title, description)
        values (btrim(p_title), nullif(btrim(p_description), ''))
        returning id into v_id;
    else
        select status into v_status from public.surveys where id = p_survey_id for update;
        if not found then
            raise exception 'SURVEY_NOT_FOUND';
        end if;
        if v_status <> 'draft' then
            raise exception 'SURVEY_NOT_EDITABLE';
        end if;

        update public.surveys
        set title = btrim(p_title),
            description = nullif(btrim(p_description), '')
        where id = p_survey_id;

        delete from public.questions where survey_id = p_survey_id; -- cascades to choices
        v_id := p_survey_id;
    end if;

    for v_question in select value from jsonb_array_elements(p_questions) loop
        if jsonb_typeof(v_question) <> 'object'
            or jsonb_typeof(coalesce(v_question -> 'choices', '[]'::jsonb)) <> 'array'
        then
            raise exception 'INVALID_PAYLOAD';
        end if;

        if coalesce(btrim(v_question ->> 'question_text'), '') = '' then
            raise exception 'QUESTION_TEXT_REQUIRED';
        end if;

        v_question_pos := v_question_pos + 1;

        insert into public.questions (survey_id, question_text, question_type, position)
        values (
            v_id,
            btrim(v_question ->> 'question_text'),
            v_question ->> 'question_type',
            v_question_pos
        )
        returning id into v_question_id;

        v_choice_pos := 0;
        for v_choice in
            select value from jsonb_array_elements(coalesce(v_question -> 'choices', '[]'::jsonb))
        loop
            if coalesce(btrim(v_choice ->> 'choice_text'), '') = '' then
                raise exception 'CHOICE_TEXT_REQUIRED';
            end if;

            v_choice_pos := v_choice_pos + 1;

            insert into public.choices (question_id, choice_text, position)
            values (v_question_id, btrim(v_choice ->> 'choice_text'), v_choice_pos);
        end loop;
    end loop;

    return v_id;
end;
$$;

revoke all on function public.save_survey(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_survey(uuid, text, text, jsonb) to authenticated;
