-- Classroom Survey — results aggregation (Phase 9)
-- Adds: get_survey_results(p_survey_id) — instructor-only (API.md §11).
-- Apply: paste into Supabase Dashboard → SQL Editor → Run.
--
-- Returns:
--   { "survey_id", "title", "status", "public_slug", "response_count",
--     "last_response_at",
--     "questions": [{ "question_id", "question_text", "question_type", "position",
--                     "response_count",   -- answers recorded for this question
--                     "choices": [{ "choice_id", "choice_text", "position",
--                                   "count", "percentage" }] }] }
--   or null if the survey does not exist (or the caller cannot see it).
-- percentage = count / question response_count × 100, rounded to 1 decimal
-- (0 when the question has no answers).
--
-- SECURITY INVOKER: RLS applies, so only authenticated instructors get data;
-- execute is not granted to anon.

create or replace function public.get_survey_results(p_survey_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select jsonb_build_object(
        'survey_id', s.id,
        'title', s.title,
        'status', s.status,
        'public_slug', s.public_slug,
        'response_count', (select count(*) from public.responses r where r.survey_id = s.id),
        'last_response_at', (select max(r.submitted_at) from public.responses r where r.survey_id = s.id),
        'questions', coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'question_id', q.id,
                    'question_text', q.question_text,
                    'question_type', q.question_type,
                    'position', q.position,
                    'response_count', qa.total,
                    'choices', coalesce((
                        select jsonb_agg(
                            jsonb_build_object(
                                'choice_id', c.id,
                                'choice_text', c.choice_text,
                                'position', c.position,
                                'count', cc.n,
                                'percentage', case when qa.total = 0 then 0
                                                   else round(cc.n * 100.0 / qa.total, 1) end
                            )
                            order by c.position
                        )
                        from public.choices c
                        cross join lateral (
                            select count(*) as n from public.answers a where a.choice_id = c.id
                        ) cc
                        where c.question_id = q.id
                    ), '[]'::jsonb)
                )
                order by q.position
            )
            from public.questions q
            cross join lateral (
                select count(*) as total
                from public.answers a
                where a.question_id = q.id and a.choice_id is not null
            ) qa
            where q.survey_id = s.id
        ), '[]'::jsonb)
    )
    from public.surveys s
    where s.id = p_survey_id;
$$;

revoke all on function public.get_survey_results(uuid) from public, anon;
grant execute on function public.get_survey_results(uuid) to authenticated;
