/**
 * The one text scanner the source guards share (the ratchets in guardrails.scan.mjs and the import scan in imports.mjs). It reads
 * TypeScript or JavaScript source with no parser, so it holds across a TypeScript upgrade: a small state machine that knows
 * strings, template literals, regex literals and comments, so `"http://x"` is code and `// x` is not, and splits every line into
 * its code and its comment text. By default strings, templates and regexes are blanked to spaces in `code`, so a word inside one
 * never counts; with `{ keepStrings: true }` they stay, for a reader that wants the module names.
 */

const REGEX_AFTER = new Set([
  '',
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '<',
  '>',
  '~',
  '^',
])
const REGEX_KEYWORDS =
  /(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|void|delete|throw|yield|await)$/

/** @returns {{ code: string, comment: string }[]} one entry per source line */
export function scanLines(text, { keepStrings = false } = {}) {
  const out = []
  let code = ''
  let comment = ''
  let inBlock = false
  let tail = '' // the last non-space code character seen, to tell a regex from a division
  const templates = [] // brace depth of each open `${` inside a template literal
  let inTemplate = false
  let depth = 0
  const endLine = () => {
    out.push({ code, comment })
    code = ''
    comment = ''
  }
  const literal = (raw) => (keepStrings ? raw : ' '.repeat(raw.length))
  const pushCode = (ch) => {
    code += ch
    if (!/\s/.test(ch)) tail += ch
    if (tail.length > 40) tail = tail.slice(-40)
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (ch === '\n') {
      endLine()
      continue
    }
    if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false
        comment += '*/'
        code += ' '
        i++
      } else comment += ch
      continue
    }
    if (inTemplate) {
      if (ch === '\\') {
        code += literal(text.slice(i, i + 2))
        i++
      } else if (ch === '`') {
        inTemplate = false
        pushCode('`')
      } else if (ch === '$' && next === '{') {
        templates.push(depth)
        inTemplate = false
        code += '${'
        i++
      } else code += literal(ch)
      continue
    }
    if (ch === '/' && next === '/') {
      const end = text.indexOf('\n', i)
      const stop = end === -1 ? text.length : end
      comment += text.slice(i, stop)
      i = stop - 1
      continue
    }
    if (ch === '/' && next === '*') {
      inBlock = true
      comment += '/*'
      i++
      continue
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1
      while (j < text.length && text[j] !== ch && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1
      code += ch + literal(text.slice(i + 1, j)) + (text[j] === ch ? ch : '')
      tail += ch
      i = text[j] === ch ? j : j - 1
      continue
    }
    if (ch === '`') {
      inTemplate = true
      pushCode('`')
      continue
    }
    if (ch === '/' && (REGEX_AFTER.has(tail.slice(-1)) || REGEX_KEYWORDS.test(tail))) {
      let j = i + 1
      let inClass = false
      while (j < text.length && text[j] !== '\n') {
        if (text[j] === '\\') j++
        else if (text[j] === '[') inClass = true
        else if (text[j] === ']') inClass = false
        else if (text[j] === '/' && !inClass) break
        j++
      }
      code += '/' + literal(text.slice(i + 1, j)) + '/'
      tail = '/'
      i = text[j] === '/' ? j : j - 1
      continue
    }
    if (ch === '{') depth++
    if (ch === '}') {
      if (templates.length > 0 && templates[templates.length - 1] === depth) {
        templates.pop()
        inTemplate = true
        code += '}'
        continue
      }
      depth--
    }
    pushCode(ch)
  }
  endLine()
  return out
}

/** The source with its comments blanked and its strings kept, so a line of documentation that mentions `import (x)` is not code. */
export function withoutComments(source) {
  return scanLines(source, { keepStrings: true })
    .map(({ code }) => code)
    .join('\n')
}
