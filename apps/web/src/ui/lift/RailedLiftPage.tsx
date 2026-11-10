import { Shell } from '../components/Rail'
import { LiftPage } from './LiftPage'
import type { LiftPageProps } from './LiftPage'

/** Lift in the one shell: the rail beside it with the pages and no periods, since the period moves no lifting. */
export function RailedLiftPage(props: LiftPageProps) {
  return (
    <Shell route={{ page: 'lift' }}>
      <LiftPage {...props} />
    </Shell>
  )
}
