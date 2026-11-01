import { plural } from '../components/plural'
import type { OutboxStatus } from './model'

const ACTIVITIES = ['activity', 'activities'] as const

/**
 * What is said about the saves an earlier visit left behind: that they are going, how they ended, and what the
 * athlete does about any that could not be saved. Null when there is nothing to say. `importSaidSaved`: the import's own
 * line already counts what was saved, so it is not said twice.
 */
export function outboxText(status: OutboxStatus, importSaidSaved = false): string | null {
  const { pending, saved, failed, finished } = status
  if (!finished) return `Saving ${plural(pending, ...ACTIVITIES)} left from your last import…`
  const parts: string[] = []
  if (saved > 0 && !importSaidSaved)
    parts.push(`Saved ${plural(saved, ...ACTIVITIES)} from your last import.`)
  if (failed > 0) {
    parts.push(
      `${plural(failed, ...ACTIVITIES)} from your last import could not be saved. Add ${failed === 1 ? 'its file' : 'their files'} again.`,
    )
  }
  if (pending > 0) {
    parts.push(
      `${plural(pending, ...ACTIVITIES)} ${pending === 1 ? 'is' : 'are'} still waiting to be saved. ${pending === 1 ? 'It saves' : 'They save'} when the connection returns, or the next time the page loads.`,
    )
  }
  return parts.length === 0 ? null : parts.join(' ')
}
