import { expect, test } from '@playwright/test'

test('the Worker serves the app, restrictive headers, worker assets and same-origin API together', async ({
  page,
}) => {
  const violations: string[] = []
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(
        `CSP violation: ${event.violatedDirective} ${event.blockedURI} ${event.sourceFile}:${event.lineNumber}`,
      )
    })
  })
  page.on('console', (message) => {
    if (message.text().startsWith('CSP violation:')) violations.push(message.text())
  })
  page.on('pageerror', (error) => violations.push(error.message))
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  const headers = response!.headers()
  expect(headers['content-security-policy']).toContain("script-src 'self'")
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('no-referrer')
  expect(headers['x-frame-options']).toBe('DENY')
  await page.getByRole('button', { name: 'See a sample athlete' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/leans toward|in balance/)
  await expect(
    page.getByRole('heading', { level: 2, name: /^On foot, your ride is worth/ }),
  ).toBeVisible()
  expect(violations).toEqual([])

  const session = await page.request.get('/api/me')
  expect(session.status()).toBe(200)
  expect(await session.json()).toBeNull()
  expect(session.headers()['cache-control']).toBe('no-store')
  expect(session.headers()['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  const missing = await page.request.get('/api/unknown')
  expect(missing.status()).toBe(404)
  expect(missing.headers()['content-type']).toContain('application/json')
  expect(await missing.json()).toMatchObject({ error: { code: 'not_found' } })

  const assetUrl = await page.locator('script[type="module"][src]').getAttribute('src')
  expect(assetUrl).toBeTruthy()
  const asset = await page.request.get(assetUrl!)
  expect(asset.status()).toBe(200)
  expect(asset.headers()['cache-control']).toContain('immutable')
})
