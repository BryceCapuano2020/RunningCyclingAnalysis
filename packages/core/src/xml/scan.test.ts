import { describe, expect, it } from 'vitest'
import { DEFAULT_SCAN_XML_LIMITS, XmlError, scanXml, scanXmlBytes } from './parse'

/** The trackpoint events of a scan, in order, as readable strings. */
function events(text: string): string[] {
  const out: string[] = []
  scanXml(text, {
    open: (_local, name, attrs, depth) =>
      out.push(`open ${name} ${JSON.stringify(attrs)} ${depth}`),
    text: (chunk, depth) => out.push(`text ${JSON.stringify(chunk)} ${depth}`),
    close: (_local, name, depth) => out.push(`close ${name} ${depth}`),
  })
  return out
}

describe('scanXml events', () => {
  it('emits open, text and close in document order, with depth and attributes', () => {
    expect(events('<a x="1">t<b>u</b><c/>v</a>')).toEqual([
      'open a {"x":"1"} 1',
      'text "t" 1',
      'open b {} 2',
      'text "u" 2',
      'close b 2',
      'open c {} 2',
      'close c 2',
      'text "v" 1',
      'close a 1',
    ])
  })

  it('reports the local name, decoded text and CDATA, and drops nothing before the root', () => {
    const out: string[] = []
    scanXml('<?xml version="1.0"?><!-- c --><p:a>&lt;<![CDATA[x]]></p:a>', {
      open: (local, name) => out.push(`open ${local} ${name}`),
      text: (chunk) => out.push(`text ${chunk}`),
      close: (local) => out.push(`close ${local}`),
    })
    expect(out).toEqual(['open a p:a', 'text <', 'text x', 'close a'])
  })

  it('accepts a handler with no callbacks', () => {
    expect(() => scanXml('<a><b>t</b></a>', {})).not.toThrow()
  })

  it('still rejects a bad entity when the handler has no text callback', () => {
    expect(() => scanXml('<a>&--lt;</a>', {})).toThrow(XmlError)
    expect(() => scanXml('<a>&lol;</a>', { open: () => undefined })).toThrow(XmlError)
  })

  it('reports whitespace-only text to the handler, as parseXml keeps it', () => {
    expect(events('<a>\n <b/>\n</a>')).toContain('text "\\n " 1')
  })

  it('throws XmlError when there is no root element', () => {
    expect(() => scanXml('  \n', {})).toThrow(XmlError)
  })
})

describe('scanXml close-tag checking', () => {
  it.each([
    ['a mismatched end tag', '<a><b></a>'],
    ['a stray end tag', '</a>'],
    ['a prefixed end tag that differs', '<p:a></a>'],
    ['an end tag with another prefix', '<p:a></q:a>'],
    ['an unclosed element', '<a><b/>'],
  ])('throws XmlError for %s', (_, text) => {
    expect(() => scanXml(text, {})).toThrow(XmlError)
  })

  it('names the element the end tag closes', () => {
    expect(() => scanXml('<a><b></a>', {})).toThrow('</a> closes <b>')
  })
})

describe('scanXml limits', () => {
  it('accepts nesting up to maxDepth and rejects one level deeper', () => {
    const limits = { maxDepth: 3 }
    expect(() => scanXml('<a><b><c/></b></a>', {}, limits)).not.toThrow()
    expect(() => scanXml('<a><b><c><d/></c></b></a>', {}, limits)).toThrow(/nesting exceeds 3/)
  })

  it('stops a very deep document at the default depth limit without recursing', () => {
    expect(() => scanXml('<a>'.repeat(100_000), {})).toThrow(/nesting exceeds 64/)
  })

  it('counts elements, attributes and non-blank text toward maxNodes', () => {
    const doc = '<a><b/><c/><d/></a>'
    expect(() => scanXml(doc, {}, { maxNodes: 4 })).not.toThrow()
    expect(() => scanXml(doc, {}, { maxNodes: 3 })).toThrow(/more than 3 nodes/)
    expect(() => scanXml('<a x="1" y="2"/>', {}, { maxNodes: 2 })).toThrow(XmlError)
    expect(() => scanXml('<a>t</a>', {}, { maxNodes: 1 })).toThrow(XmlError)
    expect(() => scanXml('<a>  \n </a>', {}, { maxNodes: 1 })).not.toThrow()
  })

  it('stops a flood of elements at an explicit node limit', () => {
    const doc = '<r>' + '<x/>'.repeat(1_000_000) + '</r>'
    expect(() => scanXml(doc, {}, { maxNodes: 1000 })).toThrow(/more than 1000 nodes/)
  })

  it('uses 20,000,000 nodes and 64 levels by default', () => {
    expect(DEFAULT_SCAN_XML_LIMITS).toEqual({ maxDepth: 64, maxNodes: 20_000_000 })
  })
})

describe('scanXmlBytes', () => {
  it('decodes UTF-8 and strips a byte order mark', () => {
    const body = new TextEncoder().encode('<a>é€\u{1F600}</a>')
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...body])
    const text: string[] = []
    scanXmlBytes(bytes, { text: (chunk) => text.push(chunk) })
    expect(text.join('')).toBe('é€\u{1F600}')
  })

  it('throws XmlError on malformed input', () => {
    expect(() => scanXmlBytes(new TextEncoder().encode('<a><b></a>'), {})).toThrow(XmlError)
  })
})
