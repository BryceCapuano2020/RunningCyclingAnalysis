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
  // The share preview is a blob: image, so img-src must allow blob: or the preview is a broken picture.
  const imgSrc = headers['content-security-policy']
    .split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith('img-src '))
  expect(imgSrc?.split(' ')).toContain('blob:')
  await page.getByRole('button', { name: 'See a sample athlete' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/leans toward|in balance/)
  // The meter is named by the balance in words, each sport's level is a line with its grade, and the ride on
  // foot is a tile with its pace and the ride behind it.
  await expect(
    page.getByRole('img', { name: /^Cycling grades \d+ points? higher than running/ }),
  ).toBeVisible()
  await expect(page.locator('.balance-levels__row')).toHaveCount(2)
  await expect(page.locator('.balance-levels__row').first()).toContainText(/\d+%/)
  const onFoot = page.getByRole('article', { name: 'Ride on foot' })
  await expect(onFoot.locator('.stat-tile__number')).toHaveText(/^\d+:\d{2}$/)
  await expect(onFoot.getByRole('link', { name: /^Set on / })).toBeVisible()
  await page.getByRole('button', { name: 'Share image' }).click()
  const sheet = page.getByRole('dialog', { name: 'Share image' })
  await expect(sheet).toBeVisible()
  const preview = sheet.getByRole('img', { name: /^Preview of the/ })
  await expect(preview).toBeVisible()
  // A picture the CSP refuses is still a visible broken image, so check that it decoded.
  await expect
    .poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)
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

test('an unknown path gets the static 404 page, and /api keeps its JSON 404', async ({ page }) => {
  // A navigation to an unknown path is answered by the asset service with 404.html, not by the Worker.
  const navigated = await page.goto('/no/such/page')
  expect(navigated?.status()).toBe(404)
  expect(navigated?.headers()['content-type']).toContain('text/html')
  expect(navigated?.headers()['content-security-policy']).toContain("default-src 'self'")
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Go to the app' })).toHaveAttribute('href', '/')
  // A missing hashed asset is a 404 too, and never the app's own page, whichever way it is asked for.
  const missingAsset = await page.request.get('/assets/missing-0000.js')
  expect(missingAsset.status()).toBe(404)
  expect(await missingAsset.text()).not.toContain('id="root"')
  // Neither the 404 page nor the Worker's 404 is cached as if it were a hashed asset: only the files the
  // build emitted carry the year-long rule, one rule each, so a missing file cannot be cached for a year.
  expect(missingAsset.headers()['cache-control'] ?? '').not.toContain('immutable')
  expect(missingAsset.headers()['cache-control'] ?? '').not.toContain('max-age=31536000')
  const typed = await page.goto('/assets/missing-0000.js')
  expect(typed?.status()).toBe(404)
  expect(typed?.headers()['cache-control'] ?? '').not.toContain('immutable')
  expect(typed?.headers()['cache-control'] ?? '').not.toContain('max-age=31536000')

  // The API keeps its JSON 404, which runs the Worker and so its rate limiter.
  const api = await page.request.get('/api/no-such-route')
  expect(api.status()).toBe(404)
  expect(api.headers()['content-type']).toContain('application/json')
  expect(await api.json()).toMatchObject({ error: { code: 'not_found' } })
  expect(api.headers()['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  // A navigation under /api runs the Worker first too, as the OAuth callback's does. A change to
  // run_worker_first that sent it to the asset service would answer this with the 404 page instead.
  const navigatedApi = await page.goto('/api/no-such-route')
  expect(navigatedApi?.status()).toBe(404)
  expect(navigatedApi?.headers()['content-type']).toContain('application/json')
  expect(navigatedApi?.headers()['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  expect(await navigatedApi?.json()).toMatchObject({ error: { code: 'not_found' } })

  // The app's own pages are unaffected: hash routes still load the app from the root.
  const home = await page.goto('/#/run')
  expect(home?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // The clean URL of the privacy page still resolves.
  const privacy = await page.goto('/privacy')
  expect(privacy?.status()).toBe(200)
})

test('the share image, the manifest and its icons are served as static files with the page’s headers', async ({
  page,
}) => {
  const image = await page.request.get('/social-card.png')
  expect(image.status()).toBe(200)
  expect(image.headers()['content-type']).toContain('image/png')
  expect((await image.body()).byteLength).toBeLessThan(200 * 1024)

  const manifest = await page.request.get('/manifest.webmanifest')
  expect(manifest.status()).toBe(200)
  expect(manifest.headers()['content-type']).toMatch(/manifest\+json|application\/json/)
  const { icons } = (await manifest.json()) as { icons: { src: string; type: string }[] }
  for (const icon of icons) {
    const file = await page.request.get(icon.src)
    expect(file.status(), icon.src).toBe(200)
    expect(file.headers()['content-type']).toContain(icon.type)
  }

  // The page links them, and its policy lets it load its own manifest and icons.
  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    './manifest.webmanifest',
  )
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /\/social-card\.png$/,
  )
  // The build filled the image's description from the sample's figures (landingFigures), leaving no placeholder.
  for (const tag of ['meta[property="og:image:alt"]', 'meta[name="twitter:image:alt"]']) {
    await expect(page.locator(tag)).toHaveAttribute(
      'content',
      /^A sample athlete's result: running at \w+ level, cycling at \w+, balance leaning \d+ points toward (running|cycling)\.$/,
    )
  }
  const headers = (await page.request.get('/')).headers()
  expect(headers['content-security-policy']).toContain("default-src 'self'")
})

test('every built asset is served with the year-long cache rule, from its own exact rule', async ({
  request,
}) => {
  // The files the build emitted, read from the build output the Worker serves.
  const { readdirSync, readFileSync } = await import('node:fs')
  const dist = new URL('../dist/', import.meta.url)
  const assets = readdirSync(new URL('assets/', dist), { withFileTypes: true })
  expect(assets.some((entry) => entry.isDirectory())).toBe(false)
  const files = assets.map((entry) => entry.name)
  // A script, a stylesheet, a font and the analysis worker are among them, so each kind is covered.
  for (const pattern of [/\.js$/, /\.css$/, /\.woff2?$/, /^analysis\.worker-/]) {
    expect(
      files.some((file) => pattern.test(file)),
      String(pattern),
    ).toBe(true)
  }
  const headers = readFileSync(new URL('_headers', dist), 'utf8')
  for (const file of files) {
    expect(headers, `a rule for ${file}`).toContain(`/assets/${file}\n  Cache-Control:`)
    const response = await request.get(`/assets/${file}`)
    expect(response.status(), file).toBe(200)
    expect(response.headers()['cache-control'], file).toBe('public, max-age=31536000, immutable')
  }
})
