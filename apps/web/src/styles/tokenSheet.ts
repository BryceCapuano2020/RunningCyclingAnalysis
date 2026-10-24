/** Reads the custom properties and declarations of the stylesheets, for the token tests. */

export type Tokens = Map<string, string>

/** The custom properties declared in the first block that opens with `selector`. */
export function declared(css: string, selector: string): Tokens {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no ${selector} block in tokens.css`)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  const tokens: Tokens = new Map()
  for (const match of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match
    if (name !== undefined && value !== undefined) tokens.set(name, value.trim().toLowerCase())
  }
  return tokens
}

/** The same tokens with each var(--name) replaced by the value that name resolves to. */
export function resolved(tokens: Tokens): Tokens {
  const expand = (value: string, seen: string[]): string =>
    value.replace(/var\(--([a-z0-9-]+)\)/g, (_match: string, name: string) => {
      const next = tokens.get(name)
      if (next === undefined || seen.includes(name)) throw new Error(`--${name} does not resolve`)
      return expand(next, [...seen, name])
    })
  return new Map(
    [...tokens].map(([name, value]): [string, string] => [name, expand(value, [name])]),
  )
}

export function colour(tokens: Tokens, name: string): string {
  const value = tokens.get(name)
  if (value === undefined || !/^#[0-9a-f]{6}$/.test(value)) {
    throw new Error(`--${name} is not an opaque hex colour`)
  }
  return value
}

/** The declarations of the rule whose selector is exactly this, as property to value. */
export function declarations(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no ${selector} rule in the stylesheet`)
  if (css.indexOf(`${selector} {`, start + 1) >= 0) throw new Error(`${selector} is declared twice`)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  const found = new Map<string, string>()
  for (const match of body.matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)) {
    const [, property, value] = match
    if (property !== undefined && value !== undefined) {
      found.set(property, value.trim().toLowerCase())
    }
  }
  return found
}
