import type { Context } from 'hono'
import type { AppEnv } from '../env.ts'
import type { HttpError } from '../errors.ts'
import { toBase64 } from '../util.ts'

interface PageText {
  title: string
  body: string
}

/**
 * The sign-in refusals that end on a page instead of JSON, because Google sends the browser to the
 * callback as a navigation. Static text only: nothing from the request, such as the email, is echoed.
 */
const PAGES: Record<string, PageText> = {
  not_on_list: {
    title: 'This Google account is not on the list',
    body: 'Creating an account is by invitation while the app is in testing, and the Google account you used is not on the list, so nothing was created. If you were invited, ask the person who invited you to add the address of this Google account, then try again. You can also use the app without an account: your analysis stays on this device.',
  },
  signup_limit: {
    title: 'Too many accounts today',
    body: 'This Google account has created several accounts today, and deleted them again. Try again after midnight UTC.',
  },
  account_deleting: {
    title: 'This account is being deleted',
    body: 'Deleting the account has not finished yet. Try signing in again in a few minutes.',
  },
  account_conflict: {
    title: 'This email belongs to another Google account',
    body: 'The email address is already linked to a different Google account. Sign in with that account instead.',
  },
}

const STYLE =
  'body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:24px 16px;background:#fff;color:#1a1a1a}' +
  'main{max-width:34rem;margin:12vh auto 0}h1{font-size:1.4rem;line-height:1.25;margin:0 0 .75rem}' +
  'p{margin:0 0 1rem}a{color:#0b57d0}@media (prefers-color-scheme:dark){body{background:#16181c;color:#eceff4}a{color:#8ab4f8}}'

/** Whether a sign-in error has a page. */
export function hasRefusalPage(error: HttpError): boolean {
  return Object.hasOwn(PAGES, error.code)
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

let styleHash: Promise<string> | undefined

/** The CSP source for the inline style: its SHA-256, so the page needs no 'unsafe-inline'. */
function styleSource(): Promise<string> {
  styleHash ??= crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(STYLE))
    .then((digest) => `'sha256-${toBase64(new Uint8Array(digest))}'`)
  return styleHash
}

/** Renders the refusal as an HTML page with the error's status and its own tight CSP. */
export async function refusalPage(c: Context<AppEnv>, error: HttpError): Promise<Response> {
  const page = PAGES[error.code]
  if (!page) throw error
  const appUrl = escapeHtml(c.env.APP_URL)
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(page.title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>${escapeHtml(page.title)}</h1>
<p>${escapeHtml(page.body)}</p>
<p><a href="${appUrl}">Back to the app</a></p>
</main>
</body>
</html>
`
  if (error.retryAfter !== undefined) c.header('Retry-After', String(error.retryAfter))
  c.header(
    'Content-Security-Policy',
    `default-src 'none'; style-src ${await styleSource()}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  )
  return c.html(html, error.status)
}
