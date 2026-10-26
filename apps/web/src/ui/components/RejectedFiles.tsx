import type { RejectedFile } from '@rca/core/session'
import { groupRejected, rejectionCopy, SKIPPED_GROUP_COPY } from '../analysis/rejectCopy'
import type { SkippedFiles } from '../analysis/rejectCopy'
import { skippedSentence } from '../analysis/copy'
import { keyByContent } from '../contentKeys'
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
 * The files an import skipped: the first one's reason in plain words, then one neutral line that
 * opens the groups. Each group says what the files are and gives one suggested action.
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
      {first !== undefined && (
        <p className="rejected-files__first">{`${first.fileName}: ${rejectionCopy(first)}`}</p>
      )}
      <details>
        <summary>{skippedSentence(count)}</summary>
        {groups.map(({ group, files }) => {
          const { title, action } = SKIPPED_GROUP_COPY[group]
          const groupCount = files.length + (group === 'not-activity' ? unsupportedFiles : 0)
          return (
            <div key={group} className="rejected-files__group">
              <p className="rejected-files__title">
                <strong>{title(groupCount)}</strong>
              </p>
              <p className="rejected-files__action">{action}</p>
              {files.length > 0 && (
                <ul className="rejected-files__list">
                  {keyByContent(files, (file) => file.fileName).map(({ key, item: file }) => (
                    <li key={key}>{`${file.fileName}: ${rejectionCopy(file)}`}</li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </details>
    </div>
  )
}

/** Unsupported files are counted in the "not an activity file" group, which is shown even with no names. */
function withUnsupported(groups: SkippedFiles[], unsupportedFiles: number): SkippedFiles[] {
  if (unsupportedFiles === 0 || groups.some((group) => group.group === 'not-activity'))
    return groups
  return [{ group: 'not-activity', files: [] }, ...groups]
}
