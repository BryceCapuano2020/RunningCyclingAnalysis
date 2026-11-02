import { GAP_MARK } from '../recordRow'
import { GapTerm } from './GapTerm'

/** A short mark beside a record's figure, as a chip. GAP carries its meaning one press away. */
export function RecordTag({ tag }: { tag: string }) {
  return <span className="chip">{tag === GAP_MARK ? <GapTerm /> : tag}</span>
}
