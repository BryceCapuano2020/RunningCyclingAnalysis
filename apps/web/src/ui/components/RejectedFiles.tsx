import type { RejectedFile } from '@rca/core/session'
import {
  adviceCarriers,
  ALREADY_ADDED_NOTE,
  bySport,
  groupRejected,
  groupTitle,
  rejectionCopy,
  unlistedTitle,
  unreadFormatsCopy,
} from '../analysis/rejectCopy'
import { skippedTotal, tallyOf, tallySentence } from '../analysis/skipTally'
import type { Counted } from '../analysis/skipTally'
import { keyByContent } from '../contentKeys'
import { formatCount } from '../format/count'
import { HowToGetFilesButton } from './HowToGetFiles'
import './RejectedFiles.css'

export interface RejectedFilesProps {
  /** What the import read: its counts, which the headline adds up. */
  outcome: Counted
  /** Files the import could not use, and those of other sports. */
  rejected: RejectedFile[]
  /** Activity files in a format this app does not read. They are counted, not listed. */
  unsupportedFiles: number
}

type Carriers = ReadonlySet<RejectedFile>

/**
 * What an import did with its files: one headline that adds up to all of them, which opens the
 * groups, with the first file that needs a look under it in both states. The files that need a look
 * are listed, one line each. The other sports are one line each with their count, and their files sit
 * behind Show the files. The files the export does not list, such as saved routes, are one line.
 */
export function RejectedFiles({ outcome, rejected, unsupportedFiles }: RejectedFilesProps) {
  const tally = tallyOf(outcome, rejected)
  if (skippedTotal(tally) === 0) return null
  const headline = tallySentence(tally)
  // Unlisted files alone are already said by the headline, so there is nothing to open.
  if (tally.needLook + tally.otherSports + tally.alreadyAdded === 0) {
    return (
      <div className="rejected-files">
        <p className="rejected-files__tally">{headline}</p>
      </div>
    )
  }
  const groups = groupRejected([...rejected, ...outcome.duplicates])
  const problems = groups['need-a-look']
  const carriers = adviceCarriers(problems)
  const first = problems[0]
  return (
    <div className="rejected-files">
      <details>
        <summary>
          <span>{headline}</span>
          {first !== undefined && (
            <span className="rejected-files__first">{fileLine(first, carriers)}</span>
          )}
        </summary>
        {tally.needLook > 0 && (
          <NeedALook
            count={tally.needLook}
            // The first file is shown under the headline, so the list leaves it out.
            files={problems.filter((file) => file !== first)}
            carriers={carriers}
            unsupportedFiles={unsupportedFiles}
            namesNotActivity={problems.some((file) => file.code === 'not-activity')}
          />
        )}
        {tally.otherSports > 0 && (
          <OtherSports count={tally.otherSports} files={groups['other-sports']} />
        )}
        {tally.alreadyAdded > 0 && (
          <AlreadyAdded count={tally.alreadyAdded} files={groups['already-added']} />
        )}
        {tally.unlisted > 0 && (
          <div className="rejected-files__group">
            <p className="rejected-files__title">
              <strong>{unlistedTitle(tally.unlisted)}</strong>
            </p>
          </div>
        )}
      </details>
      <HowToGetFilesButton />
    </div>
  )
}

/** A file's name and its reason in plain words, with the advice when its line carries it. */
function fileLine(file: RejectedFile, carriers: Carriers): string {
  return `${file.fileName}: ${rejectionCopy(file, carriers.has(file))}`
}

function FileList({ files, carriers }: { files: RejectedFile[]; carriers: Carriers }) {
  return (
    <>
      {keyByContent(files, (file) => file.fileName).map(({ key, item: file }) => (
        <li key={key}>{fileLine(file, carriers)}</li>
      ))}
    </>
  )
}

const NO_CARRIERS: Carriers = new Set()

/** The files that need a look, one line each, with the files in a format the app does not read counted last. */
function NeedALook(props: {
  count: number
  files: RejectedFile[]
  carriers: Carriers
  unsupportedFiles: number
  namesNotActivity: boolean
}) {
  const { count, files, carriers, unsupportedFiles, namesNotActivity } = props
  return (
    <div className="rejected-files__group">
      <p className="rejected-files__title">
        <strong>{groupTitle('need-a-look', count)}</strong>
      </p>
      {(files.length > 0 || unsupportedFiles > 0) && (
        <ul className="rejected-files__list">
          <FileList files={files} carriers={carriers} />
          {unsupportedFiles > 0 && (
            <li>{unreadFormatsCopy(unsupportedFiles, !namesNotActivity)}</li>
          )}
        </ul>
      )}
    </div>
  )
}

function OtherSports({ count, files }: { count: number; files: RejectedFile[] }) {
  const sports = bySport(files)
  return (
    <div className="rejected-files__group">
      <p className="rejected-files__title">
        <strong>{groupTitle('other-sports', count)}</strong>
      </p>
      <ul className="rejected-files__list">
        {sports.map(({ label, files: members }) => (
          <li key={label}>{`${label}: ${formatCount(members.length)}`}</li>
        ))}
      </ul>
      <details className="rejected-files__files">
        <summary>Show the files</summary>
        <ul className="rejected-files__list">
          <FileList files={sports.flatMap((sport) => sport.files)} carriers={NO_CARRIERS} />
        </ul>
      </details>
    </div>
  )
}

function AlreadyAdded({ count, files }: { count: number; files: RejectedFile[] }) {
  return (
    <div className="rejected-files__group">
      <p className="rejected-files__title">
        <strong>{groupTitle('already-added', count)}</strong>
      </p>
      <p className="rejected-files__action">{ALREADY_ADDED_NOTE}</p>
      <ul className="rejected-files__list">
        <FileList files={files} carriers={NO_CARRIERS} />
      </ul>
    </div>
  )
}
