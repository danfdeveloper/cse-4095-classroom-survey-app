/**
 * In-memory model for the survey editor: types, factories, validation and
 * conversion to/from the database shape. Pure functions only (no React).
 */
import type { SurveyWithQuestions } from './surveys.ts'

export type QuestionType = 'multiple_choice' | 'true_false'

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Multiple Choice',
  true_false: 'True / False',
}

export interface ChoiceDraft {
  key: string
  text: string
}

export interface QuestionDraft {
  key: string
  text: string
  type: QuestionType
  choices: ChoiceDraft[]
  /** Multiple-choice options kept while the question is switched to True / False. */
  stashedChoices?: ChoiceDraft[]
}

export interface SurveyDraft {
  title: string
  description: string
  questions: QuestionDraft[]
}

// Stable client-side keys so React keeps each row's state when items are reordered.
// A counter (not crypto.randomUUID) also works on plain-http LAN addresses.
let counter = 0
export const newKey = () => `k${++counter}`

export const choice = (text = ''): ChoiceDraft => ({ key: newKey(), text })

export const trueFalseChoices = (): ChoiceDraft[] => [choice('True'), choice('False')]

export const emptyQuestion = (): QuestionDraft => ({
  key: newKey(),
  text: '',
  type: 'multiple_choice',
  choices: [choice(), choice()],
})

export const emptySurvey = (): SurveyDraft => ({
  title: '',
  description: '',
  questions: [emptyQuestion()],
})

export function fromSurvey(survey: SurveyWithQuestions): SurveyDraft {
  return {
    title: survey.title,
    description: survey.description ?? '',
    questions: survey.questions.map((q) => ({
      key: newKey(),
      text: q.question_text,
      type: q.question_type,
      choices: q.choices.map((c) => choice(c.choice_text)),
    })),
  }
}

export function toPayload(draft: SurveyDraft) {
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    questions: draft.questions.map((q) => ({
      question_text: q.text.trim(),
      question_type: q.type,
      choices: q.choices.map((c) => ({ choice_text: c.text.trim() })),
    })),
  }
}

/** Serialized saved-state used to detect unsaved changes. */
export const snapshot = (draft: SurveyDraft) => JSON.stringify(toPayload(draft))

// DOM ids, shared by inputs and validation so errors can focus the right field.
export const ids = {
  title: 'survey-title',
  description: 'survey-description',
  questions: 'survey-questions',
  questionText: (q: QuestionDraft) => `q-${q.key}-text`,
  questionChoices: (q: QuestionDraft) => `q-${q.key}-choices`,
  choice: (c: ChoiceDraft) => `c-${c.key}`,
}

/** Map of DOM id → error message. Empty when the draft is valid. */
export type EditorErrors = Record<string, string>

export function validate(draft: SurveyDraft): EditorErrors {
  const errors: EditorErrors = {}

  if (!draft.title.trim()) errors[ids.title] = 'Enter a survey title.'
  if (draft.questions.length === 0) errors[ids.questions] = 'Add at least one question.'

  for (const q of draft.questions) {
    if (!q.text.trim()) errors[ids.questionText(q)] = 'Enter the question text.'
    if (q.type !== 'multiple_choice') continue

    if (q.choices.length < 2) {
      errors[ids.questionChoices(q)] = 'Add at least two choices.'
    }
    const seen = new Set<string>()
    for (const c of q.choices) {
      const text = c.text.trim().toLowerCase()
      if (!text) errors[ids.choice(c)] = 'Enter the choice text, or delete this choice.'
      else if (seen.has(text)) errors[ids.choice(c)] = 'This choice is a duplicate.'
      seen.add(text)
    }
  }

  return errors
}

/** Returns a copy of `items` with the element at `index` moved by `delta`. */
export function move<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
