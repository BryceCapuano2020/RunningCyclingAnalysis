/**
 * The `_headers` rules that make the built assets cacheable for a year.
 *
 * A pattern such as `/assets/*` would match a missing file as well as a real one, and Workers Static Assets
 * applies a rule by the path asked for, so the 404 page served for a missing asset would be told to be cached
 * for a year too. One rule per emitted file matches only files that exist: a missing path gets none.
 */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

/** Workers Static Assets allows 100 header rules in all; the file's own rules keep a few of them. */
export const MAX_ASSET_RULES = 90

/** Marks the block the build appends, so a second run replaces nothing and adds nothing twice. */
export const RULES_MARKER = '# Cache rules written by the build'

/** The rules for the files in dist/assets, or throws when there are more than a `_headers` file can hold. */
export function immutableAssetRules(files: readonly string[]): string {
  if (files.length > MAX_ASSET_RULES) {
    throw new Error(
      `${files.length} built assets need ${files.length} header rules; the limit is ${MAX_ASSET_RULES}. Merge chunks or fonts.`,
    )
  }
  const rules = [...files]
    .sort()
    .map((file) => `/assets/${file}\n  Cache-Control: ${IMMUTABLE_CACHE_CONTROL}`)
  return `\n${RULES_MARKER}, one for each file in /assets (scripts/assetHeaders.ts).\n${rules.join('\n\n')}\n`
}
