-- Classroom Survey — initial schema (Phase 2)
-- Source of truth: DATABASE.md
-- Apply: paste into Supabase Dashboard → SQL Editor → Run (safe to run once on an empty project).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.surveys (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    description text,
    status text not null default 'draft'
        check (status in ('draft', 'active', 'closed', 'archived')),
    public_slug text unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.questions (
    id uuid primary key default gen_random_uuid(),
    survey_id uuid not null references public.surveys(id) on delete cascade,
    question_text text not null,
    question_type text not null
        check (question_type in ('multiple_choice', 'true_false')),
    position integer not null,
    created_at timestamptz not null default now()
);

create table public.choices (
    id uuid primary key default gen_random_uuid(),
    question_id uuid not null references public.questions(id) on delete cascade,
    choice_text text not null,
    position integer not null,
    created_at timestamptz not null default now()
);

create table public.responses (
    id uuid primary key default gen_random_uuid(),
    survey_id uuid not null references public.surveys(id) on delete cascade,
    anonymous_token text,
    submitted_at timestamptz not null default now()
);

create table public.answers (
    id uuid primary key default gen_random_uuid(),
    response_id uuid not null references public.responses(id) on delete cascade,
    question_id uuid not null references public.questions(id) on delete cascade,
    choice_id uuid references public.choices(id) on delete set null,
    text_answer text,
    created_at timestamptz not null default now(),
    unique (response_id, question_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index surveys_status_idx on public.surveys(status);
create index questions_survey_id_idx on public.questions(survey_id);
create index choices_question_id_idx on public.choices(question_id);
create index responses_survey_id_idx on public.responses(survey_id);
create index responses_submitted_at_idx on public.responses(submitted_at);
create index answers_response_id_idx on public.answers(response_id);
create index answers_question_id_idx on public.answers(question_id);
create index answers_choice_id_idx on public.answers(choice_id);

-- One response per browser token per survey.
create unique index responses_unique_student_per_survey
    on public.responses(survey_id, anonymous_token)
    where anonymous_token is not null;

-- At most one Active survey.
create unique index only_one_active_survey
    on public.surveys ((status))
    where status = 'active';

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger surveys_updated_at
before update on public.surveys
for each row
execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Privileges: anon may only read survey content; all writes go through the RPC.
-- ---------------------------------------------------------------------------

revoke all on public.surveys, public.questions, public.choices,
              public.responses, public.answers from anon;
grant select on public.surveys, public.questions, public.choices to anon;

grant select, insert, update, delete
    on public.surveys, public.questions, public.choices,
       public.responses, public.answers
    to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.surveys enable row level security;
alter table public.questions enable row level security;
alter table public.choices enable row level security;
alter table public.responses enable row level security;
alter table public.answers enable row level security;

-- Students (anon): read Active surveys and their questions/choices only.
create policy "students read active surveys"
on public.surveys
for select
to anon
using (status = 'active');

create policy "students read active survey questions"
on public.questions
for select
to anon
using (
    exists (
        select 1
        from public.surveys
        where surveys.id = questions.survey_id
        and surveys.status = 'active'
    )
);

create policy "students read active survey choices"
on public.choices
for select
to anon
using (
    exists (
        select 1
        from public.questions
        join public.surveys on surveys.id = questions.survey_id
        where questions.id = choices.question_id
        and surveys.status = 'active'
    )
);

-- Instructors (authenticated): full access. Single-instructor deployment —
-- public sign-ups must be disabled in Supabase Auth.
create policy "authenticated users manage surveys"
on public.surveys for all to authenticated using (true) with check (true);

create policy "authenticated users manage questions"
on public.questions for all to authenticated using (true) with check (true);

create policy "authenticated users manage choices"
on public.choices for all to authenticated using (true) with check (true);

create policy "authenticated users manage responses"
on public.responses for all to authenticated using (true) with check (true);

create policy "authenticated users manage answers"
on public.answers for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Student submission RPC
--
-- submit_survey_response(p_survey_id, p_anonymous_token, p_answers)
--   p_answers: [{ "question_id": uuid, "choice_id": uuid }, ...]
-- Returns: { "success": true, "response_id": uuid }
-- Raises (message = code): SURVEY_NOT_ACTIVE, DUPLICATE_RESPONSE,
--   INVALID_QUESTION, INVALID_CHOICE, MISSING_REQUIRED_ANSWER, INVALID_PAYLOAD
-- Runs as one transaction; every question in the survey is required.
-- ---------------------------------------------------------------------------

create or replace function public.submit_survey_response(
    p_survey_id uuid,
    p_anonymous_token text,
    p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_status text;
    v_answer jsonb;
    v_question_id uuid;
    v_choice_id uuid;
    v_question_ids uuid[] := '{}';
    v_choice_ids uuid[] := '{}';
    v_required_count integer;
    v_response_id uuid;
begin
    -- Lock the survey row so it cannot be closed mid-submission.
    select status into v_status
    from public.surveys
    where id = p_survey_id
    for share;

    if v_status is distinct from 'active' then
        raise exception 'SURVEY_NOT_ACTIVE';
    end if;

    if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
        raise exception 'INVALID_PAYLOAD';
    end if;

    for v_answer in select value from jsonb_array_elements(p_answers) loop
        if jsonb_typeof(v_answer) <> 'object' then
            raise exception 'INVALID_PAYLOAD';
        end if;

        begin
            v_question_id := (v_answer ->> 'question_id')::uuid;
            v_choice_id := (v_answer ->> 'choice_id')::uuid;
        exception when invalid_text_representation then
            raise exception 'INVALID_PAYLOAD';
        end;

        if v_question_id is null
            or v_question_id = any (v_question_ids)
            or not exists (
                select 1 from public.questions
                where id = v_question_id and survey_id = p_survey_id
            )
        then
            raise exception 'INVALID_QUESTION';
        end if;

        if v_choice_id is null then
            raise exception 'MISSING_REQUIRED_ANSWER';
        end if;

        if not exists (
            select 1 from public.choices
            where id = v_choice_id and question_id = v_question_id
        ) then
            raise exception 'INVALID_CHOICE';
        end if;

        v_question_ids := v_question_ids || v_question_id;
        v_choice_ids := v_choice_ids || v_choice_id;
    end loop;

    select count(*) into v_required_count
    from public.questions
    where survey_id = p_survey_id;

    if cardinality(v_question_ids) <> v_required_count then
        raise exception 'MISSING_REQUIRED_ANSWER';
    end if;

    begin
        insert into public.responses (survey_id, anonymous_token)
        values (p_survey_id, nullif(p_anonymous_token, ''))
        returning id into v_response_id;
    exception when unique_violation then
        raise exception 'DUPLICATE_RESPONSE';
    end;

    insert into public.answers (response_id, question_id, choice_id)
    select v_response_id, q, c
    from unnest(v_question_ids, v_choice_ids) as t(q, c);

    return jsonb_build_object('success', true, 'response_id', v_response_id);
end;
$$;

revoke all on function public.submit_survey_response(uuid, text, jsonb) from public;
grant execute on function public.submit_survey_response(uuid, text, jsonb) to anon, authenticated;
