/** Phase 14: "Test results calculations" (plus empty/unanswered states and Refresh). */
import { expect, test } from '@playwright/test'
import { login, Seeder } from './helpers.ts'

let seed: Seeder
test.beforeEach(async ({ page }) => {
  seed = await Seeder.create()
  await login(page)
})
test.afterEach(async () => seed.cleanup())

const questionCard = (page: import('@playwright/test').Page, heading: string) =>
  page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: heading }) })

test('counts and percentages are correct in the chart, the table and the database', async ({
  page,
}) => {
  const s = await seed.survey('Results math', { activate: true })
  // 5 students. Q1: base case ×3, pointer ×1, loop ×1, compiler ×0. Q2: True ×4, False ×1.
  const picks = [
    [0, 0],
    [0, 0],
    [0, 0],
    [1, 0],
    [2, 1],
  ]
  for (const [i, p] of picks.entries()) await seed.respond(s, `math${i}`, p)

  await page.goto(`/surveys/${s.id}/results`)
  await expect(page.locator('main header')).toContainText('5 responses')
  const q1 = questionCard(page, '1. What is required for recursion?')
  await expect(q1).toContainText('5 answers')
  await expect(q1.locator('svg').first()).toContainText('3 · 60.0%')
  await expect(q1.locator('svg').first()).toContainText('1 · 20.0%')
  await expect(q1.locator('svg').first()).toContainText('0 · 0.0%')
  await expect(
    questionCard(page, '2. Every recursive function needs a stopping condition.')
      .locator('svg')
      .first(),
  ).toContainText('4 · 80.0%')

  await q1.getByText('Show as table').click()
  await expect(q1.locator('tbody tr')).toHaveText([
    /A base case\s*3\s*60\.0%/,
    /A pointer\s*1\s*20\.0%/,
    /A loop\s*1\s*20\.0%/,
    /A compiler\s*0\s*0\.0%/,
  ])

  // The database aggregation agrees exactly.
  const { data } = await seed.sb.rpc('get_survey_results', { p_survey_id: s.id })
  expect(data.response_count).toBe(5)
  expect(
    data.questions[0].choices.map((c: { count: number; percentage: number }) => [
      c.count,
      c.percentage,
    ]),
  ).toEqual([
    [3, 60],
    [1, 20],
    [1, 20],
    [0, 0],
  ])
  expect(
    data.questions[1].choices.map((c: { count: number; percentage: number }) => [
      c.count,
      c.percentage,
    ]),
  ).toEqual([
    [4, 80],
    [1, 20],
  ])

  // Refresh picks up a new response: 3 of 6 = 50.0%.
  await seed.respond(s, 'math-late', [3, 1])
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(page.locator('main header')).toContainText('6 responses')
  await expect(q1.locator('svg').first()).toContainText('3 · 50.0%')
  await expect(q1.locator('svg').first()).toContainText('1 · 16.7%')
})

test('no responses: empty state and every question labelled unanswered', async ({ page }) => {
  const s = await seed.survey('Nobody answered', { activate: true })
  await page.goto(`/surveys/${s.id}/results`)
  await expect(page.getByText('No responses yet.')).toBeVisible()
  await expect(page.getByText('Display the QR code so students can join.')).toBeVisible()
  await expect(page.getByText('Unanswered — no answers to this question yet')).toHaveCount(2)
})

test('closed and archived surveys keep their results', async ({ page }) => {
  const s = await seed.survey('History kept', { activate: true })
  await seed.respond(s, 'hist', [0, 0])
  await seed.sb.rpc('close_survey', { p_survey_id: s.id })
  await page.goto(`/surveys/${s.id}/results`)
  await expect(page.locator('main header')).toContainText('Closed')
  await expect(page.locator('.recharts-surface')).toHaveCount(2)
  await seed.sb.from('surveys').update({ status: 'archived' }).eq('id', s.id)
  await page.reload()
  await expect(page.locator('main header')).toContainText('Archived')
  await expect(page.locator('main header')).toContainText('1 response')
})
