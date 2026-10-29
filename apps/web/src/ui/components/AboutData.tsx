import { useEffect, useState } from 'react'
import './AboutData.css'

export interface AboutDataProps {
  /** The notes about the visitor's data that need no action, each a full sentence. */
  notes: string[]
}

const STORAGE_KEY = 'rca.aboutDataSeen'
/** The notes kept, newest last, so an old one is forgotten rather than the list growing for ever. */
const KEPT = 20

function readSeen(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((note) => typeof note === 'string') : []
  } catch {
    return []
  }
}

function writeSeen(notes: readonly string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes.slice(-KEPT)))
  } catch {
    // The notes then show on every visit, which is the safe way to fail.
  }
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
  const [before] = useState(readSeen)
  const [thisVisit, setThisVisit] = useState<readonly string[]>([])
  const fresh = notes.filter((note) => !before.includes(note) && !thisVisit.includes(note))
  // Noted during render, so the first frame already shows the note.
  if (fresh.length > 0) setThisVisit([...thisVisit, ...fresh])
  const shown = notes.filter((note) => thisVisit.includes(note) || fresh.includes(note))
  useEffect(() => {
    if (thisVisit.length === 0) return
    writeSeen([...before.filter((note) => !thisVisit.includes(note)), ...thisVisit])
  }, [before, thisVisit])
  if (shown.length === 0) return null
  return (
    <details className="about-data">
      <summary>About your data</summary>
      <ul>
        {shown.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </details>
  )
}
