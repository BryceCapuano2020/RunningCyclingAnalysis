import { describe, expect, it } from 'vitest'
import {
  DEFAULT_XML_LIMITS,
  XmlError,
  parseXml,
  parseXmlBytes,
  scanXml,
  scanXmlBytes,
} from './parse'
import type { XmlElement, XmlHandler, XmlLimits } from './parse'

const FILES = 4000

/** Fragments that stress the scanner: markup openers, entities, quotes and stray delimiters. */
const TOKENS = [
  '<!DOCTYPE',
  '<![CDATA[',
  ']]>',
  '&#x',
  '&#0;',
  '&lt;',
  '&lol;',
  '&',
  '<!--',
  '-->',
  '--',
  '</',
  '/>',
  '<?',
  '?>',
  '"',
  "'",
  '[',
  ']',
  '<',
  '>',
  '=',
  ':',
  ' ',
  '\n',
]

/** A seeded PRNG (mulberry32): the same mutations on every run. */
function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Well-formed documents of several shapes, for the mutations to start from. */
function baseDocuments(): string[] {
  const points = Array.from(
    { length: 20 },
    (_, i) =>
      `<trkpt lat="51.5${i}" lon="-0.12"><ele>${10 + i}</ele>` +
      `<time>2025-05-01T07:${String(i).padStart(2, '0')}:00Z</time>` +
      '<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>141</gpxtpx:hr>' +
      '</gpxtpx:TrackPointExtension></extensions></trkpt>',
  ).join('\n')
  const gpx =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE gpx [<!ENTITY note "Morning &amp; easy">]>\n' +
    '<!-- exported by the fuzz test -->\n' +
    '<gpx version="1.1" creator="fuzz" xmlns="http://www.topografix.com/GPX/1/1" ' +
    'xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">\n' +
    '<metadata><name>&amp;lt;run&#x20;1&gt;</name></metadata>\n' +
    '<trk><name><![CDATA[Long <run> & ride]]></name><type>running</type>\n' +
    `<trkseg>\n${points}\n</trkseg></trk></gpx>\n`
  const tcx =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<TrainingCenterDatabase xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">' +
    '<Activities><Activity Sport="Biking"><Id>2025-05-01T07:00:00Z</Id>' +
    '<Lap StartTime="2025-05-01T07:00:00Z"><TotalTimeSeconds>600</TotalTimeSeconds>' +
    '<Track><Trackpoint><Time>2025-05-01T07:00:00Z</Time><DistanceMeters>0</DistanceMeters>' +
    '<HeartRateBpm><Value>120</Value></HeartRateBpm>' +
    '<Extensions><ns3:TPX><ns3:Watts>210</ns3:Watts></ns3:TPX></Extensions>' +
    '</Trackpoint></Track></Lap></Activity></Activities></TrainingCenterDatabase>\n'
  return [gpx, tcx, '<a x="1" y=\'2\'><b>&lt;&#x41;</b><c/><![CDATA[z]]></a>']
}

/** One mutation of a document: character edits, a token insert, truncation or a chunk copy. */
function mutateText(text: string, rng: () => number): string {
  const pick = (n: number) => Math.floor(rng() * n)
  const kind = pick(6)
  if (kind === 0) {
    let out = text
    for (let k = 1 + pick(8); k > 0 && out.length > 0; k--) {
      const at = pick(out.length)
      const ch = rng() < 0.7 ? TOKENS[pick(TOKENS.length)]! : String.fromCharCode(pick(0x80))
      out = out.slice(0, at) + ch + out.slice(at + 1)
    }
    return out
  }
  if (kind === 1) return text.slice(0, pick(text.length + 1))
  if (kind === 2) {
    const from = pick(text.length)
    const length = 1 + pick(Math.min(512, text.length - from))
    const at = pick(text.length)
    const chunk = text.slice(from, from + length)
    return text.slice(0, at) + chunk + chunk + text.slice(at)
  }
  if (kind === 3) {
    const from = pick(text.length)
    const length = 1 + pick(Math.min(64, text.length - from))
    return text.slice(0, from) + text.slice(from + length)
  }
  const at = pick(text.length + 1)
  return text.slice(0, at) + TOKENS[pick(TOKENS.length)]! + text.slice(at)
}

/** Byte-level damage: flipped bits and random bytes, which can also break the UTF-8. */
function mutateBytes(bytes: Uint8Array, rng: () => number): Uint8Array {
  const pick = (n: number) => Math.floor(rng() * n)
  const out = bytes.slice()
  for (let k = 1 + pick(8); k > 0; k--) {
    const at = pick(out.length)
    out[at] = rng() < 0.5 ? out[at]! ^ (1 << pick(8)) : pick(256)
  }
  return out
}

/** The shape every accepted tree must have, whatever the input was. */
function wellFormed(root: XmlElement): string[] {
  const problems: string[] = []
  const stack: { node: XmlElement; depth: number }[] = [{ node: root, depth: 1 }]
  for (let item = stack.pop(); item; item = stack.pop()) {
    const { node, depth } = item
    if (depth > DEFAULT_XML_LIMITS.maxDepth) problems.push(`depth ${depth} is over the limit`)
    if (node.name === '' || node.local === '') problems.push('empty element name')
    if (node.local !== node.name.slice(node.name.lastIndexOf(':') + 1)) {
      problems.push(`local ${node.local} does not match ${node.name}`)
    }
    if (typeof node.text !== 'string') problems.push(`text of ${node.name} is not a string`)
    for (const value of Object.values(node.attrs)) {
      if (typeof value !== 'string') problems.push(`attribute of ${node.name} is not a string`)
    }
    for (const child of node.children) stack.push({ node: child, depth: depth + 1 })
  }
  return problems
}

// The input count is fixed, so the timeout only guards against a hang; coverage
// instrumentation on a shared CI runner can take several times the local run.
describe('parseXml under mutation', { timeout: 60_000 }, () => {
  it('either parses or throws XmlError, never any other error', () => {
    const rng = random(0x5eed)
    const bases = baseDocuments()
    const broken: string[] = []
    let accepted = 0
    let rejected = 0
    for (let i = 0; i < FILES; i++) {
      const base = bases[Math.floor(rng() * bases.length)]!
      const byBytes = i % 3 === 0
      try {
        const root = byBytes
          ? parseXmlBytes(mutateBytes(new TextEncoder().encode(base), rng))
          : parseXml(mutateText(base, rng), DEFAULT_XML_LIMITS)
        const problems = wellFormed(root)
        if (problems.length > 0) broken.push(`file ${i}: ${problems[0]}`)
        accepted++
      } catch (error) {
        if (error instanceof XmlError) rejected++
        else broken.push(`file ${i}: ${String(error)}`)
      }
    }
    expect(broken).toEqual([])
    // Most mutations break the document, but some damage lands harmlessly.
    expect(accepted).toBeGreaterThan(0)
    expect(rejected).toBeGreaterThan(0)
  })

  it('throws only XmlError for random markup-heavy input', () => {
    const rng = random(0xbeef)
    const broken: string[] = []
    for (let i = 0; i < 2000; i++) {
      let text = ''
      for (let k = 1 + Math.floor(rng() * 40); k > 0; k--) {
        text += TOKENS[Math.floor(rng() * TOKENS.length)]!
      }
      try {
        parseXml(text, DEFAULT_XML_LIMITS)
      } catch (error) {
        if (!(error instanceof XmlError)) broken.push(`input ${i}: ${String(error)}`)
      }
    }
    expect(broken).toEqual([])
  })
})

/** 'ok' when `run` returns, 'XmlError' for the expected failure, anything else as a problem. */
function parseOutcome(run: () => unknown): string {
  try {
    run()
    return 'ok'
  } catch (error) {
    return error instanceof XmlError ? 'XmlError' : `other: ${String(error)}`
  }
}

/** Like parseOutcome for a scan, and also requires every open to have a matching close. */
function scanOutcome(run: (handler: XmlHandler) => void): string {
  let opens = 0
  let closes = 0
  try {
    run({
      open: () => {
        opens++
      },
      close: () => {
        closes++
      },
    })
  } catch (error) {
    return error instanceof XmlError ? 'XmlError' : `other: ${String(error)}`
  }
  return opens === closes ? 'ok' : `unbalanced ${opens} opens, ${closes} closes`
}

// The input count is fixed, so the timeout only guards against a hang; coverage
// instrumentation on a shared CI runner can take several times the local run.
describe('scanXml agrees with parseXml', { timeout: 60_000 }, () => {
  it('both succeed or both throw XmlError on every mutated input and limit', () => {
    const rng = random(0xa9ee)
    const bases = baseDocuments()
    const disagree: string[] = []
    for (let i = 0; i < FILES; i++) {
      const base = bases[Math.floor(rng() * bases.length)]!
      const byBytes = i % 3 === 0
      // Half the cases use the defaults, half tiny limits that hit the depth and node checks.
      const limits: XmlLimits =
        i % 2 === 0
          ? DEFAULT_XML_LIMITS
          : {
              maxDepth: 1 + Math.floor(rng() * 6),
              maxNodes: Math.floor(rng() * 60),
            }
      if (byBytes) {
        const bytes = mutateBytes(new TextEncoder().encode(base), rng)
        const parsed = parseOutcome(() => parseXmlBytes(bytes, limits))
        const scanned = scanOutcome((handler) => scanXmlBytes(bytes, handler, limits))
        if (parsed !== scanned) disagree.push(`bytes ${i}: parse ${parsed}, scan ${scanned}`)
      } else {
        const text = mutateText(base, rng)
        const parsed = parseOutcome(() => parseXml(text, limits))
        const scanned = scanOutcome((handler) => scanXml(text, handler, limits))
        if (parsed !== scanned) {
          disagree.push(`text ${i}: parse ${parsed}, scan ${scanned}`)
        }
      }
    }
    expect(disagree).toEqual([])
  })

  it('both succeed or both throw XmlError on random markup-heavy input', () => {
    const rng = random(0xcafe)
    const disagree: string[] = []
    for (let i = 0; i < 2000; i++) {
      let text = ''
      for (let k = 1 + Math.floor(rng() * 40); k > 0; k--) {
        text += TOKENS[Math.floor(rng() * TOKENS.length)]!
      }
      const parsed = parseOutcome(() => parseXml(text, DEFAULT_XML_LIMITS))
      const scanned = scanOutcome((handler) => scanXml(text, handler, DEFAULT_XML_LIMITS))
      if (parsed !== scanned) disagree.push(`input ${i}: parse ${parsed}, scan ${scanned}`)
    }
    expect(disagree).toEqual([])
  })
})
