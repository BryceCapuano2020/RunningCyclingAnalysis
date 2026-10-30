/**
 * A small, strict XML parser for the GPX and TCX importers. Web Workers have no DOMParser.
 *
 * Supported: elements, attributes (single or double quotes), character data, CDATA, comments and
 * processing instructions (both skipped), the five predefined entities and numeric character
 * references. Element and attribute names keep their namespace prefix in `name`; `local` drops it.
 *
 * DOCTYPE is skipped and its internal subset is never interpreted. Entity declarations are not
 * expanded, so `&lol;` and any other entity that is not predefined is an XmlError. This blocks
 * billion-laughs and external-entity attacks by construction.
 *
 * A document with structure no real file has (see XmlLimits) is refused before the text is copied or
 * decoded, so a hostile file costs no more than its own bytes.
 *
 * Two entry points share one scanner. `parseXml` builds a tree. `scanXml` emits events and keeps
 * no nodes, so its memory is O(depth) plus the source string.
 */

import { decode, isNameChar, isNameStart, isSpace, localName, XmlError } from './decode'
import {
  MAX_XML_ATTRIBUTE_CHARS,
  MAX_XML_ATTRIBUTES_PER_ELEMENT,
  MAX_XML_DEPTH,
  MAX_XML_NAME_CHARS,
  MAX_XML_NODES,
  MAX_XML_SCAN_NODES,
  MAX_XML_TEXT_RUN_CHARS,
} from '../import/limits'

export { XmlError } from './decode'

export interface XmlElement {
  name: string
  local: string
  attrs: Record<string, string>
  children: XmlElement[]
  /** The element's own character data and CDATA, entity-decoded and untrimmed. */
  text: string
}

export interface XmlLimits {
  /** Maximum element nesting. The root element is depth 1. */
  maxDepth: number
  /** Maximum elements, attributes and non-blank text or CDATA runs. */
  maxNodes: number
  /** The structure limits of import/limits.ts, per element, name, text run (before decoding) and attribute value. */
  maxAttributes?: number
  maxNameChars?: number
  maxTextRunChars?: number
  maxAttributeChars?: number
}

/**
 * Receives events in document order. The scanner keeps no references to what it reports, so a
 * handler that keeps none runs in O(depth) memory. `depth` is the element nesting level, the root
 * being 1. A run of text may arrive in several calls (split at comments, processing instructions
 * and child elements), so concatenate an element's `text` calls to get its text. Throwing from a
 * handler aborts the scan.
 */
export interface XmlHandler {
  open?(local: string, name: string, attrs: Record<string, string>, depth: number): void
  /** Entity-decoded text and CDATA of the current element. */
  text?(text: string, depth: number): void
  close?(local: string, name: string, depth: number): void
}

export const DEFAULT_XML_LIMITS: Readonly<XmlLimits> = {
  maxDepth: MAX_XML_DEPTH,
  maxNodes: MAX_XML_NODES,
}

/** Streaming has no tree to hold, so only CPU bounds the work and the node limit is looser. */
export const DEFAULT_SCAN_XML_LIMITS: Readonly<XmlLimits> = {
  maxDepth: MAX_XML_DEPTH,
  maxNodes: MAX_XML_SCAN_NODES,
}

/** Decodes UTF-8 bytes (a leading BOM is dropped by the decoder). */
function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false, ignoreBOM: false }).decode(bytes)
}

/** Parses a whole document and returns its root element. Throws XmlError and nothing else. */
export function parseXml(text: string, limits: XmlLimits): XmlElement {
  const path: XmlElement[] = []
  let root: XmlElement | undefined
  scanXml(
    text,
    {
      open(local, name, attrs) {
        const element: XmlElement = { name, local, attrs, children: [], text: '' }
        const parent = path.at(-1)
        if (parent) parent.children.push(element)
        else root = element
        path.push(element)
      },
      text(chunk) {
        const current = path.at(-1)
        if (current) current.text += chunk
      },
      close() {
        path.pop()
      },
    },
    limits,
  )
  if (!root) throw new XmlError('no root element')
  return root
}

/** Parses UTF-8 bytes into a tree. See parseXml. */
export function parseXmlBytes(
  bytes: Uint8Array,
  limits: XmlLimits = DEFAULT_XML_LIMITS,
): XmlElement {
  return parseXml(decodeUtf8(bytes), limits)
}

/**
 * Scans a whole document and reports its events to `handler`. Throws XmlError and nothing else,
 * with the same checks and limits as parseXml. Limits left out take the scan defaults.
 */
export function scanXml(text: string, handler: XmlHandler, limits: Partial<XmlLimits> = {}): void {
  new Scanner(text, handler, {
    maxDepth: limits.maxDepth ?? DEFAULT_SCAN_XML_LIMITS.maxDepth,
    maxNodes: limits.maxNodes ?? DEFAULT_SCAN_XML_LIMITS.maxNodes,
    maxAttributes: limits.maxAttributes ?? MAX_XML_ATTRIBUTES_PER_ELEMENT,
    maxNameChars: limits.maxNameChars ?? MAX_XML_NAME_CHARS,
    maxTextRunChars: limits.maxTextRunChars ?? MAX_XML_TEXT_RUN_CHARS,
    maxAttributeChars: limits.maxAttributeChars ?? MAX_XML_ATTRIBUTE_CHARS,
  }).parse()
}

/** Decodes UTF-8 bytes and scans them. See scanXml. */
export function scanXmlBytes(
  bytes: Uint8Array,
  handler: XmlHandler,
  limits: Partial<XmlLimits> = {},
): void {
  scanXml(decodeUtf8(bytes), handler, limits)
}

/** An open element, kept until its end tag so the names can be matched. */
interface OpenElement {
  name: string
  local: string
}

class Scanner {
  private readonly src: string
  private readonly handler: XmlHandler
  private readonly maxDepth: number
  private readonly maxNodes: number
  private readonly maxAttributes: number
  private readonly maxNameChars: number
  private readonly maxTextRunChars: number
  private readonly maxAttributeChars: number
  private pos = 0
  private nodes = 0
  private readonly stack: OpenElement[] = []
  private rootSeen = false

  constructor(src: string, handler: XmlHandler, limits: Required<XmlLimits>) {
    this.src = src
    this.handler = handler
    this.maxDepth = limits.maxDepth
    this.maxNodes = limits.maxNodes
    this.maxAttributes = limits.maxAttributes
    this.maxNameChars = limits.maxNameChars
    this.maxTextRunChars = limits.maxTextRunChars
    this.maxAttributeChars = limits.maxAttributeChars
  }

  parse(): void {
    const src = this.src
    if (src.charCodeAt(0) === 0xfeff) this.pos = 1
    for (;;) {
      const lt = src.indexOf('<', this.pos)
      const end = lt === -1 ? src.length : lt
      if (end > this.pos) this.characters(this.pos, end)
      if (lt === -1) break
      this.pos = lt
      this.markup()
    }
    const open = this.stack.at(-1)
    if (open) throw new XmlError(`unclosed <${open.name}>`)
    if (!this.rootSeen) throw new XmlError('no root element')
  }

  /** Character data between two tags. */
  private characters(from: number, to: number): void {
    const depth = this.stack.length
    if (depth === 0) {
      if (!this.isBlank(from, to)) throw new XmlError(`text outside the root element at ${from}`)
      return
    }
    if (to - from > this.maxTextRunChars) {
      throw new XmlError(`text of more than ${this.maxTextRunChars} characters at ${from}`)
    }
    const raw = this.src.slice(from, to)
    if (raw.includes(']]>')) throw new XmlError(`']]>' in text at ${from}`)
    // Decoded before the call: an optional call skips its arguments when the callback is missing.
    const text = raw.includes('&') ? decode(raw) : raw
    this.handler.text?.(text, depth)
    if (!this.isBlank(from, to)) this.count(1)
  }

  private markup(): void {
    const next = this.src.charCodeAt(this.pos + 1)
    if (next === 0x2f) this.endTag()
    else if (next === 0x3f) this.processingInstruction()
    else if (next === 0x21) this.declaration()
    else this.startTag()
  }

  private processingInstruction(): void {
    const end = this.src.indexOf('?>', this.pos + 2)
    if (end === -1) throw new XmlError(`unterminated processing instruction at ${this.pos}`)
    this.pos = end + 2
  }

  private declaration(): void {
    const src = this.src
    if (src.startsWith('<!--', this.pos)) {
      const start = this.pos + 4
      const end = src.indexOf('-->', start)
      if (end === -1) throw new XmlError(`unterminated comment at ${this.pos}`)
      // Bounded by `end`, because every '-->' itself contains '--'.
      if (src.indexOf('--', start) < end) throw new XmlError(`'--' inside a comment at ${start}`)
      this.pos = end + 3
    } else if (src.startsWith('<![CDATA[', this.pos)) {
      this.cdata()
    } else if (src.startsWith('<!DOCTYPE', this.pos)) {
      this.doctype()
    } else {
      throw new XmlError(`unsupported markup at ${this.pos}`)
    }
  }

  private cdata(): void {
    const start = this.pos + 9
    const end = this.src.indexOf(']]>', start)
    if (end === -1) throw new XmlError(`unterminated CDATA at ${this.pos}`)
    const depth = this.stack.length
    if (depth === 0) throw new XmlError(`CDATA outside the root element at ${this.pos}`)
    if (end - start > this.maxTextRunChars) {
      throw new XmlError(`CDATA of more than ${this.maxTextRunChars} characters at ${this.pos}`)
    }
    if (end > start) this.handler.text?.(this.src.slice(start, end), depth)
    if (!this.isBlank(start, end)) this.count(1)
    this.pos = end + 3
  }

  /**
   * Skips the DOCTYPE, including any internal subset. The scan only tracks quoted literals,
   * comments and bracket depth, so a '>' inside an entity value does not end the declaration.
   * Nothing in the subset is read.
   */
  private doctype(): void {
    const src = this.src
    if (this.rootSeen) throw new XmlError(`DOCTYPE after the root element at ${this.pos}`)
    let i = this.pos + 9
    let subset = false
    while (i < src.length) {
      const c = src.charCodeAt(i)
      if (c === 0x22 || c === 0x27) {
        const close = src.indexOf(c === 0x22 ? '"' : "'", i + 1)
        if (close === -1) break
        i = close + 1
        continue
      }
      if (c === 0x3c && src.startsWith('<!--', i)) {
        const close = src.indexOf('-->', i + 4)
        if (close === -1) break
        i = close + 3
        continue
      }
      if (c === 0x5b) subset = true
      else if (c === 0x5d) subset = false
      else if (c === 0x3e && !subset) {
        this.pos = i + 1
        return
      }
      i++
    }
    throw new XmlError(`unterminated DOCTYPE at ${this.pos}`)
  }

  private startTag(): void {
    const src = this.src
    this.pos++
    const name = this.name()
    if (name === '') throw new XmlError(`expected an element name at ${this.pos}`)
    if (this.stack.length === 0 && this.rootSeen) {
      throw new XmlError(`second root element <${name}>`)
    }
    const depth = this.stack.length + 1
    if (depth > this.maxDepth) {
      throw new XmlError(`element nesting exceeds ${this.maxDepth} at <${name}>`)
    }
    this.count(1)
    this.rootSeen = true

    const attrs: Record<string, string> = {}
    let attributes = 0
    let selfClosing = false
    for (;;) {
      const spaced = this.skipSpace()
      const c = src.charCodeAt(this.pos)
      if (c === 0x3e) {
        this.pos++
        break
      }
      if (c === 0x2f) {
        if (src.charCodeAt(this.pos + 1) !== 0x3e)
          throw new XmlError(`expected '>' after '/' in <${name}>`)
        this.pos += 2
        selfClosing = true
        break
      }
      if (!spaced) throw new XmlError(`expected whitespace in <${name}> at ${this.pos}`)
      if (attributes >= this.maxAttributes) {
        throw new XmlError(`more than ${this.maxAttributes} attributes in <${name}>`)
      }
      attributes++
      const attr = this.name()
      if (attr === '') throw new XmlError(`malformed attribute in <${name}> at ${this.pos}`)
      this.skipSpace()
      if (src.charCodeAt(this.pos) !== 0x3d) throw new XmlError(`expected '=' after ${attr}`)
      this.pos++
      this.skipSpace()
      const quote = src.charCodeAt(this.pos)
      if (quote !== 0x22 && quote !== 0x27) throw new XmlError(`unquoted value for ${attr}`)
      const close = src.indexOf(quote === 0x22 ? '"' : "'", this.pos + 1)
      if (close === -1) throw new XmlError(`unterminated value for ${attr}`)
      if (close - this.pos - 1 > this.maxAttributeChars) {
        throw new XmlError(`value of ${attr} is more than ${this.maxAttributeChars} characters`)
      }
      const raw = src.slice(this.pos + 1, close)
      if (raw.includes('<')) throw new XmlError(`'<' in the value of ${attr}`)
      if (Object.hasOwn(attrs, attr)) throw new XmlError(`duplicate attribute ${attr} in <${name}>`)
      attrs[attr] = raw.includes('&') ? decode(raw) : raw
      this.count(1)
      this.pos = close + 1
    }

    const local = localName(name)
    this.handler.open?.(local, name, attrs, depth)
    if (selfClosing) this.handler.close?.(local, name, depth)
    else this.stack.push({ name, local })
  }

  private endTag(): void {
    this.pos += 2
    const name = this.name()
    this.skipSpace()
    if (this.src.charCodeAt(this.pos) !== 0x3e)
      throw new XmlError(`malformed </${name}> at ${this.pos}`)
    const depth = this.stack.length
    const open = this.stack.pop()
    if (!open) throw new XmlError(`unexpected </${name}>`)
    if (open.name !== name) throw new XmlError(`</${name}> closes <${open.name}>`)
    this.pos++
    this.handler.close?.(open.local, name, depth)
  }

  /** Reads a name at the current position and returns it, or '' if there is none. */
  private name(): string {
    const src = this.src
    const start = this.pos
    if (start >= src.length || !isNameStart(src.charCodeAt(start))) return ''
    let i = start + 1
    while (i < src.length && i - start <= this.maxNameChars && isNameChar(src.charCodeAt(i))) i++
    if (i - start > this.maxNameChars) {
      throw new XmlError(`a name of more than ${this.maxNameChars} characters at ${start}`)
    }
    this.pos = i
    return src.slice(start, i)
  }

  /** Skips XML whitespace and reports whether any was skipped. */
  private skipSpace(): boolean {
    const start = this.pos
    while (isSpace(this.src.charCodeAt(this.pos))) this.pos++
    return this.pos > start
  }

  private isBlank(from: number, to: number): boolean {
    for (let i = from; i < to; i++) {
      if (!isSpace(this.src.charCodeAt(i))) return false
    }
    return true
  }

  /** Counts a node as it is created, so the limit stops the scan early. */
  private count(n: number): void {
    this.nodes += n
    if (this.nodes > this.maxNodes) throw new XmlError(`more than ${this.maxNodes} nodes`)
  }
}
