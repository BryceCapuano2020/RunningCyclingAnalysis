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
}

/**
 * Holds parsed activities between requests so that changing a setting re-runs
 * the analysis without re-reading files. Lives inside the Web Worker.
 */
export class AnalysisSession {
  private activities = new Map<string, Activity>()
  private rejected: RejectedFile[] = []
  private unsupportedFiles = 0
  private isSample = false

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
          this.rejected.push({ fileName: parsed.fileName, reason: parsed.reason })
        }
        onProgress?.(++filesRead)
      })
      this.unsupportedFiles += summary.otherActivityFiles
      if (summary.fitFiles === 0 && summary.otherActivityFiles === 0) {
        this.rejected.push({ fileName: source.name, reason: 'No FIT files found' })
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

  clear(): SessionState {
    this.activities.clear()
    this.rejected = []
    this.unsupportedFiles = 0
    this.isSample = false
    return { result: null, rejected: [], unsupportedFiles: 0, isSample: false }
  }

  private state(settings: AthleteSettings): SessionState {
    return {
      result: this.activities.size > 0 ? analyze([...this.activities.values()], settings) : null,
      rejected: [...this.rejected],
      unsupportedFiles: this.unsupportedFiles,
      isSample: this.isSample,
    }
  }
}
