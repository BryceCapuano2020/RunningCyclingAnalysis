import type { SyncIssue, SyncIssueCode } from '@rca/core/session'
import './PrivacyNote.css'

export interface PrivacyNoteProps {
  signedIn: boolean
  /** Whether the signed-in user keeps original files in the library. */
  keepFiles: boolean
  /** Absent means the API predates capability reporting and file retention is available. */
  fileRetentionAvailable?: boolean
  /** The saves that failed this session. A cause that stops summaries or originals from being stored changes what the note says. */
  issues?: readonly Pick<SyncIssue, 'code'>[]
}

/** The causes that leave a new summary unsaved because the library is full. */
const LIBRARY_FULL: ReadonlySet<SyncIssueCode> = new Set<SyncIssueCode>([
  'activity-quota',
  'digest-quota',
])
/** The causes that pause saving, so a new summary is not stored for now. */
const SAVING_PAUSED: ReadonlySet<SyncIssueCode> = new Set<SyncIssueCode>([
  'database-full',
  'read-only',
])
/** The causes that leave a new original file unkept while summaries are stored. */
const ORIGINALS_HALTED: ReadonlySet<SyncIssueCode> = new Set<SyncIssueCode>([
  'storage-quota',
  'storage-budget',
])

/** No failed saves: the default, kept as one array so a render that names none does not make a new one. */
const NO_ISSUES: readonly Pick<SyncIssue, 'code'>[] = []

const has = (issues: readonly Pick<SyncIssue, 'code'>[], codes: ReadonlySet<SyncIssueCode>) =>
  issues.some((issue) => codes.has(issue.code))

/*
 * One sentence for each state. How long recordings are kept, how many fit, and where to remove everything are on the
 * Privacy page, which the footer links to. A state where new summaries are not being stored says so, since "stored"
 * would be false of them.
 */
function privacyText(
  signedIn: boolean,
  keepFiles: boolean,
  fileRetentionAvailable: boolean,
  issues: readonly Pick<SyncIssue, 'code'>[],
): string {
  if (!signedIn) return 'Your activities stay in this browser, where anyone using it can see them.'
  if (has(issues, LIBRARY_FULL)) return 'Your library is full, so new summaries are not stored.'
  if (has(issues, SAVING_PAUSED)) return 'Saving is paused, so new summaries are not stored yet.'
  if (!fileRetentionAvailable) {
    return 'Summaries are stored in your private library, and original file storage is unavailable here.'
  }
  if (has(issues, ORIGINALS_HALTED)) {
    return 'Summaries are stored in your private library, and new original files are not kept.'
  }
  return keepFiles
    ? 'Summaries and original files are stored in your private library.'
    : 'Summaries are stored in your private library, and original files are not kept.'
}

/** The one-line privacy statement that says what is stored for this visitor. */
export function PrivacyNote({
  signedIn,
  keepFiles,
  fileRetentionAvailable = true,
  issues = NO_ISSUES,
}: PrivacyNoteProps) {
  return (
    <p className="privacy-note">
      {privacyText(signedIn, keepFiles, fileRetentionAvailable, issues)}
    </p>
  )
}
