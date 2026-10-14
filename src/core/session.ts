import type { FitSource } from './fit'
import { extractFitFiles, parseFit } from './fit'
import type { AnalysisResult } from './pipeline'
import { analyze } from './pipeline'
import { sampleDataset } from './synthetic'
import type { Activity, AthleteSettings } from './types'

export interface RejectedFile {
  fileName: string
  reason: string
}

export interface SessionState {
  /** Null until at least one activity has been loaded. */
  result: AnalysisResult | null
  rejected: RejectedFile[]
  /** Activity files in formats this app does not read (GPX, TCX) that were skipped. */
  unsupportedFiles: number
  isSample: boolean
  /** Activities loaded, before the period filter. */
  totalActivities: number
  /** Only activities from the last rangeDays days before the newest one are analysed; null = all. */
  rangeDays: number | null
}

/**
 * Holds parsed activities between requests so that changing a setting re-runs
 * the analysis without re-reading files. Lives inside the Web Worker.
 */
export class AnalysisSession {
  private activities = new Map<string, Activity>()
  // Keyed by file name so importing the same export twice does not double-count.
  private rejected = new Map<string, string>()
  private unsupported = new Map<string, number>()
  private isSample = false
  private rangeDays: number | null = null

  async addFiles(
    sources: FitSource[],
    settings: AthleteSettings,
    onProgress?: (filesRead: number) => void,
  ): Promise<SessionState> {
    if (this.isSample) this.clear()
    let filesRead = 0
    for (const source of sources) {
      const summary = await extractFitFiles(source, (file) => {
        const parsed = parseFit(file.bytes, file.fileName)
        if (parsed.ok) {
          for (const activity of parsed.activities) {
            // The same workout exported twice has the same sport and start second.
            const key = `${activity.sport}-${Math.round(activity.startMs / 1000)}`
            this.activities.set(key, activity)
          }
        } else {
          this.rejected.set(parsed.fileName, parsed.reason)
        }
        onProgress?.(++filesRead)
      })
      this.unsupported.set(source.name, summary.otherActivityFiles)
      if (summary.fitFiles === 0 && summary.otherActivityFiles === 0) {
        this.rejected.set(source.name, 'No FIT files found')
      }
    }
    return this.state(settings)
  }

  loadSample(settings: AthleteSettings): SessionState {
    this.clear()
    this.isSample = true
    for (const activity of sampleDataset().activities) this.activities.set(activity.id, activity)
    return this.state(settings)
  }

  setSettings(settings: AthleteSettings): SessionState {
    return this.state(settings)
  }

  setRange(rangeDays: number | null, settings: AthleteSettings): SessionState {
    this.rangeDays = rangeDays
    return this.state(settings)
  }

  clear(): SessionState {
    this.activities.clear()
    this.rejected.clear()
    this.unsupported.clear()
    this.isSample = false
    return this.state({ massKg: 0, bikeMassKg: 0 })
  }

  private state(settings: AthleteSettings): SessionState {
    const all = [...this.activities.values()]
    let selected = all
    if (this.rangeDays !== null && all.length > 0) {
      // Anchored to the newest activity, not today, so an old export still shows its last weeks.
      const newest = all.reduce((latest, a) => Math.max(latest, a.startMs), -Infinity)
      const cutoff = newest - this.rangeDays * 86_400_000
      selected = all.filter((a) => a.startMs >= cutoff)
    }
    return {
      result: selected.length > 0 ? analyze(selected, settings) : null,
      rejected: [...this.rejected].map(([fileName, reason]) => ({ fileName, reason })),
      unsupportedFiles: [...this.unsupported.values()].reduce((a, b) => a + b, 0),
      isSample: this.isSample,
      totalActivities: all.length,
      rangeDays: this.rangeDays,
    }
  }
}
