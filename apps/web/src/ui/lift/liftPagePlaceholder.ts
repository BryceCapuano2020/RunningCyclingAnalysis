import type { LiftPageProps } from './LiftPage'

/**
 * PLACEHOLDER: the Lift page's props with nothing logged, until the page is wired to useLiftLog and the form. It is
 * signed out (status is null) with no lifts and no earlier days, so the page shows its empty day. The wiring step
 * replaces this file's one caller in App.tsx and deletes it.
 */
export function liftPagePlaceholder({
  day,
  today,
  openDay,
}: {
  day: string
  today: string
  openDay: (day: string) => void
}): Omit<LiftPageProps, 'units'> {
  return {
    day,
    today,
    lifts: [],
    earlier: [],
    status: null,
    editingKey: null,
    onDay: openDay,
    onLog: () => undefined,
    onEditSet: () => undefined,
  }
}
