/**
 * Phase 14: "Test student submissions", "Test duplicate-submission prevention"
 * and the student half of "Test mobile layout" (also runs on the phone project).
 */
import { expect, test } from '@playwright/test'
import { fitsWidth, Seeder } from './helpers.ts'

let seed: Seeder
test.beforeEach(async () => {
  seed = await Seeder.create()
})
test.afterEach(async () => seed.cleanup())

const responsesFor = async (id: string) =>
  (
    await seed.sb
      .from('responses')
      .select('anonymous_token, answers(choices(choice_text))')
      .eq('survey_id', id)
  ).data!

test('student answers, gets a confirmation, and the answers are stored', async ({ page }) => {
  const s = await seed.survey('Student flow', {
    activate: true,
    description: 'Quick understanding check',
  })
  await page.goto(`/s/${s.slug}`)
  await expect(page.getByRole('heading', { name: '[e2e] Student flow' })).toBeVisible()
  await expect(page.getByText('Quick understanding check')).toBeVisible()
  await expect(page.getByRole('link')).toHaveCount(0) // no login, menu or navigation
  expect(await fitsWidth(page)).toBe(true)

  // Large touch targets and a wide Submit button.
  for (const box of await page
    .locator('label')
    .evaluateAll((ls) => ls.map((l) => l.getBoundingClientRect().height)))
    expect(box).toBeGreaterThanOrEqual(44)

  // Required answers.
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText('Please answer every question before submitting.')).toBeVisible()
  await expect(page.getByText('Please choose an answer.')).toHaveCount(2)

  await page.getByText('A pointer').click()
  await page.getByText('False', { exact: true }).click()
  await expect(page.getByText('Please choose an answer.')).toHaveCount(0)
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText('Thank you!')).toBeVisible()
  await expect(page.getByText('Your response has been recorded.')).toBeVisible()

  const token = await page.evaluate(() => localStorage.getItem('classroom-survey:token'))
  const rows = await responsesFor(s.id)
  expect(rows).toHaveLength(1)
  expect(rows[0].anonymous_token).toBe(token)
  expect(
    rows[0].answers
      .map((a) => (a.choices as unknown as { choice_text: string }).choice_text)
      .sort(),
  ).toEqual(['A pointer', 'False'])
})

test('duplicate submissions are prevented (browser flag and database check)', async ({
  page,
  browser,
}) => {
  const s = await seed.survey('Duplicate check', { activate: true })
  const answer = async () => {
    await page.getByText('A base case').click()
    await page.getByText('True', { exact: true }).click()
    await page.getByRole('button', { name: 'Submit' }).click()
  }
  await page.goto(`/s/${s.slug}`)
  await answer()
  await expect(page.getByText('Thank you!')).toBeVisible()

  await page.reload()
  await expect(
    page.getByText('You have already submitted a response to this survey.'),
  ).toBeVisible()

  // Clear the browser's "submitted" flag but keep the token: the database still refuses.
  await page.evaluate((id) => localStorage.removeItem(`classroom-survey:submitted:${id}`), s.id)
  await page.reload()
  await answer()
  await expect(
    page.getByText('You have already submitted a response to this survey.'),
  ).toBeVisible()
  expect(await responsesFor(s.id)).toHaveLength(1)

  // A different student (another browser) can still submit.
  const other = await browser.newContext()
  const p2 = await other.newPage()
  await p2.goto(`/s/${s.slug}`)
  await p2.getByText('A loop').click()
  await p2.getByText('False', { exact: true }).click()
  await p2.getByRole('button', { name: 'Submit' }).click()
  await expect(p2.getByText('Thank you!')).toBeVisible()
  await other.close()
  expect(await responsesFor(s.id)).toHaveLength(2)
})

test('closed while answering, closed link, unknown link, and network failure', async ({ page }) => {
  const s = await seed.survey('Student edge cases', { activate: true })
  await page.goto(`/s/${s.slug}`)
  await page.getByText('A base case').click()
  await page.getByText('True', { exact: true }).click()

  await page.route('**/rest/v1/rpc/submit_survey_response', (r) => r.abort())
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText(/Could not submit\. Check your connection/)).toBeVisible()
  await expect(page.getByRole('radio', { name: 'A base case' })).toBeChecked()
  await page.unroute('**/rest/v1/rpc/submit_survey_response')

  await seed.sb.rpc('close_survey', { p_survey_id: s.id })
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText('This survey is no longer accepting responses.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('This survey is no longer accepting responses.')).toBeVisible()
  await page.goto('/s/nosuch')
  await expect(page.getByText('Survey not found.')).toBeVisible()
  expect(await responsesFor(s.id)).toHaveLength(0)
})
