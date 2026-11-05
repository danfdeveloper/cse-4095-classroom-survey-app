/** Phase 14: "Test instructor login" and "Test unauthorized access attempts". */
import { expect, test } from '@playwright/test'
import { anonClient, email, login, password, Seeder } from './helpers.ts'

test.describe('instructor login', () => {
  test('rejects a wrong password with a friendly message', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(email())
    await page.getByLabel('Password').fill('definitely-not-the-password')
    await page.getByRole('button', { name: 'Log In' }).click()
    await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('logs in, survives a reload, and logs out', async ({ page }) => {
    await login(page)
    await expect(page.getByText(email())).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await page.goto('/login')
    await expect(page).toHaveURL(/\/dashboard/) // already signed in
    await page.getByRole('button', { name: 'Logout' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('returns to the originally requested page after login', async ({ page }) => {
    await page.goto('/surveys/new')
    await expect(page).toHaveURL(/\/login$/)
    await page.getByLabel('Email').fill(email())
    await page.getByLabel('Password').fill(password())
    await page.getByRole('button', { name: 'Log In' }).click()
    await expect(page).toHaveURL(/\/surveys\/new$/)
  })
})

test.describe('unauthorized access', () => {
  let seed: Seeder
  let draftId: string
  test.beforeAll(async () => {
    seed = await Seeder.create()
    draftId = (await seed.survey('Unauthorized target')).id
  })
  test.afterAll(async () => seed.cleanup())

  for (const path of ['/dashboard', '/surveys/new', 'edit', 'results', 'present']) {
    test(`signed-out visitor is sent to login from ${path}`, async ({ page }) => {
      const target = path.startsWith('/') ? path : `/surveys/${draftId}/${path}`
      await page.goto(target)
      await expect(page).toHaveURL(/\/login$/)
      await expect(page.getByText('[e2e] Unauthorized target')).toHaveCount(0)
    })
  }

  test.describe('direct API calls with the public key (what a student could try)', () => {
    test.skip(({ browserName }) => browserName !== 'chromium', 'API checks are browser-independent')

    test('nobody can create an instructor account (sign-ups disabled)', async () => {
      const { data, error } = await anonClient().auth.signUp({
        email: `intruder-${Date.now()}@example.com`,
        password: 'intruder-password-123',
      })
      expect(error, 'sign-up must be refused').not.toBeNull()
      expect(data.user).toBeNull()
    })

    test('cannot read drafts, responses or answers', async () => {
      const anon = anonClient()
      expect((await anon.from('surveys').select('id').eq('id', draftId)).data).toEqual([])
      const responses = await anon.from('responses').select('id').limit(1)
      expect(responses.error ?? responses.data).toBeTruthy()
      expect(responses.data ?? []).toEqual([])
      const answers = await anon.from('answers').select('id').limit(1)
      expect(answers.data ?? []).toEqual([])
    })

    test('cannot create, change or delete surveys', async () => {
      const anon = anonClient()
      expect((await anon.from('surveys').insert({ title: 'hacked' })).error).not.toBeNull()
      const upd = await anon.from('surveys').update({ title: 'hacked' }).eq('id', draftId).select()
      expect(upd.data ?? []).toEqual([])
      const del = await anon.from('surveys').delete().eq('id', draftId).select()
      expect(del.data ?? []).toEqual([])
      expect((await anon.from('responses').insert({ survey_id: draftId })).error).not.toBeNull()
    })

    for (const [fn, args] of [
      ['activate_survey', { p_survey_id: '00000000-0000-0000-0000-000000000000' }],
      ['close_survey', { p_survey_id: '00000000-0000-0000-0000-000000000000' }],
      ['duplicate_survey', { p_survey_id: '00000000-0000-0000-0000-000000000000' }],
      ['get_survey_results', { p_survey_id: '00000000-0000-0000-0000-000000000000' }],
      ['save_survey', { p_survey_id: null, p_title: 'x', p_description: '', p_questions: [] }],
    ] as const) {
      test(`cannot call instructor function ${fn}`, async () => {
        const { error } = await anonClient().rpc(fn, args)
        expect(error).not.toBeNull()
      })
    }
  })
})
