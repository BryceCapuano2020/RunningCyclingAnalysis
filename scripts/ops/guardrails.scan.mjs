/**
 * Reads TypeScript or JavaScript source as text and splits every line into its code and its comment text. No parser: a small
 * state machine that knows strings, template literals, regex literals and comments, so `"http://x"` is code and `// x` is not.
 * Strings, templates and regexes are blanked to spaces in `code`, so a word inside one never counts.
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
export function scanLines(text) {
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
        i++
      } else comment += ch
      continue
    }
    if (inTemplate) {
      if (ch === '\\') {
        code += '  '
        i++
      } else if (ch === '`') {
        inTemplate = false
        pushCode('`')
      } else if (ch === '$' && next === '{') {
        templates.push(depth)
        inTemplate = false
        code += '${'
        i++
      } else code += ' '
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
      code += ch + ' '.repeat(Math.max(0, j - i - 1)) + (text[j] === ch ? ch : '')
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
      code += '/' + ' '.repeat(Math.max(0, j - i - 1)) + '/'
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

/** The comment text with its markers removed: line slashes, the block opener and closer, and a leading star. */
export function commentBody(comment) {
  return comment
    .replace(/^\s*\/\/\/?/, '')
    .replace(/^\s*\/\*+/, '')
    .replace(/\*+\/\s*$/, '')
    .replace(/^\s*\*+\s?/, '')
    .trim()
}

/** Lines that are only a comment (JSX braces around it allowed), minus citations (`source:`) and `/// <reference` directives. */
export function commentLineCount(text) {
  let count = 0
  for (const { code, comment } of scanLines(text)) {
    if (comment.trim() === '' || code.replace(/[\s{}]/g, '') !== '') continue
    if (/^\s*\/\/\/\s*<reference/.test(comment)) continue
    if (/^source:/.test(commentBody(comment))) continue
    count++
  }
  return count
}

const countMatches = (lines, pattern) =>
  lines.reduce((n, { code }) => n + (code.match(pattern) ?? []).length, 0)

export const countEffects = (text) => countMatches(scanLines(text), /\buse(?:Layout)?Effect\s*\(/g)

export const countTimers = (text) =>
  countMatches(
    scanLines(text),
    /\b(?:setTimeout|setInterval|requestAnimationFrame|requestIdleCallback|queueMicrotask)\s*\(/g,
  )

/** Compiler directives live in comments; the casts live in code. */
export function countTypeEscapes(text) {
  const lines = scanLines(text)
  const directives = lines.reduce(
    (n, { comment }) => n + (comment.match(/@ts-(?:ignore|expect-error)\b/g) ?? []).length,
    0,
  )
  return (
    directives +
    countMatches(lines, /\bas\s+any\b/g) +
    countMatches(lines, /\bas\s+unknown\s+as\b/g)
  )
}
