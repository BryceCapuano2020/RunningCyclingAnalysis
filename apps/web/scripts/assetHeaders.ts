/**
 * The `_headers` rules that make the built assets cacheable for a year.
 *
 * A pattern such as `/assets/*` would match a missing file as well as a real one, and Workers Static Assets
 * applies a rule by the path asked for, so the 404 page served for a missing asset would be told to be cached
 * for a year too. One rule per emitted file matches only files that exist: a missing path gets none.
 */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

/** Workers Static Assets allows 100 header rules in all, the file's own included. */
export const MAX_HEADER_RULES = 100

/** Marks the block the build appends, so a second run replaces nothing and adds nothing twice. */
export const RULES_MARKER = '# Cache rules written by the build'

/** The rules a `_headers` text already holds: each path line, which is any line that is not blank, a comment or indented. */
export function countRules(headers: string): number {
  return headers.split('\n').filter((line) => /^[^\s#]/.test(line)).length
}

/**
 * The rules for the files in dist/assets, or throws when they and the rules already in `_headers` (the text of
 * the file as it stands) are more than a `_headers` file can hold.
 */
export function immutableAssetRules(files: readonly string[], existingHeaders = ''): string {
  const existing = countRules(existingHeaders)
  if (existing + files.length > MAX_HEADER_RULES) {
    throw new Error(
      `${files.length} built assets need ${files.length} header rules beside the ${existing} already in _headers; the limit is ${MAX_HEADER_RULES}. Merge chunks or fonts.`,
    )
  }
  const rules = [...files]
    .sort()
    .map((file) => `/assets/${file}\n  Cache-Control: ${IMMUTABLE_CACHE_CONTROL}`)
  return `\n${RULES_MARKER}, one for each file in /assets (scripts/assetHeaders.ts).\n${rules.join('\n\n')}\n`
}
