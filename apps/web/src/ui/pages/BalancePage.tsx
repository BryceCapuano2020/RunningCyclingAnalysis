import type { ReactNode } from 'react'
import { weeksWithValue } from '@rca/core/digest/trendPoints'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { TrendChart } from '../charts'
import { ShareImageButton, pickHeadline } from '../components'
import type { AnalysisController } from '../useAnalysis'
import { BalanceHero } from './BalanceHero'
import { CrossSportCard } from './CrossSportCard'
import { EvidenceCard } from './EvidenceCard'
import { SportCard } from './SportCard'
import './BalancePage.css'

export interface BalancePageProps {
  analysis: AnalysisController
  result: AnalysisResult
  settings: AthleteSettings
  units: UnitSystem
  /** The period control, shown beside the heading. */
  controls: ReactNode
}

/**
 * The home screen. It answers three things at a glance: where you stand in each sport, how your
 * balance between them leans, and what would sharpen the answer.
 */
export function BalancePage({ analysis, result, settings, units, controls }: BalancePageProps) {
  const { isSample, rangeDays, trend } = analysis.state
  const pick = pickHeadline(result.comparison)
  const effort = result.effort.find((e) => e.durationS === pick?.point.durationS) ?? null

  return (
    <div className="page-stack">
      <div className="page-head">
        <p className="eyebrow">
          Your balance
          {isSample && <span className="chip">Sample athlete</span>}
        </p>
        {controls}
      </div>

      <BalanceHero result={result} pick={pick} />

      <div className="balance__sports">
        <SportCard sport="run" result={result} units={units} massKg={settings.massKg} />
        <SportCard sport="ride" result={result} units={units} massKg={settings.massKg} />
      </div>

      <div className="balance__cards">
        <EvidenceCard effort={effort} />
        <CrossSportCard result={result} units={units} />
      </div>

      {weeksWithValue(trend) >= 2 && (
        <section className="section" aria-labelledby="balance-trend">
          <h2 id="balance-trend">Fitness over time</h2>
          <TrendChart points={trend} />
        </section>
      )}

      <div className="balance__footer">
        <ShareImageButton
          result={result}
          settings={settings}
          units={units}
          rangeDays={rangeDays}
          isSample={isSample}
          effort={effort}
          disabled={analysis.busy}
        />
      </div>
    </div>
  )
}
