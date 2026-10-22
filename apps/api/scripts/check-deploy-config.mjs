import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Validate the simple, quoted production settings used by this repository's Wrangler config. */
export function validateDeployConfig(config, { allowUnconfiguredOrigin = false } = {}) {
  const readString = (name) =>
    config.match(new RegExp(`^${name}\\s*=\\s*["']([^"']*)["']\\s*(?:#.*)?$`, 'm'))?.[1]
  const databaseId = readString('database_id')
  if (
    !databaseId ||
    !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(databaseId) ||
    /^0+$/.test(databaseId.replaceAll('-', ''))
  ) {
    throw new Error(
      'Set the real D1 database_id in apps/api/wrangler.toml before any remote operation.',
    )
  }
  if (allowUnconfiguredOrigin) return
  const origin = readString('APP_URL')
  let url
  try {
    url = new URL(origin)
  } catch {
    /* Report one actionable configuration error below. */
  }
  if (
    !url ||
    url.protocol !== 'https:' ||
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.hostname.endsWith('.invalid') ||
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]' ||
    readString('ENVIRONMENT') !== 'production'
  ) {
    throw new Error(
      'Set ENVIRONMENT="production" and APP_URL to the real HTTPS origin (no path or trailing slash). Use deploy:bootstrap only for the initial address discovery.',
    )
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config = await readFile(
      fileURLToPath(new URL('../wrangler.toml', import.meta.url)),
      'utf8',
    )
    validateDeployConfig(config, { allowUnconfiguredOrigin: process.argv.includes('--bootstrap') })
  } catch (error) {
    console.error(`Refusing remote operation: ${error.message}`)
    process.exitCode = 1
  }
}
