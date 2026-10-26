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
          <p className="secondary">{topic.detail}</p>
        </details>
      )}
    </>
  )
}

export interface MethodologyProps {
  /** The topics to list, in this order. Every topic when none is given. */
  topics?: readonly TopicId[]
  /** Starts open. The landing page keeps it closed. */
  open?: boolean
}

/** The assumptions behind the numbers, under one heading that is never inside its disclosure. */
export function Methodology({
  topics = TOPICS.map((topic) => topic.id),
  open = false,
}: MethodologyProps) {
  return (
    <section className="methodology" aria-labelledby={SECTION_ID.how}>
      <h2 id={SECTION_ID.how} tabIndex={-1}>
        How this works and what it assumes
      </h2>
      <details className="methodology__disclosure" open={open}>
        <summary>Show the assumptions</summary>
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
      </details>
    </section>
  )
}
