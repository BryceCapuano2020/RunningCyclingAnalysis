import { SECTION_ID, topicOf, TOPICS, type TopicId } from './methodTopics'
import './Methodology.css'

/** A topic's plain words, with its technical detail behind a named More detail disclosure. */
export function TopicBody({ id }: { id: TopicId }) {
  const topic = topicOf(id)
  return (
    <>
      {topic.plain.map((line) => (
        <p key={line} className="secondary">
          {line}
        </p>
      ))}
      {topic.detail && (
        <details className="methodology__detail">
          <summary>
            More detail<span className="sr-only">: {topic.title}</span>
          </summary>
          {topic.detail.map((line) => (
            <p key={line} className="secondary">
              {line}
            </p>
          ))}
        </details>
      )}
    </>
  )
}

export interface MethodologyProps {
  /** The topics to list, in this order. Every topic when none is given. */
  topics?: readonly TopicId[]
  /** Shown at once, with no disclosure to open. Closed, the topics sit behind Show the assumptions. */
  open?: boolean
}

/** The assumptions behind the numbers, under one heading that is never inside its disclosure. */
export function Methodology({
  topics = TOPICS.map((topic) => topic.id),
  open = false,
}: MethodologyProps) {
  const sections = (
    <div className="methodology__sections">
      {topics.map((id) => {
        const topic = topicOf(id)
        return (
          <section key={id} className="methodology__section" aria-labelledby={`method-${id}`}>
            <h3 id={`method-${id}`}>{topic.title}</h3>
            <TopicBody id={id} />
          </section>
        )
      })}
    </div>
  )
  return (
    <section className="methodology" aria-labelledby={SECTION_ID.how}>
      <h2 id={SECTION_ID.how} tabIndex={-1}>
        How this works and what it assumes
      </h2>
      {open ? (
        sections
      ) : (
        <details className="methodology__disclosure">
          <summary>Show the assumptions</summary>
          {sections}
        </details>
      )}
    </section>
  )
}
