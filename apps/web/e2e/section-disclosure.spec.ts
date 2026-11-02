import { expect, test } from '@playwright/test'
import { goTo, openSample } from './helpers.js'

test.use({ viewport: { width: 390, height: 844 } })

test('a Run section is open on a phone, shuts and opens by mouse and by Enter, and keeps its body', async ({
  page,
}) => {
  await openSample(page)
  await goTo(page, 'Run')

  const section = page.getByRole('region', { name: 'Pace at heart rate' })
  const details = section.locator('.sport-disclosure__details')
  const summary = section.locator('.sport-disclosure__summary')
  const body = section.locator('.sport-disclosure__body')
  // A section with content is open to start with, with its chart drawn.
  await expect(details).toHaveAttribute('open')
  await expect(section.getByRole('figure').first()).toBeVisible()

  await summary.click()
  await expect(details).not.toHaveAttribute('open')
  await expect(body).toBeHidden()

  await summary.click()
  await expect(details).toHaveAttribute('open')
  await expect(section.getByRole('figure').first()).toBeVisible()

  await summary.focus()
  await page.keyboard.press('Enter')
  await expect(details).not.toHaveAttribute('open')
  await expect(summary).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(details).toHaveAttribute('open')
})
