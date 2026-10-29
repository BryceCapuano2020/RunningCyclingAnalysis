import { useEffect, useState } from 'react'
import { readSeenNotes, writeSeenNotes } from '../aboutDataStore'
import type { SeenNotes } from '../aboutDataStore'
import './AboutData.css'

/** A note about the visitor's data. Its id is stable and its count is what it says, so a new count is news. */
export interface AboutNote {
  id: string
  count: number
  text: string
}

export interface AboutDataProps {
  /** The notes about the visitor's data that need no action. */
  notes: AboutNote[]
}

/**
 * The notes about the visitor's data that need no action, such as the runs left out at walking pace, in
 * one "About your data" disclosure rather than a line each. A note is shown on the first visit that has
 * it and not on the visits after, until what it says changes, such as its count: a visitor who has read
 * it does not meet it again at the top of every page. A note stays for the whole of the visit it was
 * first shown on, on the pages that carry it.
 */
export function AboutData({ notes }: AboutDataProps) {
  // What earlier visits showed, read once when the app opens.
  const [before] = useState(readSeenNotes)
  const [thisVisit, setThisVisit] = useState<SeenNotes>({})
  const fresh = notes.filter(
    (note) => before[note.id] !== note.count && thisVisit[note.id] !== note.count,
  )
  // Noted during render, so the first frame already shows the note.
  if (fresh.length > 0) {
    setThisVisit({
      ...thisVisit,
      ...Object.fromEntries(fresh.map((note) => [note.id, note.count])),
    })
  }
  const shown = notes.filter(
    (note) => thisVisit[note.id] === note.count || fresh.some((f) => f.id === note.id),
  )
  useEffect(() => {
    if (Object.keys(thisVisit).length > 0) writeSeenNotes({ ...before, ...thisVisit })
  }, [before, thisVisit])
  if (shown.length === 0) return null
  return (
    <details className="about-data">
      <summary>About your data</summary>
      <ul>
        {shown.map((note) => (
          <li key={note.id}>{note.text}</li>
        ))}
      </ul>
    </details>
  )
}
