import type { RejectedFile } from '@rca/core/session'
import {
  groupRejected,
  lineNamesAction,
  rejectionCopy,
  SKIPPED_GROUP_COPY,
} from '../analysis/rejectCopy'
import type { SkippedFiles } from '../analysis/rejectCopy'
import { skippedSentence } from '../analysis/copy'
import { keyByContent } from '../contentKeys'
import { HowToGetFilesButton } from './HowToGetFiles'
import './RejectedFiles.css'

export interface RejectedFilesProps {
  /** The files the import skipped: the count the summary's sentence and its announcement give. */
  count: number
  /** Files the import could not use. */
  rejected: RejectedFile[]
  /** Activity files in a format this app does not read. They are counted, not listed. */
  unsupportedFiles: number
  /** Copies of workouts the import left out, because a better copy is already saved. */
  duplicates?: RejectedFile[]
}

const NO_DUPLICATES: RejectedFile[] = []

/**
 * The files an import skipped: one neutral line, the count, that opens the groups, with the first
 * file's reason under it in both states. Each group says what its files are and gives one suggested
 * action, which its files' lines leave out.
 */
export function RejectedFiles({
  count,
  rejected,
  unsupportedFiles,
  duplicates = NO_DUPLICATES,
}: RejectedFilesProps) {
  const listed = [...rejected, ...duplicates]
  if (count === 0) return null
  const groups = withUnsupported(groupRejected(listed), unsupportedFiles)
  const first = listed[0]
  return (
    <div className="rejected-files">
      <details>
        <summary>
          <span>{skippedSentence(count)}</span>
          {first !== undefined && (
            <span className="rejected-files__first">
              {fileLine(first, groupShowsAction(groups, first))}
            </span>
          )}
        </summary>
        {groups.map(({ group, files }) => {
          const { title, action } = SKIPPED_GROUP_COPY[group]
          const groupCount = files.length + (group === 'not-activity' ? unsupportedFiles : 0)
          const shown = showsAction(files)
          // The first file is shown under the count line, so the list leaves it out.
          const beneath = files.filter((file) => file !== first)
          return (
            <div key={group} className="rejected-files__group">
              <p className="rejected-files__title">
                <strong>{title(groupCount)}</strong>
              </p>
              {shown && <p className="rejected-files__action">{action}</p>}
              {beneath.length > 0 && (
                <ul className="rejected-files__list">
                  {keyByContent(beneath, (file) => file.fileName).map(({ key, item: file }) => (
                    <li key={key}>{fileLine(file, shown)}</li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </details>
      <HowToGetFilesButton />
    </div>
  )
}

/** A file's name and its reason in plain words. The group's advice is left out when it gives it. */
function fileLine(file: RejectedFile, groupGivesAction: boolean): string {
  return `${file.fileName}: ${rejectionCopy(file, groupGivesAction)}`
}

/**
 * Whether a group shows its suggested action. A lone file whose own line gives the action does not
 * repeat it.
 */
function showsAction(files: RejectedFile[]): boolean {
  const [only, ...others] = files
  return only === undefined || others.length > 0 || !lineNamesAction(only)
}

/** Whether the group a file is in shows its suggested action. */
function groupShowsAction(groups: SkippedFiles[], file: RejectedFile): boolean {
  const group = groups.find(({ files }) => files.includes(file))
  return group !== undefined && showsAction(group.files)
}

/** Unsupported files are counted in the "not an activity file" group, which is shown even with no names. */
function withUnsupported(groups: SkippedFiles[], unsupportedFiles: number): SkippedFiles[] {
  if (unsupportedFiles === 0 || groups.some((group) => group.group === 'not-activity'))
    return groups
  return [{ group: 'not-activity', files: [] }, ...groups]
}
