-- Classroom Survey — public student survey lookup (Phase 7)
-- Adds: get_public_survey(p_slug) for the student page /s/:slug.
-- Apply: paste into Supabase Dashboard → SQL Editor → Run.
--
-- Returns, in one round trip:
--   { "status": "active", "survey": {id, title, description},
--     "questions": [{id, question_text, question_type, position,
--                    "choices": [{id, choice_text, position}, ...]}, ...] }
--   { "status": "closed" }      -- survey exists but is not active (closed/archived)
--   { "status": "not_found" }   -- no survey has this slug
--
-- SECURITY DEFINER so anonymous students can tell "closed" apart from
-- "not found" (RLS hides non-active surveys from anon). It never returns the
-- content of a non-active survey, and never returns any response data.

create or replace function public.get_public_survey(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_survey public.surveys;
begin
    select * into v_survey from public.surveys where public_slug = p_slug;

    if not found then
        return jsonb_build_object('status', 'not_found');
    end if;

    if v_survey.status <> 'active' then
        return jsonb_build_object('status', 'closed');
    end if;

    return jsonb_build_object(
        'status', 'active',
        'survey', jsonb_build_object(
            'id', v_survey.id,
            'title', v_survey.title,
            'description', v_survey.description
        ),
        'questions', coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'id', q.id,
                    'question_text', q.question_text,
                    'question_type', q.question_type,
                    'position', q.position,
                    'choices', coalesce((
                        select jsonb_agg(
                            jsonb_build_object(
                                'id', c.id,
                                'choice_text', c.choice_text,
                                'position', c.position
                            )
                            order by c.position
                        )
                        from public.choices c
                        where c.question_id = q.id
                    ), '[]'::jsonb)
                )
                order by q.position
            )
            from public.questions q
            where q.survey_id = v_survey.id
        ), '[]'::jsonb)
    );
end;
$$;

revoke all on function public.get_public_survey(text) from public;
grant execute on function public.get_public_survey(text) to anon, authenticated;
