/** Phase 14: "Test survey creation" and "Test survey editing". */
import { expect, test } from '@playwright/test'
import { login, Seeder } from './helpers.ts'

let seed: Seeder
test.beforeAll(async () => {
  seed = await Seeder.create()
})
test.afterAll(async () => seed.cleanup())
test.beforeEach(async ({ page }) => login(page))

const questionText = (page: import('@playwright/test').Page, n: number) =>
  page.getByRole('group', { name: `Question ${n}` }).getByLabel('Question text')
const choice = (page: import('@playwright/test').Page, q: number, c: number) =>
  page.getByLabel(`Question ${q}, choice ${c}`, { exact: true })

test('creates a survey: validation, both question types, reordering, saved to the database', async ({
  page,
}) => {
  await page.getByRole('link', { name: 'New Survey' }).click()
  await expect(page).toHaveURL(/\/surveys\/new$/)

  // Required-field validation, shown next to each field.
  await page.getByRole('button', { name: 'Save Draft' }).click()
  await expect(page.getByText('Enter a survey title.')).toBeVisible()
  await expect(page.getByText('Enter the question text.')).toBeVisible()
  await expect(page.getByLabel('Survey Title')).toBeFocused()
  await expect(page).toHaveURL(/\/surveys\/new$/)

  await page.getByLabel('Survey Title').fill('[e2e] Created in the editor')
  await page.getByLabel('Description (optional)').fill('Made by the creation test')
  await questionText(page, 1).fill('Pick a letter')
  await choice(page, 1, 1).fill('A')
  await choice(page, 1, 2).fill('B')
  await page.getByRole('button', { name: '+ Add Choice' }).click()
  await expect(choice(page, 1, 3)).toBeFocused()
  await page.keyboard.type('C')

  await page.getByRole('button', { name: '+ Add Question' }).click()
  await expect(questionText(page, 2)).toBeFocused()
  await page.keyboard.type('The sky is blue')
  await page
    .getByRole('group', { name: 'Question 2' })
    .getByLabel('Type')
    .selectOption('true_false')
  await expect(page.getByText('True / False questions always use these two choices.')).toBeVisible()

  // Reorder: choice C up, then question 2 above question 1.
  await page.getByRole('button', { name: 'Move choice 3 up' }).click()
  await page.getByRole('button', { name: 'Move question 2 up' }).click()
  await expect(questionText(page, 1)).toHaveValue('The sky is blue')

  await page.getByRole('button', { name: 'Save Draft' }).click()
  await expect(page).toHaveURL(/\/surveys\/[0-9a-f-]{36}\/edit$/)
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible()
  const id = page.url().split('/').at(-2)!
  seed.track(id)

  const { data } = await seed.sb
    .from('surveys')
    .select(
      'title, description, status, questions(question_text, question_type, position, choices(choice_text, position))',
    )
    .eq('id', id)
    .order('position', { referencedTable: 'questions' })
    .order('position', { referencedTable: 'questions.choices' })
    .single()
  expect(data).toMatchObject({
    title: '[e2e] Created in the editor',
    description: 'Made by the creation test',
    status: 'draft',
    questions: [
      {
        question_text: 'The sky is blue',
        question_type: 'true_false',
        position: 1,
        choices: [{ choice_text: 'True' }, { choice_text: 'False' }],
      },
      {
        question_text: 'Pick a letter',
        question_type: 'multiple_choice',
        position: 2,
        choices: [{ choice_text: 'A' }, { choice_text: 'C' }, { choice_text: 'B' }],
      },
    ],
  })

  // Data persists across a refresh.
  await page.reload()
  await expect(page.getByLabel('Survey Title')).toHaveValue('[e2e] Created in the editor')
  await expect(questionText(page, 2)).toHaveValue('Pick a letter')
})

test('edits an existing draft and rejects duplicate choices', async ({ page }) => {
  const s = await seed.survey('Edit me')
  await page.goto(`/surveys/${s.id}/edit`)
  await expect(page.getByLabel('Survey Title')).toHaveValue('[e2e] Edit me')

  await page.getByLabel('Survey Title').fill('[e2e] Edited')
  await choice(page, 1, 2).fill('a base case') // same as choice 1, different case
  await page.getByRole('button', { name: 'Save Draft' }).click()
  await expect(page.getByText('This choice is a duplicate.')).toBeVisible()

  await choice(page, 1, 2).fill('Recursion depth')
  await page.getByRole('button', { name: 'Delete choice 4' }).click()
  await page
    .getByRole('group', { name: 'Question 2' })
    .getByRole('button', { name: 'Delete Question' })
    .click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('Unsaved changes')).toBeVisible()
  await page.getByRole('button', { name: 'Save Draft' }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible()

  const { data } = await seed.sb
    .from('surveys')
    .select('title, questions(question_text, choices(choice_text, position))')
    .eq('id', s.id)
    .order('position', { referencedTable: 'questions.choices' })
    .single()
  expect(data!.title).toBe('[e2e] Edited')
  expect(data!.questions).toHaveLength(1)
  expect(data!.questions[0].choices.map((c) => c.choice_text)).toEqual([
    'A base case',
    'Recursion depth',
    'A loop',
  ])
})

test('surveys that are not drafts cannot be edited (UI and database)', async ({ page }) => {
  const s = await seed.survey('Locked once active', { activate: true })
  await page.goto(`/surveys/${s.id}/edit`)
  await expect(page.getByText(/is active and cannot be edited/)).toBeVisible()
  await expect(page.getByLabel('Survey Title')).toHaveCount(0)

  // Even a direct API call is refused by the database trigger.
  const { error } = await seed.sb
    .from('questions')
    .update({ question_text: 'changed' })
    .eq('id', s.questions[0].id)
  expect(error?.message).toBe('SURVEY_LOCKED')

  await page.getByRole('button', { name: 'Duplicate to Edit' }).click()
  await expect(page.getByLabel('Survey Title')).toHaveValue('Copy of [e2e] Locked once active')
  seed.track(page.url().split('/').at(-2)!)
})
