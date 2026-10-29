import { zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { extractFitFiles } from './archive'

/** A top-level zip whose decompressor throws once its central directory has passed. */

const late = vi.hoisted(() => ({ armed: false }))

vi.mock('fflate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fflate')>()
  class LateThrowUnzip extends actual.Unzip {
    override push(chunk: Uint8Array, final?: boolean): void {
      // The end of central directory record is in the last slice of the zip.
      const hasEnd = chunk.some(
        (_, i) => chunk[i] === 0x50 && chunk[i + 1] === 0x4b && chunk[i + 2] === 5,
      )
      super.push(chunk, final)
      if (late.armed && hasEnd) throw new Error('late')
    }
  }
  return { ...actual, Unzip: LateThrowUnzip }
})

function noise(length: number): Uint8Array {
  const out = new Uint8Array(length)
  let x = 99
  for (let i = 0; i < length; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0
    out[i] = x >>> 24
  }
  return out
}

describe('a top-level zip that fails after its central directory has passed', () => {
  it('reports the failure once, and not also a damaged directory', async () => {
    const zip = new Uint8Array(zipSync({ 'a.fit': noise(40_000), 'b.fit': noise(30_000) }))
    const run = async () => {
      const files: string[] = []
      const errors: string[] = []
      await extractFitFiles(
        new File([zip], 'export.zip'),
        (file) => {
          files.push(file.fileName)
        },
        (name, rejection) => errors.push(`${name}: ${rejection.reason}`),
      )
      return { files, errors }
    }
    const whole = await run()
    late.armed = true
    const cut = await run()
    late.armed = false

    expect(whole.errors).toEqual([])
    expect(cut.files).toEqual(whole.files)
    expect(cut.errors).toEqual(['export.zip: Could not read archive'])
  })
})
