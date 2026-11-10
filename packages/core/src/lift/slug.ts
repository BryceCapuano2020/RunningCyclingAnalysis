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

/**
 * Lower-case words joined by hyphens, a-z and 0-9 only, cut to the slug length with no trailing hyphen.
 * Null when nothing is left. The one slug rule: the logger's typed names and imports both use it, so a
 * name lands on the same lift either way.
 */
export function slugify(text: string): string | null {
  const slug = slugifyFull(text).slice(0, LIFT_EXERCISE_LENGTH.max).replace(/-+$/, '')
  return slug === '' ? null : slug
}
