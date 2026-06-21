import { expect, test } from '@playwright/test'

test('home page loads without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  const response = await page.goto('/')
  expect(response?.ok()).toBe(true)
  await expect(page.locator('body')).toBeVisible()
  expect(errors).toEqual([])
})
