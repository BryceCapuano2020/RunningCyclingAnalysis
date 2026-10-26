import type { RejectedFile } from '@rca/core/session'
import {
  adviceCarriers,
  groupRejected,
  groupShowsAction,
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
 * action, unless one of its lines already carries the advice that every file in it shares.
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
  const carriers = adviceCarriers(groups, first)
  return (
    <div className="rejected-files">
      <details>
        <summary>
          <span>{skippedSentence(count)}</span>
          {first !== undefined && (
            <span className="rejected-files__first">{fileLine(first, carriers)}</span>
          )}
        </summary>
        {groups.map(({ group, files }) => {
          const { title, action } = SKIPPED_GROUP_COPY[group]
          const groupCount = files.length + (group === 'not-activity' ? unsupportedFiles : 0)
          // The first file is shown under the count line, so the list leaves it out.
          const beneath = files.filter((file) => file !== first)
          return (
            <div key={group} className="rejected-files__group">
              <p className="rejected-files__title">
                <strong>{title(groupCount)}</strong>
              </p>
              {groupShowsAction(files, carriers) && (
                <p className="rejected-files__action">{action}</p>
              )}
              {beneath.length > 0 && (
                <ul className="rejected-files__list">
                  {keyByContent(beneath, (file) => file.fileName).map(({ key, item: file }) => (
                    <li key={key}>{fileLine(file, carriers)}</li>
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

/** A file's name and its reason in plain words, with the advice when its line carries it. */
function fileLine(file: RejectedFile, carriers: ReadonlySet<RejectedFile>): string {
  return `${file.fileName}: ${rejectionCopy(file, carriers.has(file))}`
}

/** Unsupported files are counted in the "not an activity file" group, which is shown even with no names. */
function withUnsupported(groups: SkippedFiles[], unsupportedFiles: number): SkippedFiles[] {
  if (unsupportedFiles === 0 || groups.some((group) => group.group === 'not-activity'))
    return groups
  return [{ group: 'not-activity', files: [] }, ...groups]
}
