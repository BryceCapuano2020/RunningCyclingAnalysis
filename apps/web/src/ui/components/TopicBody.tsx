import { MethodLines } from './MethodLines'
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
