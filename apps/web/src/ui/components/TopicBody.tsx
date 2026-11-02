import { MethodLines } from './MethodLines'
import { topicOf, type TopicId } from './methodTopics'
import './TopicBody.css'

/** A disclosure for the technical detail behind some lines, named by what it is the detail of. */
export function MoreDetail({ about, lines }: { about: string; lines: readonly string[] }) {
  return (
    <details className="more-detail">
      <summary>
        More detail<span className="sr-only">: {about}</span>
      </summary>
      <MethodLines lines={lines} />
    </details>
  )
}

/** A topic's plain words, with its technical detail behind a named More detail disclosure. */
export function TopicBody({ id }: { id: TopicId }) {
  const topic = topicOf(id)
  return (
    <>
      <MethodLines lines={topic.plain} />
      {topic.detail && <MoreDetail about={topic.title} lines={topic.detail} />}
    </>
  )
}
