/** The signed-in app, driven through Playwright: which pages and periods exist, and how to read them. */

export const PAGES = [
  { name: 'balance', link: 'Balance', period: true },
  { name: 'run', link: 'Run', period: true },
  { name: 'ride', link: 'Ride', period: true },
  { name: 'history', link: 'History', period: false },
  { name: 'activities', link: 'Activities', period: true },
  { name: 'profile', link: 'Profile', period: false },
]

/** `file` is the part of an output file name, `label` the period control's accessible name. */
export const PERIODS = [
  { file: '6-weeks', label: '6 weeks' },
  { file: '12-weeks', label: '12 weeks' },
  { file: '6-months', label: '6 months' },
  { file: '12-months', label: '12 months' },
  { file: 'all-time', label: 'All time' },
]

/** The pages the header links to; the rest are the rail's. */
const BANNER_PAGES = new Set(['profile', 'history', 'activities'])

const BUSY = '[aria-busy="true"], progress, [role="progressbar"]'
const BUSY_TIMEOUT_MS = 180_000
const STABLE_TIMEOUT_MS = 30_000

/** The page's main text, one non-empty line per row. */
export async function mainText(page) {
  const main = page.locator('main').first()
  const text =
    (await main.count()) > 0 ? await main.innerText() : await page.locator('body').innerText()
  return text
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => line.trim() !== '')
    .join('\n')
}

/** Scrolls top to bottom and back, so anything that loads on scroll has loaded. */
async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, window.innerHeight - 100)
    for (let y = 0, n = 0; n < 60; n++, y += step) {
      window.scrollTo(0, y)
      await new Promise((resolveWait) => setTimeout(resolveWait, 120))
      if (y + window.innerHeight >= document.documentElement.scrollHeight) break
    }
    window.scrollTo(0, 0)
  })
}

/** Waits until nothing is busy and the main text has stopped changing; `note` records a wait that timed out. */
export async function settle(page, what, note) {
  await page
    .waitForFunction((busy) => !document.querySelector(busy), BUSY, { timeout: BUSY_TIMEOUT_MS })
    .catch(() => note('warn', `${what}: still busy after ${BUSY_TIMEOUT_MS / 1000} s`))
  const stable = async () => {
    let last = null
    let same = 0
    for (let waited = 0; waited < STABLE_TIMEOUT_MS && same < 3; waited += 250) {
      const text = await mainText(page)
      same = text === last ? same + 1 : 0
      last = text
      await page.waitForTimeout(250)
    }
    return same >= 3
  }
  if (!(await stable()))
    note('warn', `${what}: text kept changing for ${STABLE_TIMEOUT_MS / 1000} s`)
  await scrollThrough(page)
  if (!(await stable())) note('warn', `${what}: text kept changing after scroll`)
}

/**
 * Clicks the page's link and waits for it to be current. Profile, History and Activities are in the banner; Balance, Run
 * and Ride in the rail's Pages navigation.
 */
export async function goToPage(page, target) {
  const link = BANNER_PAGES.has(target.name)
    ? page.getByRole('banner').getByRole('link', { name: target.link, exact: true })
    : page
        .getByRole('navigation', { name: 'Pages' })
        .getByRole('link', { name: target.link, exact: true })
  await link.click()
  // The link is found again once clicked: leaving Profile mounts a new rail, so the clicked element may be gone.
  await link.and(page.locator('[aria-current]')).waitFor({ timeout: 30_000 })
  await page.mouse.move(0, 0)
}

/** Selects the period; false when the page does not offer it. */
export async function pickPeriod(page, label) {
  const group = page.getByRole('group', { name: 'Period' }).first()
  const radio = group.getByRole('radio', { name: label, exact: true })
  if ((await radio.count()) === 0) return false
  if (!(await radio.isChecked())) await radio.check({ force: true })
  return true
}
