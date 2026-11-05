/** Phase 14: "Test activation" and "Test closing surveys" (plus archive, delete, duplicate, filters). */
import { expect, test } from '@playwright/test'
import { anonClient, card, login, Seeder } from './helpers.ts'

let seed: Seeder
test.beforeEach(async ({ page }) => {
  seed = await Seeder.create()
  await login(page)
})
test.afterEach(async () => seed.cleanup())

const status = async (id: string) =>
  (await seed.sb.from('surveys').select('status, public_slug').eq('id', id).single()).data!

test('activation: one active survey at a time, previous one closes after confirming', async ({
  page,
}) => {
  const a = await seed.survey('Alpha')
  const b = await seed.survey('Beta')
  await page.reload()

  await card(page, 'Alpha').getByRole('button', { name: 'Activate' }).click()
  await expect(card(page, 'Alpha').getByText('Active', { exact: true })).toBeVisible()
  const alpha = await status(a.id)
  expect(alpha.status).toBe('active')
  expect(alpha.public_slug).toMatch(/^[a-hjkmnp-z2-9]{6}$/)
  await expect(card(page, 'Alpha').getByRole('link', { name: 'Edit' })).toHaveCount(0)

  await card(page, 'Beta').getByRole('button', { name: 'Activate' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('"[e2e] Alpha" is currently active')
  await dialog.getByRole('button', { name: 'Activate' }).click()
  await expect(card(page, 'Beta').getByText('Active', { exact: true })).toBeVisible()
  await expect(card(page, 'Alpha').getByText('Closed', { exact: true })).toBeVisible()
  expect((await status(a.id)).status).toBe('closed')
  expect((await status(b.id)).status).toBe('active')
})

test('closing: confirmation, Escape cancels, students are refused immediately after', async ({
  page,
}) => {
  const s = await seed.survey('Close me', { activate: true })
  await page.reload()

  await card(page, 'Close me').getByRole('button', { name: 'Close' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  expect((await status(s.id)).status).toBe('active')

  await card(page, 'Close me').getByRole('button', { name: 'Close' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Close Survey' }).click()
  await expect(card(page, 'Close me').getByText('Closed', { exact: true })).toBeVisible()

  const { error } = await anonClient().rpc('submit_survey_response', {
    p_survey_id: s.id,
    p_anonymous_token: 'late',
    p_answers: s.questions.map((q) => ({ question_id: q.id, choice_id: q.choices[0].id })),
  })
  expect(error?.message).toBe('SURVEY_NOT_ACTIVE')
  // A closed survey cannot be re-activated (duplicate it instead).
  await expect(card(page, 'Close me').getByRole('button', { name: 'Activate' })).toHaveCount(0)
})

test('archive, delete (stronger warning with responses), and duplicate', async ({ page }) => {
  const kept = await seed.survey('Archive me', { activate: true })
  await seed.respond(kept, 'arch', [0, 0])
  await seed.sb.rpc('close_survey', { p_survey_id: kept.id })
  const doomed = await seed.survey('Delete me', { activate: true })
  await seed.respond(doomed, 'del', [1, 1])
  await seed.sb.rpc('close_survey', { p_survey_id: doomed.id })
  await page.reload()

  await card(page, 'Archive me').getByRole('button', { name: 'Archive' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click()
  await expect(card(page, 'Archive me').getByText('Archived', { exact: true })).toBeVisible()

  await card(page, 'Delete me').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('dialog')).toContainText(
    'This survey has 1 response. They will be permanently deleted.',
  )
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(card(page, 'Delete me')).toHaveCount(0)
  expect((await seed.sb.from('responses').select('id').eq('survey_id', doomed.id)).data).toEqual([])

  await card(page, 'Archive me').getByRole('button', { name: 'Duplicate' }).click()
  await expect(page).toHaveURL(/\/surveys\/[0-9a-f-]{36}\/edit$/)
  const copyId = page.url().split('/').at(-2)!
  seed.track(copyId)
  await expect(page.getByLabel('Survey Title')).toHaveValue('Copy of [e2e] Archive me')
  const { data: copy } = await seed.sb
    .from('surveys')
    .select('status, public_slug, questions(choices(id)), responses(count)')
    .eq('id', copyId)
    .single()
  expect(copy).toMatchObject({ status: 'draft', public_slug: null, responses: [{ count: 0 }] })
  expect(copy!.questions.flatMap((q) => q.choices)).toHaveLength(6)
})

test('search, status and date filters combine and survive navigation', async ({ page }) => {
  await seed.survey('Filter quiz')
  const old = await seed.survey('Filter old zebra')
  const recent = await seed.survey('Filter recent zebra', { activate: true })
  await seed.sb.rpc('close_survey', { p_survey_id: recent.id })
  const daysAgo = new Date(Date.now() - 45 * 86_400_000).toISOString()
  await seed.sb.from('surveys').update({ created_at: daysAgo }).eq('id', old.id)
  await page.reload()

  const titles = page.getByRole('listitem').locator('h2')
  await page.getByLabel('Search').fill('[e2e] Filter')
  await expect(titles).toHaveCount(3)
  await page.getByLabel('Search').fill('zebra')
  await expect(titles).toHaveText(['[e2e] Filter recent zebra', '[e2e] Filter old zebra'])
  await page.getByLabel('Created').selectOption('30d')
  await expect(titles).toHaveText(['[e2e] Filter recent zebra'])
  await page.getByLabel('Status').selectOption('draft')
  await expect(page.getByText('No surveys match your search.')).toBeVisible()
  await page.getByLabel('Status').selectOption('closed')
  await expect(titles).toHaveText(['[e2e] Filter recent zebra'])

  await card(page, 'Filter recent zebra').getByRole('link', { name: 'Results' }).click()
  await page.getByRole('link', { name: 'Back to Dashboard' }).click()
  await expect(page.getByLabel('Created')).toHaveValue('30d')
  await expect(titles).toHaveText(['[e2e] Filter recent zebra'])
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.getByLabel('Search')).toHaveValue('')
})
