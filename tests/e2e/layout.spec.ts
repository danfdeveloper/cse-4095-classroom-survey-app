/**
 * Phase 14: "Test mobile layout" and accessibility. Runs on desktop Chrome,
 * desktop Firefox and the Pixel 7 phone project: every page must have no
 * horizontal scroll, a title, and zero axe-core WCAG A/AA violations.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, test, type Page } from '@playwright/test'
import { fitsWidth, login, Seeder } from './helpers.ts'

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
)

async function audit(page: Page, name: string) {
  expect(await fitsWidth(page), `${name}: horizontal scroll`).toBe(true)
  expect(await page.title(), `${name}: page title`).not.toBe('')
  await page.evaluate(axeSource)
  const violations = await page.evaluate(async () => {
    const r = await (
      window as unknown as {
        axe: {
          run: (
            c: unknown,
            o: unknown,
          ) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }>
        }
      }
    ).axe.run(document, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
    })
    return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
  })
  expect(violations, `${name}: accessibility violations`).toEqual([])
}

let seed: Seeder
test.beforeAll(async () => {
  seed = await Seeder.create()
})
test.afterAll(async () => seed.cleanup())

test('every page fits the screen and passes axe', async ({ page, browser }) => {
  const draft = await seed.survey('Layout draft')
  const done = await seed.survey('Layout results', { activate: true })
  await seed.respond(done, 'layout', [0, 0])
  await seed.sb.rpc('close_survey', { p_survey_id: done.id })
  const live = await seed.survey('Layout live', { activate: true })

  for (const [path, text] of [
    ['/', 'Instructor Login'],
    ['/login', 'Email'],
    ['/nope', 'Page not found'],
  ]) {
    await page.goto(path)
    await expect(page.getByText(text).first()).toBeVisible()
    await audit(page, path)
  }

  await login(page)
  await expect(page.getByText('[e2e] Layout draft')).toBeVisible()
  await audit(page, 'dashboard')
  for (const [path, text] of [
    [`/surveys/${draft.id}/edit`, 'Question 1'],
    ['/surveys/new', 'Question 1'],
    [`/surveys/${live.id}/present`, 'Responses:'],
    [`/surveys/${done.id}/results`, 'Show as table'],
  ]) {
    await page.goto(path)
    await expect(page.getByText(text).first()).toBeVisible()
    await audit(page, path)
  }

  const ctx = await browser.newContext({ ...test.info().project.use })
  const student = await ctx.newPage()
  await student.goto(`/s/${live.slug}`)
  await expect(student.getByText('What is required for recursion?')).toBeVisible()
  await audit(student, 'student form')
  await student.getByRole('button', { name: 'Submit' }).click()
  await expect(student.getByText('Please answer every question')).toBeVisible()
  await audit(student, 'student errors')
  await student.goto('/s/nosuch')
  await expect(student.getByText('Survey not found.')).toBeVisible()
  await audit(student, 'student not found')
  await ctx.close()
})

test('keyboard: skip link, visible focus everywhere, dialog focus handling', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'keyboard navigation is a desktop concern')
  await seed.survey('Keyboard target')
  await login(page)
  await expect(page.getByText('[e2e] Keyboard target')).toBeVisible()

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('main#main')).toBeFocused()

  // Tab through the page: every stop must show a focus indicator.
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab')
    const visible = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement
      if (!el || el === document.body) return true
      const cs = getComputedStyle(el)
      return (
        (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none'
      )
    })
    expect(visible, `focus stop ${i + 1} has no visible indicator`).toBe(true)
  }

  const del = page
    .getByRole('listitem')
    .filter({ hasText: '[e2e] Keyboard target' })
    .getByRole('button', { name: 'Delete' })
  await del.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab')
    const where = await page.evaluate(() =>
      document.activeElement === document.body
        ? 'chrome'
        : document.activeElement?.closest('dialog')
          ? 'dialog'
          : 'page',
    )
    expect(where, 'focus escaped the modal into the page').not.toBe('page')
  }
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(del).toBeFocused()
})
