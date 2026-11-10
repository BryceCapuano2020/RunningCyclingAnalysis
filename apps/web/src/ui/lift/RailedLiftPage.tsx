import { Shell } from '../components/Rail'
import { LiftConnected } from './LiftConnected'
import type { LiftConnectedProps } from './LiftConnected'

/** Lift in the one shell: the rail beside it with the pages and no periods, since the period moves no lifting. */
export function RailedLiftPage(props: LiftConnectedProps) {
  return (
    <Shell route={{ page: 'lift' }}>
      <LiftConnected {...props} />
    </Shell>
  )
}
