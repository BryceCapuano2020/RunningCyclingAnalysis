import { useMemo, useState } from 'react'
import type { AthleteSettings } from '@rca/core/athlete'
import type { AgeProfile } from '@rca/core/grade'
import type { Equipment, LiftSet } from '@rca/core/lift'
import type { UnitSystem } from '@rca/core/units'
import type { AccountController } from '../useAccount'
import { HevyImport } from './HevyImport'
import { LiftEstimates } from './LiftEstimates'
import { LiftLead } from './LiftLead'
import { BigThreeLead } from './BigThreeLead'
import { LiftPage } from './LiftPage'
import { LiftPicker } from './LiftPicker'
import { SetForm } from './SetForm'
import { liftOverviewOf } from './liftEntries'
import { EARLIER_STEP, earlierDays, lastSetOf, liftsOfDay, setOfKey } from './liftPageData'
import type { NewLiftSet } from './useLiftLog'
import { useLiftLog } from './useLiftLog'

export interface LiftConnectedProps {
  account: AccountController
  units: UnitSystem
  /** The day shown and today, from `useLiftDay`. */
  day: string
  today: string
  openDay: (day: string) => void
  /** The athlete's settings, whose body mass the times-body-mass figure and the grade read. */
  settings: AthleteSettings
  /** The year of birth and sex for the age grade, or null while either is missing. */
  profile: AgeProfile | null
}

/** A set without its set order, which the log assigns. */
function draftOf(set: LiftSet): NewLiftSet {
  const { setOrder, ...draft } = set
  void setOrder
  return draft
}

// The stamp reads the clock when Save is pressed: `useNow` holds its value until midnight, so it would give every set
// the time the page opened.
const clock = () => new Date()

/** What a failed save shows, above the form that keeps its values. */
function NotSaved() {
  return (
    <p role="alert" className="lift__error">
      Not saved
    </p>
  )
}

/**
 * The Lift page on the lift log: the day's lifts, earlier sessions, the status rows, the form under "Log a set" and the
 * form in place of a set being edited (docs/design/lift-logger.md).
 */
export function LiftConnected({
  account,
  units,
  day,
  today,
  openDay,
  settings,
  profile,
}: LiftConnectedProps) {
  const log = useLiftLog({
    status: account.status,
    userId: account.me?.user.id ?? null,
    liftRevision: account.me?.liftRevision,
    refresh: account.refresh,
    markExpired: account.markExpired,
  })
  const [logging, setLogging] = useState(false)
  const [choice, setChoice] = useState<{ exercise: string; equipment?: Equipment } | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [count, setCount] = useState(EARLIER_STEP)
  const [notSaved, setNotSaved] = useState(false)
  const [importing, setImporting] = useState(false)

  const logged = log.days.find((entry) => entry.date === day)
  const lifts = useMemo(() => liftsOfDay(logged), [logged])
  const earlier = useMemo(() => earlierDays(log.days, day, count), [log.days, day, count])
  // The caller builds the profile afresh each render, so the memo reads its two values.
  const birthYear = profile?.birthYear ?? null
  const sex = profile?.sex ?? null
  const overview = useMemo(
    () =>
      liftOverviewOf(
        log.sets,
        settings,
        birthYear === null || sex === null ? null : { birthYear, sex },
        units,
        today,
      ),
    [log.sets, settings, birthYear, sex, units, today],
  )
  const editing = editingKey === null ? undefined : setOfKey(logged, editingKey)

  const exercise = choice?.exercise ?? null
  const usual =
    choice?.equipment ?? log.recentLifts.find((lift) => lift.exercise === exercise)?.equipment
  const last = exercise === null ? undefined : lastSetOf(log.days, exercise, usual)
  const closeAll = () => {
    setLogging(false)
    setChoice(null)
    setNotSaved(false)
  }
  // A write that returns null or rejects keeps its form open with the values; one that lands runs `done`.
  const settle = (work: Promise<unknown>, done?: () => void) => {
    void work.then(
      (result) => {
        setNotSaved(result === null)
        if (result !== null) done?.()
      },
      () => setNotSaved(true),
    )
  }

  const form = importing ? (
    <HevyImport
      existing={log.sets}
      units={units}
      onImport={log.importSets}
      onDone={() => setImporting(false)}
    />
  ) : logging ? (
    <>
      <LiftPicker recent={log.recentLifts} selected={exercise} onChoose={setChoice} />
      {notSaved && <NotSaved />}
      {exercise === null ? (
        <button type="button" className="btn" onClick={closeAll}>
          Done
        </button>
      ) : (
        <SetForm
          // A lift from another equipment, or the days arriving after the pick, start the form again from the last set.
          key={`${exercise}|${choice?.equipment ?? ''}|${log.ready}`}
          exercise={exercise}
          date={day}
          setOrder={1}
          units={units}
          primary
          {...(usual && { defaultEquipment: usual })}
          {...(day === today && { now: clock })}
          initial={
            last && {
              equipment: last.equipment,
              reps: last.reps,
              loadKg: last.loadKg,
              ...(last.rpe !== undefined && { rpe: last.rpe }),
            }
          }
          onSave={(set) => settle(log.save(draftOf(set)))}
          onDone={closeAll}
        />
      )}
    </>
  ) : null

  const rowForm =
    editing && editingKey !== null ? (
      <>
        {notSaved && <NotSaved />}
        <SetForm
          key={editingKey}
          exercise={editing.exercise}
          date={editing.date}
          setOrder={editing.setOrder}
          units={units}
          primary
          initial={editing}
          onSave={(set) => settle(log.update(editing, draftOf(set)), () => setEditingKey(null))}
          onDelete={() => settle(log.remove(editingKey), () => setEditingKey(null))}
          onDone={() => {
            setNotSaved(false)
            setEditingKey(null)
          }}
        />
      </>
    ) : null

  return (
    <LiftPage
      day={day}
      today={today}
      lifts={lifts}
      earlier={earlier.shown}
      {...(earlier.more && { onMore: () => setCount((n) => n + EARLIER_STEP) })}
      status={
        account.status === 'signed-in'
          ? { notSent: log.pendingCount, refused: log.refused, full: log.full }
          : null
      }
      units={units}
      onDay={(next) => {
        closeAll()
        setImporting(false)
        setEditingKey(null)
        setCount(EARLIER_STEP)
        openDay(next)
      }}
      onLog={() => {
        setEditingKey(null)
        setLogging(true)
      }}
      onImport={() => {
        setEditingKey(null)
        setImporting(true)
      }}
      onEditSet={(key) => {
        closeAll()
        setEditingKey(key)
      }}
      editingKey={editing ? editingKey : null}
      rowForm={rowForm}
      form={form}
      lead={
        overview.bigThree !== null ? (
          <BigThreeLead
            model={overview.bigThree}
            onLog={() => {
              setEditingKey(null)
              setLogging(true)
            }}
          />
        ) : (
          overview.lead && <LiftLead lead={overview.lead} units={units} />
        )
      }
      estimates={<LiftEstimates overview={overview} units={units} />}
    />
  )
}
