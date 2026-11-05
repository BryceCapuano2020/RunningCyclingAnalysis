import { GAP_MARK } from '../recordRow'
import { GapTerm } from './GapTerm'

/** A short mark on a record's meta line, as plain words. GAP carries its meaning one press away. */
export function RecordTag({ tag }: { tag: string }) {
  return <span className="record-tag">{tag === GAP_MARK ? <GapTerm /> : tag}</span>
}
