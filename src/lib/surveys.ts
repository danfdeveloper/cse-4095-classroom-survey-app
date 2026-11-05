import { supabase } from './supabase.ts'

export type SurveyStatus = 'draft' | 'active' | 'closed' | 'archived'

export const SURVEY_STATUSES: SurveyStatus[] = ['draft', 'active', 'closed', 'archived']

export const STATUS_LABELS: Record<SurveyStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  closed: 'Closed',
  archived: 'Archived',
}

export interface Survey {
  id: string
  title: string
  description: string | null
  status: SurveyStatus
  public_slug: string | null
  created_at: string
  updated_at: string
}

export interface Choice {
  id: string
  choice_text: string
  position: number
}

export interface Question {
  id: string
  question_text: string
  question_type: 'multiple_choice' | 'true_false'
  position: number
  choices: Choice[]
}

export interface SurveyWithQuestions extends Survey {
  questions: Question[]
}

export interface SurveyListItem extends Survey {
  response_count: number
}

const ERROR_MESSAGES: Record<string, string> = {
  SURVEY_NOT_FOUND: 'That survey no longer exists. Refresh the page.',
  SURVEY_NOT_DRAFT: 'Only draft surveys can be activated.',
  SURVEY_NOT_ACTIVE: 'That survey is not active.',
  SURVEY_HAS_NO_QUESTIONS: 'Add at least one question before activating this survey.',
  QUESTION_NEEDS_CHOICES: 'Every question needs at least two choices before activating.',
  SURVEY_NOT_EDITABLE: 'Only draft surveys can be edited. Duplicate this survey to make changes.',
  TITLE_REQUIRED: 'Enter a survey title.',
  QUESTION_TEXT_REQUIRED: 'Every question needs text.',
  CHOICE_TEXT_REQUIRED: 'Every choice needs text.',
}

/** Converts a Supabase/network error into a message safe to show the instructor. */
export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : (error as { message?: string })?.message
  if (message && ERROR_MESSAGES[message]) return ERROR_MESSAGES[message]
  if (message && /fetch|network/i.test(message)) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  return 'Something went wrong. Please try again.'
}

function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error
  return res.data
}

export async function listSurveys(): Promise<SurveyListItem[]> {
  const rows = unwrap(
    await supabase
      .from('surveys')
      .select('*, responses(count)')
      .order('created_at', { ascending: false }),
  ) as (Survey & { responses: { count: number }[] })[]

  return rows.map(({ responses, ...survey }) => ({
    ...survey,
    response_count: responses[0]?.count ?? 0,
  }))
}

export async function activateSurvey(id: string): Promise<Survey> {
  return unwrap(await supabase.rpc('activate_survey', { p_survey_id: id })) as Survey
}

export async function closeSurvey(id: string): Promise<Survey> {
  return unwrap(await supabase.rpc('close_survey', { p_survey_id: id })) as Survey
}

/** Returns the id of the new Draft copy. */
export async function duplicateSurvey(id: string): Promise<string> {
  return unwrap(await supabase.rpc('duplicate_survey', { p_survey_id: id })) as string
}

export async function archiveSurvey(id: string): Promise<void> {
  unwrap(
    await supabase
      .from('surveys')
      .update({ status: 'archived' })
      .eq('id', id)
      .in('status', ['draft', 'closed']),
  )
}

export async function deleteSurvey(id: string): Promise<void> {
  unwrap(await supabase.from('surveys').delete().eq('id', id))
}

/** Loads one survey with its questions and choices in display order, or null if not found. */
export async function getSurvey(id: string): Promise<SurveyWithQuestions | null> {
  const survey = unwrap(
    await supabase
      .from('surveys')
      .select(
        '*, questions(id, question_text, question_type, position, choices(id, choice_text, position))',
      )
      .eq('id', id)
      .order('position', { referencedTable: 'questions' })
      .order('position', { referencedTable: 'questions.choices' })
      .maybeSingle(),
  ) as SurveyWithQuestions | null
  return survey
}

export async function getActiveSurvey(): Promise<Survey | null> {
  return unwrap(
    await supabase.from('surveys').select('*').eq('status', 'active').maybeSingle(),
  ) as Survey | null
}

export interface SurveyPayload {
  title: string
  description: string
  questions: {
    question_text: string
    question_type: 'multiple_choice' | 'true_false'
    choices: { choice_text: string }[]
  }[]
}

/** Creates (id = null) or replaces a Draft survey atomically. Returns the survey id. */
export async function saveSurvey(id: string | null, payload: SurveyPayload): Promise<string> {
  return unwrap(
    await supabase.rpc('save_survey', {
      p_survey_id: id,
      p_title: payload.title,
      p_description: payload.description,
      p_questions: payload.questions,
    }),
  ) as string
}
