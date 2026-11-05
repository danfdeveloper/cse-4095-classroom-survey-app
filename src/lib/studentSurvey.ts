import { supabase } from './supabase.ts'

export interface PublicChoice {
  id: string
  choice_text: string
  position: number
}

export interface PublicQuestion {
  id: string
  question_text: string
  question_type: 'multiple_choice' | 'true_false'
  position: number
  choices: PublicChoice[]
}

export type PublicSurveyResult =
  | {
      status: 'active'
      survey: { id: string; title: string; description: string | null }
      questions: PublicQuestion[]
    }
  | { status: 'closed' }
  | { status: 'not_found' }

export async function getPublicSurvey(slug: string): Promise<PublicSurveyResult> {
  const { data, error } = await supabase.rpc('get_public_survey', { p_slug: slug })
  if (error) throw error
  return data as PublicSurveyResult
}

export type SubmitOutcome =
  | { kind: 'success' }
  | { kind: 'closed' }
  | { kind: 'duplicate' }
  | { kind: 'error'; message: string }

/** Submits answers via the RPC and maps every failure to a student-friendly outcome. */
export async function submitResponse(
  surveyId: string,
  token: string,
  answers: { question_id: string; choice_id: string }[],
): Promise<SubmitOutcome> {
  try {
    const { error } = await supabase.rpc('submit_survey_response', {
      p_survey_id: surveyId,
      p_anonymous_token: token,
      p_answers: answers,
    })
    if (!error) return { kind: 'success' }
    if (error.message === 'SURVEY_NOT_ACTIVE') return { kind: 'closed' }
    if (error.message === 'DUPLICATE_RESPONSE') return { kind: 'duplicate' }
    if (/fetch|network/i.test(error.message)) return networkError
    // INVALID_QUESTION / INVALID_CHOICE / MISSING_REQUIRED_ANSWER after validation
    // means the survey changed under the student.
    return {
      kind: 'error',
      message: 'This survey has changed since you opened it. Please reload the page and try again.',
    }
  } catch {
    return networkError
  }
}

const networkError: SubmitOutcome = {
  kind: 'error',
  message: 'Could not submit. Check your connection and try again — your answers are still here.',
}
