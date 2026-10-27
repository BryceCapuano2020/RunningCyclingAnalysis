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
 * behind Show the files. The files the export does not list, such as saved routes, are one line. When
 * no group would have a line to show, the headline and that first file are text, with nothing to open.
 */
export function RejectedFiles({ outcome, rejected, unsupportedFiles }: RejectedFilesProps) {
  const tally = tallyOf(outcome, rejected)
  if (skippedTotal(tally) === 0) return null
  const groups = groupRejected([...rejected, ...outcome.duplicates])
  const problems = groups['need-a-look']
  const carriers = adviceCarriers(problems)
  const first = problems[0]
  // The first file is shown under the headline, so the group's list leaves it out.
  const beneath = problems.filter((file) => file !== first)
  const lines = beneath.length + unsupportedFiles
  const headline = tallySentence(tally)
  const firstLine = first === undefined ? null : fileLine(first, carriers)
  // The headline already says the files the export does not list, so they alone are nothing to open.
  const detailed = lines + tally.otherSports + tally.alreadyAdded > 0
  const guides = tally.needLook + tally.otherSports + tally.alreadyAdded > 0
  return (
    <div className="rejected-files">
      {detailed ? (
        <details>
          <summary>
            <span>{headline}</span>
            {firstLine !== null && <span className="rejected-files__first">{firstLine}</span>}
          </summary>
          {lines > 0 && (
            <NeedALook
              count={tally.needLook}
              files={beneath}
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
              <p className="rejected-files__title">{unlistedTitle(tally.unlisted)}</p>
            </div>
          )}
        </details>
      ) : (
        <>
          <p className="rejected-files__tally">{headline}</p>
          {firstLine !== null && <p className="rejected-files__first">{firstLine}</p>}
        </>
      )}
      {guides && <HowToGetFilesButton />}
    </div>
  )
}

/**
 * A group's title, a heading of the notice region, set in the weight of the text round it. The line
 * for the files the export does not list has no group under it, so it is a paragraph in the same look.
 */
function Title({ children }: { children: string }) {
  return <h2 className="rejected-files__title">{children}</h2>
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
      <Title>{groupTitle('need-a-look', count)}</Title>
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
      <Title>{groupTitle('other-sports', count)}</Title>
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
      <Title>{groupTitle('already-added', count)}</Title>
      <p className="rejected-files__action">{ALREADY_ADDED_NOTE}</p>
      <ul className="rejected-files__list">
        <FileList files={files} carriers={NO_CARRIERS} />
      </ul>
    </div>
  )
}
