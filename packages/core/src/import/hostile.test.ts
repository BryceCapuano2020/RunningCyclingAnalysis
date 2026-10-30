import { describe, expect, it } from 'vitest'
import { parseGpx } from '../gpx/parse'
import { parseTcx } from '../tcx/parse'
import { scanXml, XmlError } from '../xml/parse'
import {
  MAX_GPX_TRACKS,
  MAX_TCX_ACTIVITIES,
  MAX_TCX_LAPS,
  MAX_XML_ATTRIBUTE_CHARS,
  MAX_XML_ATTRIBUTES_PER_ELEMENT,
  MAX_XML_NAME_CHARS,
  MAX_XML_TEXT_RUN_CHARS,
} from './limits'
import type { ParseResult } from './result'

/** Synthetic hostile files: each is a few megabytes of text that asked for gigabytes. */

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
const GPX = (body: string) => `<gpx version="1.1" creator="test">${body}</gpx>`
const TCX = (activities: string) =>
  `<TrainingCenterDatabase><Activities>${activities}</Activities></TrainingCenterDatabase>`

function refusal(result: ParseResult): { code: string; reason: string; detail?: string } {
  if (result.ok) throw new Error('expected the file to be refused')
  return {
    code: result.code,
    reason: result.reason,
    ...(result.detail === undefined ? {} : { detail: result.detail }),
  }
}

/** `n` attributes with names of their own, since a repeated name is an error of its own. */
function attributes(n: number): string {
  return Array.from({ length: n }, (_, i) => ` a${i}="1"`).join('')
}

function scanError(text: string, limits = {}): unknown {
  try {
    scanXml(text, {}, limits)
  } catch (error) {
    return error
  }
  return null
}

describe('the XML scanner refuses structure no real file has, before copying or decoding it', () => {
  it('refuses an element with more attributes than the cap and reads one at the cap', () => {
    expect(scanError(`<r${attributes(MAX_XML_ATTRIBUTES_PER_ELEMENT)}/>`)).toBeNull()
    const error = scanError(`<r${attributes(MAX_XML_ATTRIBUTES_PER_ELEMENT + 1)}/>`)
    expect(error).toBeInstanceOf(XmlError)
    expect((error as Error).message).toMatch(/more than 64 attributes/)
  })

  it('refuses a flood of attributes on one element at the cap, without reading the rest', () => {
    const flood = `<r${attributes(200_000)}/>`
    expect(flood.length).toBeGreaterThan(2_000_000)
    expect((scanError(flood) as Error).message).toMatch(/more than 64 attributes/)
  })

  it('refuses a name longer than the cap', () => {
    const long = 'n'.repeat(MAX_XML_NAME_CHARS + 1)
    expect(scanError(`<${'n'.repeat(MAX_XML_NAME_CHARS)}/>`)).toBeNull()
    expect((scanError(`<${long}/>`) as Error).message).toMatch(/name of more than 256/)
    expect((scanError(`<r ${long}="1"/>`) as Error).message).toMatch(/name of more than 256/)
  })

  it('refuses a run of text past the cap, before decoding the references in it', () => {
    const run = (n: number) => `<r>${'&amp;'.repeat(n)}</r>`
    expect(scanError(run(1000))).toBeNull()
    // 60 MiB of references was 674 MB of memory before the cap; now it is refused at once.
    const flood = run(Math.floor((60 * 1024 * 1024) / 5))
    expect((scanError(flood) as Error).message).toMatch(/text of more than 1048576 characters/)
    const justOver = `<r>${'x'.repeat(MAX_XML_TEXT_RUN_CHARS + 1)}</r>`
    expect(scanError(justOver)).toBeInstanceOf(XmlError)
    expect(scanError(`<r>${'x'.repeat(MAX_XML_TEXT_RUN_CHARS)}</r>`)).toBeNull()
  })

  it('refuses a CDATA section and an attribute value past their caps', () => {
    const cdata = `<r><![CDATA[${'x'.repeat(MAX_XML_TEXT_RUN_CHARS + 1)}]]></r>`
    expect((scanError(cdata) as Error).message).toMatch(/CDATA of more than/)
    const value = `<r a="${'x'.repeat(MAX_XML_ATTRIBUTE_CHARS + 1)}"/>`
    expect((scanError(value) as Error).message).toMatch(/value of a is more than 65536/)
    expect(scanError(`<r a="${'&amp;'.repeat(1000)}"/>`)).toBeNull()
  })

  it('takes smaller caps from the caller', () => {
    expect(scanError('<r><a/></r>', { maxAttributes: 0 })).toBeNull()
    expect(scanError('<r a="1"/>', { maxAttributes: 0 })).toBeInstanceOf(XmlError)
    expect(scanError('<r>abcd</r>', { maxTextRunChars: 3 })).toBeInstanceOf(XmlError)
    expect(scanError('<abcd/>', { maxNameChars: 3 })).toBeInstanceOf(XmlError)
    expect(scanError('<r a="abcd"/>', { maxAttributeChars: 3 })).toBeInstanceOf(XmlError)
  })

  it('still decodes the references in ordinary text', () => {
    let seen = ''
    scanXml('<r>a&amp;b&#65;&#x42;&lt;&gt;&quot;&apos;c</r>', { text: (t) => (seen += t) })
    expect(seen).toBe('a&bAB<>"\'c')
  })
})

describe('a hostile GPX file is refused with a reason, not read into memory', () => {
  it('refuses a file with more tracks than the cap, saying to split it', () => {
    // Two million empty tracks were 63 MiB and 3 GB of memory before the cap.
    const flood = encode(GPX('<trk/>'.repeat(MAX_GPX_TRACKS + 1)))
    expect(refusal(parseGpx(flood, 'many.gpx'))).toEqual({
      code: 'too-much-data',
      detail: 'split',
      reason: `GPX file has more than ${MAX_GPX_TRACKS} tracks: split it`,
    })
  })

  it('reads a file with exactly the cap of tracks as far as it can: it is empty, not too much', () => {
    const result = refusal(parseGpx(encode(GPX('<trk/>'.repeat(MAX_GPX_TRACKS))), 'cap.gpx'))
    expect(result.code).not.toBe('too-much-data')
  })

  it('refuses a trackpoint with a flood of attributes as a file that is not GPX', () => {
    const point = `<trk><trkseg><trkpt${attributes(100)}/></trkseg></trk>`
    expect(refusal(parseGpx(encode(GPX(point)), 'a.gpx')).code).toBe('corrupt')
  })

  it('refuses text made of references in a track name', () => {
    const name = '&amp;'.repeat(300_000)
    const result = refusal(parseGpx(encode(GPX(`<trk><name>${name}</name></trk>`)), 'name.gpx'))
    expect(result.code).toBe('corrupt')
  })
})

describe('a hostile TCX file is refused with a reason, not read into memory', () => {
  it('refuses a file with more activities than the cap', () => {
    const flood = encode(TCX('<Activity Sport="Running"/>'.repeat(MAX_TCX_ACTIVITIES + 1)))
    expect(refusal(parseTcx(flood, 'many.tcx'))).toEqual({
      code: 'too-much-data',
      detail: 'split',
      reason: `TCX file has more than ${MAX_TCX_ACTIVITIES} activities: split it`,
    })
  })

  it('refuses a file with more laps than the cap, over all its activities', () => {
    const lap = '<Lap StartTime="2024-05-01T07:30:00Z"/>'
    const one = `<Activity Sport="Running">${lap.repeat(MAX_TCX_LAPS)}</Activity>`
    const result = encode(TCX(`${one}<Activity Sport="Running">${lap}</Activity>`))
    expect(refusal(parseTcx(result, 'laps.tcx'))).toEqual({
      code: 'too-much-data',
      detail: 'split',
      reason: `TCX file has more than ${MAX_TCX_LAPS} laps: split it`,
    })
  })

  it('refuses an element with a flood of attributes as a file that is not TCX', () => {
    const activity = `<Activity Sport="Running"${attributes(100)}/>`
    expect(refusal(parseTcx(encode(TCX(activity)), 'a.tcx')).code).toBe('corrupt')
  })
})
