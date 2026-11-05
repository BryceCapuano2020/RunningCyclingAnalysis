import { Shell } from '../components/Rail'
import { ProfilePage } from './ProfilePage'
import type { ProfilePageProps } from './ProfilePage'

/**
 * Profile in the one shell: with a result to go back to, the rail stands beside it as on every other page, with the
 * pages and no periods, since the period does not move Profile. With none, Profile is the page alone.
 */
export function RailedProfilePage(props: ProfilePageProps) {
  const page = <ProfilePage {...props} />
  return props.analysis.state.result === null ? (
    page
  ) : (
    <Shell route={{ page: 'profile' }}>{page}</Shell>
  )
}
