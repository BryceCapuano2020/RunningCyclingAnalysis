import type { ReactNode } from 'react'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { trendWindowDays, weeksWithValue } from '@rca/core/digest/trendPoints'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { TrendChart } from '../charts'
import { ShareImageButton, pickHeadline } from '../components'
import { StandardsCredit } from '../components/StandardsCredit'
import { gapOfHeadline } from '../balanceGap'
import { gradedSexOf, headlineGrades, SEX_NOUN } from '../grades'
import type { AgeProfile } from '../grades'
import { hrefFor } from '../route'
import { SPORT_ORDER } from '../sports'
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
  /** The year of birth and sex for the grades, or null while either is missing. */
  profile: AgeProfile | null
  /** The period control, shown beside the heading. */
  controls: ReactNode
  /** False while no body weight is entered, so the share card leaves out what needs one. */
  weightKnown: boolean
}

/**
 * The home screen. It answers three things at a glance: where you stand in each sport, how your
 * balance between them leans, and what would sharpen the answer.
 */
export function BalancePage({
  analysis,
  result,
  settings,
  units,
  profile,
  controls,
  weightKnown,
}: BalancePageProps) {
  const { isSample, rangeDays, trend } = analysis.state
  const pick = pickHeadline(result.comparison)
  const effort = result.effort.find((e) => e.durationS === pick?.point.durationS) ?? null
  // Each sport's grade is worked out once here, and the cards, the balance and the share card share it.
  const headline = profile === null ? null : headlineGrades(result, profile)
  // The ride's grade, and so the gap, wait for the weight; the run's grade does not.
  const gap = weightKnown && headline !== null ? gapOfHeadline(headline) : null
  // The standards line is shown only when a grade is, so it never cites grades that are not there.
  const sourceSex = gradedSexOf(headline, profile)

  return (
    <div className="page-stack">
      <div className="page-head">
        <p className="eyebrow">
          Your balance
          {isSample && <span className="chip">Sample athlete</span>}
        </p>
        {controls}
      </div>

      <BalanceHero
        result={result}
        pick={pick}
        gap={gap}
        rangeDays={rangeDays}
        onShowAll={() => analysis.setRange(null)}
        weightKnown={weightKnown}
      />

      <div className="balance__sports">
        {SPORT_ORDER.map((sport) => (
          <SportCard
            key={sport}
            sport={sport}
            result={result}
            units={units}
            massKg={settings.massKg}
            grade={sport === 'ride' && !weightKnown ? null : (headline?.[sport] ?? null)}
          />
        ))}
      </div>

      {profile === null && (
        <p className="muted">
          <a href={hrefFor({ page: 'profile' })}>
            Add your year of birth and sex on your profile to see the balance in points and levels.
          </a>
        </p>
      )}

      <div className="balance__cards">
        <EvidenceCard effort={effort} />
        <CrossSportCard result={result} units={units} />
      </div>

      {weeksWithValue(trend) >= 2 && (
        <section className="section" aria-labelledby="balance-trend">
          <h2 id="balance-trend">Fitness over time</h2>
          <div className="balance__trends">
            <TrendChart
              sport="run"
              points={trend}
              massKg={settings.massKg}
              units={units}
              windowDays={trendWindowDays(rangeDays)}
              effortS={HEADLINE_DURATION_S}
            />
            <TrendChart
              sport="ride"
              points={trend}
              massKg={settings.massKg}
              units={units}
              windowDays={trendWindowDays(rangeDays)}
              effortS={HEADLINE_DURATION_S}
            />
          </div>
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
          weightKnown={weightKnown}
          gap={gap}
          disabled={analysis.busy}
        />
      </div>

      {sourceSex !== null && (
        <p className="muted balance__source">
          Graded on the <StandardsCredit />, for a {SEX_NOUN[sourceSex]}. Age is counted from your
          birth year on the date of each effort. Rides are graded through their running equivalent.
          A level, not a ranking.
        </p>
      )}
    </div>
  )
}
