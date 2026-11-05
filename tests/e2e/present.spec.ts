/** Phase 14: "Test QR-code links" (Present page, QR on screen and as PNG). */
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { PNG } from 'pngjs'
import { card, decodeQr, login, Seeder } from './helpers.ts'

let seed: Seeder
test.beforeEach(async () => {
  seed = await Seeder.create()
})
test.afterEach(async () => seed.cleanup())

test('QR code on screen and in the PNG opens the live survey for a signed-out student', async ({
  page,
  browser,
  baseURL,
}) => {
  const s = await seed.survey('QR link check', { activate: true })
  const expected = `${baseURL}/s/${s.slug}`

  await login(page)
  await card(page, 'QR link check').getByRole('link', { name: 'Present' }).click()
  await expect(page.getByRole('heading', { name: '[e2e] QR link check' })).toBeVisible()
  await expect(page.getByText(expected.replace(/^https?:\/\//, ''), { exact: true })).toBeVisible()
  await expect(page.getByText('Responses: 0')).toBeVisible()

  const qr = page.getByRole('img', { name: /QR code linking to/ })
  expect((await qr.boundingBox())!.width).toBeGreaterThanOrEqual(450)
  const onScreen = decodeQr(await qr.screenshot())
  expect(onScreen).toBe(expected)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download QR Code' }).click(),
  ])
  expect(download.suggestedFilename()).toBe(`survey-${s.slug}-qr.png`)
  const png = readFileSync((await download.path())!)
  expect(PNG.sync.read(png).width).toBe(1200)
  expect(decodeQr(png)).toBe(expected)

  // Follow the decoded link exactly as a phone would, with no instructor session.
  const student = await browser.newContext()
  const phone = await student.newPage()
  await phone.goto(onScreen!)
  await expect(phone.getByRole('heading', { name: '[e2e] QR link check' })).toBeVisible()
  await phone.getByText('A base case').click()
  await phone.getByText('True', { exact: true }).click()
  await phone.getByRole('button', { name: 'Submit' }).click()
  await expect(phone.getByText('Thank you!')).toBeVisible()
  await student.close()

  // The projector's count picks it up within the 5-second poll.
  await expect(page.getByText('Responses: 1')).toBeVisible({ timeout: 10_000 })
})

test('closing from the Present page hides the QR code and stops submissions', async ({
  page,
  browser,
}) => {
  const s = await seed.survey('Present close', { activate: true })
  await login(page)
  await page.goto(`/surveys/${s.id}/present`)
  await page.getByRole('button', { name: 'Close Survey' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Close Survey' }).click()
  await expect(page.getByText('This survey is closed.')).toBeVisible()
  await expect(page.getByRole('img', { name: /QR code/ })).toHaveCount(0)

  const ctx = await browser.newContext()
  const student = await ctx.newPage()
  await student.goto(`/s/${s.slug}`)
  await expect(student.getByText('This survey is no longer accepting responses.')).toBeVisible()
  await ctx.close()
})

test('a survey closed elsewhere disappears from the projector', async ({ page }) => {
  const s = await seed.survey('Closed elsewhere', { activate: true })
  await login(page)
  await page.goto(`/surveys/${s.id}/present`)
  await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible()
  await seed.sb.rpc('close_survey', { p_survey_id: s.id })
  await expect(page.getByText('This survey is closed.')).toBeVisible({ timeout: 10_000 })
})
