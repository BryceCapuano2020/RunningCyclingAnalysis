import { expect, test } from '@playwright/test'
import { goTo, openSample } from './helpers.js'

test.use({ viewport: { width: 390, height: 844 } })

test('a Run section opens and shuts by mouse and by Enter on a phone, and its body mounts on first open', async ({
  page,
}) => {
  await openSample(page)
  await goTo(page, 'Run')

  const section = page.getByRole('region', { name: 'Same heart rate, week by week' })
  const details = section.locator('.sport-disclosure__details')
  const summary = section.locator('.sport-disclosure__summary')
  const body = section.locator('.sport-disclosure__body')
  await expect(details).not.toHaveAttribute('open')
  await expect(body).toBeEmpty()

  await summary.click()
  await expect(details).toHaveAttribute('open')
  await expect(section.getByRole('figure').first()).toBeVisible()

  await summary.click()
  await expect(details).not.toHaveAttribute('open')

  await summary.focus()
  await page.keyboard.press('Enter')
  await expect(details).toHaveAttribute('open')
  await expect(summary).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(details).not.toHaveAttribute('open')
})
