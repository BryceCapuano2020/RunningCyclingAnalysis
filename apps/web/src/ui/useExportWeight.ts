import { useEffect, useState } from 'react'
import { readProfileWeightKg } from '@rca/core/import/profile'

/**
 * The weight in kg the Strava export waiting to be imported gives in its own profile.csv, or null: no zip among the files,
 * none with a profile, or none with a usable weight. Only the weight is read, and it goes nowhere until the athlete
 * confirms the setup question it is offered in. The first file that gives one is used. A weight read for other files
 * is not shown for these.
 */
export function useExportWeight(files: readonly File[]): number | null {
  const [found, setFound] = useState<{ files: readonly File[]; kg: number } | null>(null)
  useEffect(() => {
    let current = true
    void (async () => {
      for (const file of files) {
        const kg = await readProfileWeightKg(file).catch(() => null)
        if (!current) return
        if (kg !== null) {
          setFound({ files, kg })
          return
        }
      }
    })()
    return () => {
      current = false
    }
  }, [files])
  return found !== null && found.files === files ? found.kg : null
}
