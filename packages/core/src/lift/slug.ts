import { LIFT_EXERCISE_LENGTH } from './limits'

/** The slug of the whole name, before any cut to the length limit. Empty when nothing is left. */
export function slugifyFull(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('-')
}

/** The slug an import gives an assisted lift (`assisted-pull-up`); only assistedSlug makes one. */
export const ASSISTED_PREFIX = 'assisted-'

function cut(slug: string): string | null {
  const cutSlug = slug.slice(0, LIFT_EXERCISE_LENGTH.max).replace(/-+$/, '')
  return cutSlug === '' ? null : cutSlug
}

/**
 * Lower-case words joined by hyphens, a-z and 0-9 only, cut to the slug length with no trailing hyphen.
 * Null when nothing is left. The one slug rule: the logger's typed names and imports both use it, so a
 * name lands on the same lift either way. A name that would start like an assisted lift ("Assisted dip")
 * gets `custom-` in front, so a typed name is never read as assisted; see assistedSlug.
 */
export function slugify(text: string): string | null {
  const full = slugifyFull(text)
  return cut(full.startsWith(ASSISTED_PREFIX) ? `custom-${full}` : full)
}

/** The one way to make an assisted slug: the import's "(Assisted)" lifts. Null when no name is left. */
export function assistedSlug(base: string): string | null {
  const full = slugifyFull(base)
  return full === '' ? null : cut(`${ASSISTED_PREFIX}${full}`)
}
