import type { RejectedFile } from '../../core/session'
import { plural } from './plural'
import './RejectedFiles.css'

export interface RejectedFilesProps {
  rejected: RejectedFile[]
  /** GPX and TCX files skipped. They are counted, not listed. */
  unsupportedFiles: number
}

/** File names listed per reason. The rest are summarised. */
const NAMES_PER_GROUP = 50

interface ReasonGroup {
  reason: string
  fileNames: string[]
}

/** Groups in the order each reason first appears. */
function groupByReason(rejected: RejectedFile[]): ReasonGroup[] {
  const groups = new Map<string, string[]>()
  for (const file of rejected) {
    const names = groups.get(file.reason)
    if (names) names.push(file.fileName)
    else groups.set(file.reason, [file.fileName])
  }
  return [...groups].map(([reason, fileNames]) => ({ reason, fileNames }))
}

function unsupportedCopy(count: number): string {
  const verb = count === 1 ? 'was' : 'were'
  return `${plural(count, 'GPX or TCX file')} ${verb} skipped. Only FIT files carry the detail this analysis needs`
}

export function RejectedFiles({ rejected, unsupportedFiles }: RejectedFilesProps) {
  if (rejected.length === 0 && unsupportedFiles === 0) return null
  const groups = groupByReason(rejected)
  return (
    <section className="rejected-files">
      {unsupportedFiles > 0 && (
        <p className="rejected-files__unsupported">{unsupportedCopy(unsupportedFiles)}</p>
      )}
      {rejected.length > 0 && (
        <details>
          <summary>{`${plural(rejected.length, 'file')} could not be used`}</summary>
          {groups.map((group) => {
            const shown = group.fileNames.slice(0, NAMES_PER_GROUP)
            const more = group.fileNames.length - shown.length
            return (
              <details key={group.reason} className="rejected-files__group">
                <summary>{`${group.reason}: ${plural(group.fileNames.length, 'file')}`}</summary>
                <ul className="rejected-files__list">
                  {shown.map((name, index) => (
                    <li key={`${name}-${index}`}>{name}</li>
                  ))}
                  {more > 0 && <li>{`and ${more} more`}</li>}
                </ul>
              </details>
            )
          })}
        </details>
      )}
    </section>
  )
}
