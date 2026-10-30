/** Characters and entities of XML text, shared by the scanner. */

export class XmlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'XmlError'
  }
}

const PREDEFINED = new Map([
  ['lt', '<'],
  ['gt', '>'],
  ['amp', '&'],
  ['quot', '"'],
  ['apos', "'"],
])

export function isSpace(c: number): boolean {
  return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d
}

export function isNameStart(c: number): boolean {
  return (
    (c >= 0x61 && c <= 0x7a) || (c >= 0x41 && c <= 0x5a) || c === 0x5f || c === 0x3a || c >= 0x80
  )
}

export function isNameChar(c: number): boolean {
  return isNameStart(c) || (c >= 0x30 && c <= 0x39) || c === 0x2d || c === 0x2e
}

function isDigit(c: number, hex: boolean): boolean {
  if (c >= 0x30 && c <= 0x39) return true
  return hex && ((c >= 0x61 && c <= 0x66) || (c >= 0x41 && c <= 0x46))
}

/** The XML 1.0 Char production: the code points a character reference may name. */
function isXmlChar(code: number): boolean {
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  )
}

/** The part of a name before any namespace prefix. */
export function localName(name: string): string {
  return name.slice(name.lastIndexOf(':') + 1)
}

/**
 * Replaces the predefined entities and character references in `raw`. Every scan is bounded by a
 * short window, so the work stays linear even for a run of stray '&' characters.
 */
export function decode(raw: string): string {
  // Pieces are joined once at the end: a long run of references would otherwise grow a string of
  // as many concatenation nodes as there are references.
  const parts: string[] = []
  let from = 0
  let amp = raw.indexOf('&')
  while (amp !== -1) {
    parts.push(raw.slice(from, amp))
    let i = amp + 1
    let decoded: string
    if (raw.charCodeAt(i) === 0x23) {
      const hex = raw.charCodeAt(i + 1) === 0x78
      const digits = hex ? i + 2 : i + 1
      i = digits
      while (i < raw.length && i - digits <= 8 && isDigit(raw.charCodeAt(i), hex)) i++
      if (i === digits || raw.charCodeAt(i) !== 0x3b) {
        throw new XmlError(`malformed character reference at ${amp}`)
      }
      const code = parseInt(raw.slice(digits, i), hex ? 16 : 10)
      if (!isXmlChar(code)) {
        throw new XmlError(`character reference at ${amp} is outside the XML character range`)
      }
      decoded = String.fromCodePoint(code)
    } else {
      const nameStart = i
      while (i < raw.length && i - nameStart < 16 && isNameChar(raw.charCodeAt(i))) i++
      const name = raw.slice(nameStart, i)
      if (name === '' || raw.charCodeAt(i) !== 0x3b) {
        throw new XmlError(`malformed entity reference at ${amp}`)
      }
      const value = PREDEFINED.get(name)
      if (value === undefined) throw new XmlError(`unknown entity &${name};`)
      decoded = value
    }
    parts.push(decoded)
    from = i + 1
    amp = raw.indexOf('&', from)
  }
  parts.push(raw.slice(from))
  return parts.join('')
}
