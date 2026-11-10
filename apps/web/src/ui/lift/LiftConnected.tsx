import { useMemo, useState } from 'react'
import type { Equipment, LiftSet } from '@rca/core/lift'
import type { UnitSystem } from '@rca/core/units'
import type { AccountController } from '../useAccount'
import { LiftPage } from './LiftPage'
import { LiftPicker } from './LiftPicker'
import { SetForm } from './SetForm'
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
}

/** A set without its set order, which the log assigns. */
function draftOf(set: LiftSet): NewLiftSet {
  const { setOrder, ...draft } = set
  void setOrder
  return draft
}

const clock = () => new Date()

/**
 * The Lift page on the lift log: the day's lifts, earlier sessions, the status rows, the form under "Log a set" and the
 * form in place of a set being edited (docs/design/lift-logger.md).
 */
export function LiftConnected({ account, units, day, today, openDay }: LiftConnectedProps) {
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

  const logged = log.days.find((entry) => entry.date === day)
  const lifts = useMemo(() => liftsOfDay(logged), [logged])
  const earlier = useMemo(() => earlierDays(log.days, day, count), [log.days, day, count])
  const editing = editingKey === null ? undefined : setOfKey(logged, editingKey)

  const exercise = choice?.exercise ?? null
  const usual =
    choice?.equipment ?? log.recentLifts.find((lift) => lift.exercise === exercise)?.equipment
  const last = exercise === null ? undefined : lastSetOf(log.days, exercise, usual)
  const closeAll = () => {
    setLogging(false)
    setChoice(null)
  }

  const form = logging ? (
    <>
      <LiftPicker recent={log.recentLifts} selected={exercise} onChoose={setChoice} />
      {exercise === null ? (
        <button type="button" className="btn" onClick={closeAll}>
          Done
        </button>
      ) : (
        <SetForm
          key={exercise}
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
          onSave={(set) => void log.save(draftOf(set))}
          onDone={closeAll}
        />
      )}
    </>
  ) : null

  const rowForm =
    editing && editingKey !== null ? (
      <SetForm
        key={editingKey}
        exercise={editing.exercise}
        date={editing.date}
        setOrder={editing.setOrder}
        units={units}
        primary
        initial={editing}
        onSave={(set) => void log.update(editing, draftOf(set)).then(() => setEditingKey(null))}
        onDelete={() => void log.remove(editingKey).then(() => setEditingKey(null))}
        onDone={() => setEditingKey(null)}
      />
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
        setEditingKey(null)
        setCount(EARLIER_STEP)
        openDay(next)
      }}
      onLog={() => {
        setEditingKey(null)
        setLogging(true)
      }}
      onEditSet={(key) => {
        closeAll()
        setEditingKey(key)
      }}
      editingKey={editing ? editingKey : null}
      rowForm={rowForm}
      form={form}
    />
  )
}
