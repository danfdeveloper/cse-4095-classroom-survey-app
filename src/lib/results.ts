import { supabase } from './supabase.ts'
import type { SurveyStatus } from './surveys.ts'

export interface ChoiceResult {
  choice_id: string
  choice_text: string
  position: number
  count: number
  percentage: number
}

export interface QuestionResult {
  question_id: string
  question_text: string
  question_type: 'multiple_choice' | 'true_false'
  position: number
  /** Answers recorded for this question. */
  response_count: number
  choices: ChoiceResult[]
}

export interface SurveyResults {
  survey_id: string
  title: string
  status: SurveyStatus
  public_slug: string | null
  response_count: number
  last_response_at: string | null
  questions: QuestionResult[]
}

/** Aggregated results computed in the database (API.md §11), or null if not found. */
export async function getSurveyResults(surveyId: string): Promise<SurveyResults | null> {
  const { data, error } = await supabase.rpc('get_survey_results', { p_survey_id: surveyId })
  if (error) throw error
  return (data as SurveyResults | null) ?? null
}

export const formatPercent = (p: number) => `${p.toFixed(1)}%`
