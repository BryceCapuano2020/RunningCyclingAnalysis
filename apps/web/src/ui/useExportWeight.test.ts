// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { useExportWeight } from './useExportWeight'

const profile = (weight: string) => `Athlete ID,Sex,Weight,City\n1,F,${weight},Town\n`

function zip(entries: Record<string, string>, name = 'export.zip'): File {
  const bytes = zipSync(
    Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, strToU8(v)])),
  )
  return new File([new Uint8Array(bytes)], name)
}

describe('useExportWeight', () => {
  it('reads the weight from the first waiting zip that has one', async () => {
    const files = [
      new File([new Uint8Array([1])], 'run.fit'),
      zip({ 'activities.csv': 'Filename\n' }, 'a.zip'),
      zip({ 'profile.csv': profile('66.5') }, 'b.zip'),
    ]
    const { result } = renderHook(() => useExportWeight(files))
    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toBe(66.5))
  })

  it('is null with nothing waiting, no profile, or a weight the app would not accept', async () => {
    const none = renderHook(() => useExportWeight([]))
    expect(none.result.current).toBeNull()
    const files = [zip({ 'profile.csv': profile('0') })]
    const bad = renderHook(() => useExportWeight(files))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(bad.result.current).toBeNull()
  })

  it('forgets the weight when the files waiting change', async () => {
    const first = [zip({ 'profile.csv': profile('70') })]
    const second = [zip({ 'activities.csv': 'Filename\n' })]
    const { result, rerender } = renderHook(({ files }) => useExportWeight(files), {
      initialProps: { files: first },
    })
    await waitFor(() => expect(result.current).toBe(70))
    rerender({ files: second })
    await waitFor(() => expect(result.current).toBeNull())
  })
})
