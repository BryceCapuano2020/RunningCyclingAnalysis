import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { ActivityNameSchema, MAX_ACTIVITY_NAME_CHARS } from '@rca/contract'
import { useDeleteOutcome } from '../useDeleteOutcome'
import { PageHeading } from './PageHeading'
import './ActivityTitle.css'

export interface ActivityTitleProps {
  /** The activity's name as the library holds it now. */
  name: string
  /** The saved copy a rename changes, or null when there is none (the sample, a file not kept): then the name is fixed. */
  savedId: string | null
  /** Saves the name. Absent: the name is fixed. The library's notice or error then says how it ended. */
  onRename?: (savedId: string, name: string) => void
  libraryNotice: string | null
  libraryError: string | null
}

const INVALID = `Use 1 to ${MAX_ACTIVITY_NAME_CHARS} characters, with no line breaks.`

/**
 * The activity page's title, with an Edit name control beside it. Editing swaps the title for a text field with Save
 * and Cancel: Enter saves, Escape cancels. The field stays open, with the reason, when the save fails. The heading
 * stays in the page for a screen reader while the field is shown.
 */
export function ActivityTitle({
  name,
  savedId,
  onRename,
  libraryNotice,
  libraryError,
}: ActivityTitleProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const openRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Set when the field closes, so focus goes back to Edit name; cleared when it opens again.
  const [refocus, setRefocus] = useState(false)
  const outcome = useDeleteOutcome(libraryNotice, libraryError)
  const errorId = useId()

  // The answer to the save: a saved name closes the field, and a refusal is shown beside it.
  const settled = outcome.outcome
  if (saving && settled !== null) {
    setSaving(false)
    if (!settled.failed) {
      setRefocus(true)
      setEditing(false)
    }
  }

  useEffect(() => {
    if (editing) inputRef.current?.select()
    else if (refocus) openRef.current?.focus()
  }, [editing, refocus])

  const cancel = () => {
    if (saving) return
    setRefocus(true)
    setProblem(null)
    outcome.clear()
    setEditing(false)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (saving || savedId === null || onRename === undefined) return
    const parsed = ActivityNameSchema.safeParse(draft)
    if (!parsed.success) {
      setProblem(INVALID)
      return
    }
    setProblem(null)
    if (parsed.data === name) {
      cancel()
      return
    }
    outcome.begin()
    setSaving(true)
    onRename(savedId, parsed.data)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    cancel()
  }

  if (!editing) {
    return (
      <PageHeading
        className="activity-page__title"
        action={
          savedId !== null && onRename !== undefined ? (
            <button
              ref={openRef}
              type="button"
              className="btn activity-title__edit"
              onClick={() => {
                setDraft(name)
                setRefocus(false)
                setProblem(null)
                outcome.clear()
                setEditing(true)
              }}
            >
              Edit name
            </button>
          ) : undefined
        }
      >
        {name}
      </PageHeading>
    )
  }

  const shown = problem ?? (settled?.failed ? settled.text : null)
  return (
    <>
      <PageHeading className="activity-page__title sr-only">{name}</PageHeading>
      <form className="activity-title__form" onSubmit={submit} noValidate>
        <label className="activity-title__label" htmlFor={`${errorId}-name`}>
          Activity name
        </label>
        <input
          ref={inputRef}
          id={`${errorId}-name`}
          className="activity-title__input"
          type="text"
          value={draft}
          maxLength={MAX_ACTIVITY_NAME_CHARS}
          autoComplete="off"
          aria-invalid={shown !== null}
          aria-describedby={shown === null ? undefined : errorId}
          onChange={(event) => {
            setDraft(event.target.value)
            setProblem(null)
          }}
          onKeyDown={onKeyDown}
        />
        <div className="activity-title__actions">
          <button type="submit" className="btn btn-primary" aria-disabled={saving}>
            Save
          </button>
          <button type="button" className="btn" aria-disabled={saving} onClick={cancel}>
            Cancel
          </button>
        </div>
        {shown !== null && (
          <p id={errorId} role="alert" className="activity-title__problem">
            {shown}
          </p>
        )}
      </form>
    </>
  )
}
