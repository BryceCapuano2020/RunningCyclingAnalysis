import { scanLines } from './scanSource.mjs'

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
