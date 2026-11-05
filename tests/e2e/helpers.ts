/**
 * Shared helpers for the end-to-end suite. Every test survey's title starts
 * with "[e2e]" so leftovers are easy to spot and are cleaned up automatically.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, type Page } from '@playwright/test'
import * as jsqrModule from 'jsqr'
import { PNG } from 'pngjs'

// jsqr is CommonJS: depending on the loader its function is the module or its default export.
type JsQR = (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null
const jsQR = ((jsqrModule as unknown as { default?: JsQR }).default ??
  jsqrModule) as unknown as JsQR

const url = () => process.env.VITE_SUPABASE_URL!
const key = () => process.env.VITE_SUPABASE_ANON_KEY!
export const email = () => process.env.INSTRUCTOR_EMAIL!
export const password = () => process.env.INSTRUCTOR_PASSWORD!

const noSession = { auth: { persistSession: false, autoRefreshToken: false } }

/** A Supabase client with no login: exactly what a student's browser has. */
export const anonClient = () => createClient(url(), key(), noSession)

/** A Supabase client signed in as the instructor (for seeding and checking the database). */
export async function instructorClient(): Promise<SupabaseClient> {
  const sb = createClient(url(), key(), noSession)
  const { error } = await sb.auth.signInWithPassword({ email: email(), password: password() })
  if (error) throw new Error(`Instructor login failed: ${error.message}`)
  return sb
}

export interface SeedQuestion {
  text: string
  type?: 'multiple_choice' | 'true_false'
  choices: string[]
}

export const RECURSION_QUESTIONS: SeedQuestion[] = [
  {
    text: 'What is required for recursion?',
    choices: ['A base case', 'A pointer', 'A loop', 'A compiler'],
  },
  {
    text: 'Every recursive function needs a stopping condition.',
    type: 'true_false',
    choices: ['True', 'False'],
  },
]

export interface Seeded {
  id: string
  slug: string | null
  questions: { id: string; choices: { id: string; choice_text: string }[] }[]
}

/** Creates surveys through the same RPCs the app uses, and deletes them afterwards. */
export class Seeder {
  private ids: string[] = []
  readonly sb: SupabaseClient
  constructor(sb: SupabaseClient) {
    this.sb = sb
  }

  static async create() {
    return new Seeder(await instructorClient())
  }

  async survey(
    title: string,
    opts: { questions?: SeedQuestion[]; description?: string; activate?: boolean } = {},
  ): Promise<Seeded> {
    const questions = opts.questions ?? RECURSION_QUESTIONS
    const { data: id, error } = await this.sb.rpc('save_survey', {
      p_survey_id: null,
      p_title: `[e2e] ${title}`,
      p_description: opts.description ?? '',
      p_questions: questions.map((q) => ({
        question_text: q.text,
        question_type: q.type ?? 'multiple_choice',
        choices: q.choices.map((c) => ({ choice_text: c })),
      })),
    })
    if (error) throw error
    this.ids.push(id)
    let slug: string | null = null
    if (opts.activate) {
      const { data, error: actError } = await this.sb.rpc('activate_survey', { p_survey_id: id })
      if (actError) throw actError
      slug = data.public_slug
    }
    const { data: qs } = await this.sb
      .from('questions')
      .select('id, choices(id, choice_text, position)')
      .eq('survey_id', id)
      .order('position')
      .order('position', { referencedTable: 'choices' })
    return { id, slug, questions: qs ?? [] }
  }

  /** Track a survey created through the UI so it is cleaned up too. */
  track(id: string) {
    this.ids.push(id)
  }

  /** Submits one student response; `picks[i]` is the choice index for question i. */
  async respond(survey: Seeded, token: string, picks: number[]) {
    const { error } = await anonClient().rpc('submit_survey_response', {
      p_survey_id: survey.id,
      p_anonymous_token: token,
      p_answers: picks.map((c, i) => ({
        question_id: survey.questions[i].id,
        choice_id: survey.questions[i].choices[c].id,
      })),
    })
    if (error) throw new Error(error.message)
  }

  async cleanup() {
    if (this.ids.length === 0) return
    for (const id of this.ids) await this.sb.rpc('close_survey', { p_survey_id: id })
    await this.sb.from('surveys').delete().in('id', this.ids)
    this.ids = []
  }
}

/** Logs in through the real login form. */
export async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email())
  await page.getByLabel('Password').fill(password())
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

/** Decodes the QR code in a PNG buffer; returns its text or undefined. */
export function decodeQr(png: Buffer): string | undefined {
  const img = PNG.sync.read(png)
  return jsQR(new Uint8ClampedArray(img.data), img.width, img.height)?.data
}

/** True when the page has no horizontal scrollbar. */
export const fitsWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

/** A survey card on the dashboard, found by its (unprefixed) title. */
export const card = (page: Page, title: string) =>
  page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: `[e2e] ${title}`, exact: true }) })
