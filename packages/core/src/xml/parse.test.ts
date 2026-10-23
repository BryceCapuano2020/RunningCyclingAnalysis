import { describe, expect, it } from 'vitest'
import { DEFAULT_XML_LIMITS, XmlError, parseXml, parseXmlBytes } from './parse'
import type { XmlLimits } from './parse'

const parse = (text: string, limits: XmlLimits = DEFAULT_XML_LIMITS) => parseXml(text, limits)

/** The GPX namespace declarations a real Garmin export carries. */
const GPX_OPEN =
  '<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1" ' +
  'xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">'

describe('parseXml structure', () => {
  it('builds the element tree with names, attributes, children and text', () => {
    expect(parse('<a x="1"><b>t</b><c/></a>')).toEqual({
      name: 'a',
      local: 'a',
      attrs: { x: '1' },
      text: '',
      children: [
        { name: 'b', local: 'b', attrs: {}, text: 't', children: [] },
        { name: 'c', local: 'c', attrs: {}, text: '', children: [] },
      ],
    })
  })

  it('accepts single and double quoted attribute values', () => {
    const root = parse(`<a one='1' two="it's" three = "3" />`)
    expect(root.attrs).toEqual({ one: '1', two: "it's", three: '3' })
  })

  it('keeps text as the element own text, untrimmed, without its children text', () => {
    const root = parse('<a>\n  <b>x</b> y \n</a>')
    expect(root.text).toBe('\n   y \n')
    expect(root.children[0]!.text).toBe('x')
  })

  it('concatenates text on both sides of a comment or processing instruction', () => {
    const root = parse('<a>x<!-- mid -->y<?pi data?>z</a>')
    expect(root.text).toBe('xyz')
    expect(root.children).toEqual([])
  })
})

describe('entities and character references', () => {
  it('decodes the five predefined entities in text and attributes', () => {
    const root = parse(`<a t="&lt;&amp;&quot;&apos;&gt;">&lt;b&gt; &amp;</a>`)
    expect(root.attrs.t).toBe(`<&"'>`)
    expect(root.text).toBe('<b> &')
  })

  it('decodes decimal and hexadecimal character references, including astral code points', () => {
    expect(parse('<a>&#65;&#x42;&#x1F600;&#x9;</a>').text).toBe('AB\u{1F600}\t')
    expect(parse('<a v="&#x20AC;"/>').attrs.v).toBe('€')
  })

  it.each([
    ['above the Unicode range', '<a>&#x110000;</a>'],
    ['above the Unicode range in decimal', '<a>&#1114112;</a>'],
    ['zero', '<a>&#0;</a>'],
    ['a surrogate', '<a>&#xD800;</a>'],
    ['a control character', '<a>&#x1;</a>'],
    ['an empty decimal reference', '<a>&#;</a>'],
    ['an empty hexadecimal reference', '<a>&#x;</a>'],
    ['a non-digit reference', '<a>&#xZZ;</a>'],
    ['a reference without a semicolon', '<a>&#65</a>'],
    ['an over-long reference', '<a>&#0000000000065;</a>'],
  ])('rejects a character reference %s', (_, text) => {
    expect(() => parse(text)).toThrow(XmlError)
  })

  it.each([
    ['a custom entity', '<a>&lol;</a>'],
    ['an HTML entity', '<a>&nbsp;</a>'],
    ['a prototype name', '<a>&constructor;</a>'],
    ['a bare ampersand', '<a>Tom & Jerry</a>'],
    ['an entity without a semicolon', '<a>&amp</a>'],
    ['an empty entity name', '<a>&;</a>'],
    ['a custom entity in an attribute', '<a v="&lol;"/>'],
  ])('rejects %s', (_, text) => {
    expect(() => parse(text)).toThrow(XmlError)
  })
})

describe('CDATA, comments and processing instructions', () => {
  it('keeps CDATA content literal and adds it to the element text', () => {
    const root = parse('<a><![CDATA[1 < 2 && &amp; <b>]]></a>')
    expect(root.text).toBe('1 < 2 && &amp; <b>')
    expect(root.children).toEqual([])
  })

  it('joins text and CDATA in document order', () => {
    expect(parse('<a>x<![CDATA[y]]>z</a>').text).toBe('xyz')
    expect(parse('<a><![CDATA[a]b]]></a>').text).toBe('a]b')
    expect(parse('<a><![CDATA[]]></a>').text).toBe('')
  })

  it('skips the XML declaration, comments and processing instructions around the root', () => {
    const root = parse('<?xml version="1.0"?>\n<!-- head --><a>x</a><!-- tail --><?done?>')
    expect(root.name).toBe('a')
    expect(root.text).toBe('x')
  })

  it('accepts a leading byte order mark in the text', () => {
    expect(parse('﻿<a/>').name).toBe('a')
  })
})

describe('namespaces', () => {
  it('keeps prefixed names and exposes the local name', () => {
    const root = parse(
      `${GPX_OPEN}<trk><gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr>` +
        '</gpxtpx:TrackPointExtension></trk></gpx>',
    )
    expect(root.attrs['xmlns:gpxtpx']).toBe(
      'http://www.garmin.com/xmlschemas/TrackPointExtension/v1',
    )
    const extension = root.children[0]!.children[0]!
    expect(extension.name).toBe('gpxtpx:TrackPointExtension')
    expect(extension.local).toBe('TrackPointExtension')
    expect(extension.children[0]!.local).toBe('hr')
    expect(extension.children[0]!.text).toBe('140')
  })
})

describe('DOCTYPE', () => {
  it('is skipped, and its entity declarations are never expanded', () => {
    expect(() => parse('<!DOCTYPE gpx [<!ENTITY lol "lol">]><gpx>&lol;</gpx>')).toThrow(XmlError)
  })

  it('does not treat a > inside an entity value as the end of the declaration', () => {
    const root = parse(`<!DOCTYPE gpx [<!ENTITY e "a>b">]><gpx>x</gpx>`)
    expect(root.name).toBe('gpx')
    expect(root.text).toBe('x')
  })

  it('skips a comment in the internal subset, even one with an apostrophe', () => {
    const root = parse(`<!DOCTYPE g [<!-- don't --><!ENTITY e "v">]><g>x</g>`)
    expect(root.text).toBe('x')
  })

  it('does not fetch external entities', () => {
    const xxe = '<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><x>&xxe;</x>'
    expect(() => parse(xxe)).toThrow(XmlError)
  })

  it('rejects a DOCTYPE after the root element', () => {
    expect(() => parse('<a/><!DOCTYPE a>')).toThrow(XmlError)
  })
})

describe('malformed input', () => {
  it.each([
    ['an empty document', ''],
    ['whitespace only', '   \n'],
    ['an unclosed element', '<a>'],
    ['a mismatched end tag', '<a><b></a>'],
    ['a stray end tag', '</a>'],
    ['a second root element', '<a></a><b></b>'],
    ['text after the root', '<a/>tail'],
    ['text before the root', 'text<a/>'],
    ['a duplicate attribute', '<a b="1" b="2"/>'],
    ['an unquoted attribute value', '<a b=1/>'],
    ['an unterminated attribute value', '<a b="1/>'],
    ['a < inside an attribute value', '<a b="<"/>'],
    ['an attribute without whitespace before it', '<a b="1"c="2"/>'],
    ['a stray < in text', '<a>a < b</a>'],
    ['a name that starts with a digit', '<1a/>'],
    ['a comment with a double hyphen', '<a><!-- x -- y --></a>'],
    ['an unterminated comment', '<a><!-- open</a>'],
    ['an unterminated CDATA section', '<a><![CDATA[open</a>'],
    ['CDATA outside the root', '<![CDATA[x]]><a/>'],
    [']]> in text', '<a>]]></a>'],
    ['an unterminated processing instruction', '<a><?pi open</a>'],
    ['an unsupported declaration', '<a><!ELEMENT x></a>'],
    ['a truncated start tag', '<a'],
    ['a truncated empty element', '<a/'],
    ['a lone <', '<'],
    ['an unterminated DOCTYPE', '<!DOCTYPE a'],
    ['an unterminated DOCTYPE literal', '<!DOCTYPE a "open'],
  ])('throws XmlError for %s', (_, text) => {
    expect(() => parse(text)).toThrow(XmlError)
  })

  it('throws XmlError, not a RangeError, for a truncated document', () => {
    const text = GPX_OPEN + '<trk><trkseg><trkpt lat="1" lon="2"><ele>3'
    expect(() => parse(text)).toThrow(XmlError)
  })
})

describe('limits', () => {
  it('accepts nesting up to maxDepth and rejects one level deeper', () => {
    const limits = { maxDepth: 3, maxNodes: 100 }
    expect(parse('<a><b><c/></b></a>', limits).name).toBe('a')
    expect(() => parse('<a><b><c><d/></c></b></a>', limits)).toThrow(XmlError)
  })

  it('stops a very deep document at the depth limit without recursing', () => {
    expect(() => parse('<a>'.repeat(100_000))).toThrow(/nesting exceeds 64/)
  })

  it('counts elements, attributes and non-blank text toward maxNodes', () => {
    const doc = '<a><b/><c/><d/></a>'
    expect(parse(doc, { maxDepth: 64, maxNodes: 4 }).children).toHaveLength(3)
    expect(() => parse(doc, { maxDepth: 64, maxNodes: 3 })).toThrow(XmlError)
    expect(() => parse('<a x="1" y="2"/>', { maxDepth: 64, maxNodes: 2 })).toThrow(XmlError)
    expect(() => parse('<a>t</a>', { maxDepth: 64, maxNodes: 1 })).toThrow(XmlError)
    expect(parse('<a>  \n </a>', { maxDepth: 64, maxNodes: 1 }).text).toBe('  \n ')
  })

  it('stops a flood of elements at the node limit', () => {
    const doc = '<r>' + '<x/>'.repeat(1_000_000) + '</r>'
    expect(() => parse(doc, { maxDepth: 64, maxNodes: 1000 })).toThrow(/more than 1000 nodes/)
  })
})

describe('parseXmlBytes', () => {
  it('decodes UTF-8 text', () => {
    const bytes = new TextEncoder().encode('<a>é€\u{1F600}</a>')
    expect(parseXmlBytes(bytes).text).toBe('é€\u{1F600}')
  })

  it('strips a UTF-8 byte order mark', () => {
    const body = new TextEncoder().encode('<a>x</a>')
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...body])
    expect(parseXmlBytes(bytes).text).toBe('x')
  })

  it('replaces invalid UTF-8 rather than throwing', () => {
    const bytes = new Uint8Array([0x3c, 0x61, 0x3e, 0xff, 0x3c, 0x2f, 0x61, 0x3e])
    expect(parseXmlBytes(bytes).text).toBe('�')
  })

  it('applies the default limits when none are given', () => {
    expect(() => parseXmlBytes(new TextEncoder().encode('<a>'.repeat(100)))).toThrow(XmlError)
  })
})

describe('DEFAULT_XML_LIMITS', () => {
  it('allows 64 levels and 3,000,000 nodes', () => {
    expect(DEFAULT_XML_LIMITS).toEqual({ maxDepth: 64, maxNodes: 3_000_000 })
  })
})
