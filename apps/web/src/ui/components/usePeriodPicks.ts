import { useRef, useState } from 'react'
import type { RefObject } from 'react'
import { isCustomChoice } from '@rca/core/customRange'
import { sameChoice } from '@rca/core/period'
import type { PeriodChoice } from '@rca/core/period'
import { usePickInPlace } from './usePickInPlace'

export interface PeriodPicksInput {
  /** The choice on screen, unless the athlete has picked one here since. */
  choice: PeriodChoice
  /** The window a resolved default stands for; see RangePickerProps. */
  resolved?: PeriodChoice
  /** The element kept in place while the answer to a pick re-lays the page. */
  root: RefObject<HTMLElement | null>
  onChange: (choice: PeriodChoice, answered: (reply: unknown) => void) => void
}

export interface PeriodPicks {
  /** The pick on screen: the latest one while any is unanswered, else the page's choice. */
  picked: PeriodChoice
  /** The segment shown as selected: a default is the window it resolved to. */
  checked: PeriodChoice
  /** A pick is still waiting for the worker's answer. */
  waiting: boolean
  /** Whether the Custom form is open. */
  customOpen: boolean
  openCustom: (open: boolean) => void
  /** Whether the range on screen was swapped on Apply. */
  swapped: boolean
  pick: (next: PeriodChoice, reversed?: boolean) => void
}

/**
 * The period control's state, shared by the segments and by the rail. Each pick is numbered, and its answer marks that
 * number as answered. The worker answers the picks in the order they were made, so the control shows the latest pick
 * until every pick is answered, and the page's choice after that. An answer to an earlier pick cannot move it.
 */
export function usePeriodPicks({
  choice,
  resolved,
  root,
  onChange,
}: PeriodPicksInput): PeriodPicks {
  const made = useRef(0)
  const [picks, setPicks] = useState<{
    count: number
    answered: number
    latest: PeriodChoice | null
  }>({ count: 0, answered: 0, latest: null })
  const waiting = picks.count > picks.answered
  const picked = waiting && picks.latest !== null ? picks.latest : choice
  const checked: PeriodChoice = picked === 'default' ? (resolved ?? picked) : picked
  // The form is open while a custom range is on screen, or while the athlete has picked Custom and not
  // yet a fixed period. A fixed period on screen closes it, but a new custom range keeps it open.
  const [customOpen, setCustomOpen] = useState(() => isCustomChoice(choice))
  const [seenChoice, setSeenChoice] = useState(choice)
  // Whether the range on screen was swapped on Apply. A fixed period is not a swap, so it clears the note.
  const [swapped, setSwapped] = useState(false)
  if (!sameChoice(choice, seenChoice)) {
    setSeenChoice(choice)
    setCustomOpen(isCustomChoice(choice))
    if (!isCustomChoice(choice)) setSwapped(false)
  }
  const markPick = usePickInPlace(root, waiting)
  const pick = (next: PeriodChoice, reversed = false) => {
    markPick()
    setSwapped(reversed)
    const id = made.current + 1
    made.current = id
    setPicks((current) => ({ count: id, answered: current.answered, latest: next }))
    onChange(next, () =>
      setPicks((current) => ({ ...current, answered: Math.max(current.answered, id) })),
    )
  }
  return { picked, checked, waiting, customOpen, openCustom: setCustomOpen, swapped, pick }
}
