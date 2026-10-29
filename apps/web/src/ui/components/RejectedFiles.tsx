import { useState } from 'react'
import type { ReactNode } from 'react'
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
import type { Counted, SkipTally } from '../analysis/skipTally'
import { keyByContent } from '../contentKeys'
import { formatCount } from '../format/count'
import { plural } from './plural'
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
 * A disclosure that holds nothing while it is shut. A shut `details` still has its list in the page,
 * and a list of hundreds of files copied from it pastes as hundreds of empty bullets, so the list
 * is made when the disclosure opens and gone when it shuts.
 */
function Disclosure({
  summary,
  className,
  children,
}: {
  summary: ReactNode
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <details className={className} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{summary}</summary>
      {open && children}
    </details>
  )
}

/** The summary's few words: what needs a look first, and otherwise what was left out. */
function summaryLabel(tally: SkipTally): string {
  const { needLook, otherSports, alreadyAdded } = tally
  if (needLook > 0) return `${plural(needLook, 'file')} ${needLook === 1 ? 'needs' : 'need'} a look`
  if (otherSports > 0) return `${plural(otherSports, 'file')} of other sports left out`
  return `${plural(alreadyAdded, 'copy', 'copies')} already added`
}

/**
 * What an import did with its files, as one line with a disclosure. The line says what needs a look, or
 * else what was left out. Under it, the headline adds up to all of the files, then each group lists
 * its files once: the ones that need a look, one line each, then the other sports, one line each with
 * their count and their files behind Show the files, then the copies already added. The files the
 * export does not list, such as saved routes, are one line. When no group would have a line to show,
 * the headline is text with nothing to open.
 */
export function RejectedFiles({ outcome, rejected, unsupportedFiles }: RejectedFilesProps) {
  const tally = tallyOf(outcome, rejected)
  if (skippedTotal(tally) === 0) return null
  const groups = groupRejected([...rejected, ...outcome.duplicates])
  const problems = groups['need-a-look']
  const carriers = adviceCarriers(problems)
  const headline = tallySentence(tally)
  // The headline already says the files the export does not list, so they alone are nothing to open.
  const detailed = problems.length + unsupportedFiles + tally.otherSports + tally.alreadyAdded > 0
  return (
    <div className="rejected-files">
      {detailed ? (
        <Disclosure summary={summaryLabel(tally)}>
          <p className="rejected-files__tally">{headline}</p>
          {problems.length + unsupportedFiles > 0 && (
            <NeedALook
              count={tally.needLook}
              files={problems}
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
          <HowToGetFilesButton />
        </Disclosure>
      ) : (
        <p className="rejected-files__tally">{headline}</p>
      )}
    </div>
  )
}

/**
 * A group's title, a heading of the notice region, set in bold, heavier than the text round it. The line
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
      <Disclosure summary="Show the files" className="rejected-files__files">
        <ul className="rejected-files__list">
          <FileList files={sports.flatMap((sport) => sport.files)} carriers={NO_CARRIERS} />
        </ul>
      </Disclosure>
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
