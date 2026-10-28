/**
 * The first n indices, ordered by their values and then by index: a stable sort by comparison. It
 * is the definition of the order, which `indexOrder` reproduces faster.
 */
export function comparatorOrder(
  values: ArrayLike<number>,
  n: number,
  descending: boolean,
): number[] {
  const order: number[] = []
  for (let i = 0; i < n; i++) order.push(i)
  const sign = descending ? -1 : 1
  return order.sort((a, b) => {
    const va = values[a]!
    const vb = values[b]!
    if (va < vb) return -sign
    if (va > vb) return sign
    return 0
  })
}

const DIGIT_BITS = 11
const DIGIT_COUNT = 1 << DIGIT_BITS
const DIGIT_MASK = DIGIT_COUNT - 1
/** A 64-bit key in 11-bit digits, the last holding the top nine bits. */
const PASSES = 6

// A double's two halves, read through the same bytes, so the key's order is the double's order.
const doubleBits = new Float64Array(1)
const wordBits = new Uint32Array(doubleBits.buffer)
const LOW = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1 ? 0 : 1
const HIGH = 1 - LOW

/** The 11 bits of the 64-bit key (high, low) that start at bit `from`. */
function digitOf(high: number, low: number, from: number): number {
  if (from >= 32) return (high >>> (from - 32)) & DIGIT_MASK
  if (from + DIGIT_BITS <= 32) return (low >>> from) & DIGIT_MASK
  return ((low >>> from) | (high << (32 - from))) & DIGIT_MASK
}

/** The working arrays of one sort. Sorts are not nested, so the next sort reuses them. */
interface Scratch {
  high: Uint32Array
  low: Uint32Array
  from: Uint32Array
  to: Uint32Array
  digits: Uint16Array
  start: Uint32Array
}

let work: Scratch = {
  high: new Uint32Array(0),
  low: new Uint32Array(0),
  from: new Uint32Array(0),
  to: new Uint32Array(0),
  digits: new Uint16Array(0),
  start: new Uint32Array(DIGIT_COUNT + 1),
}

/** The working arrays, grown to hold n values. A library's sorts are all of about the same size. */
function scratch(n: number): Scratch {
  if (work.high.length < n) {
    work = {
      high: new Uint32Array(n),
      low: new Uint32Array(n),
      from: new Uint32Array(n),
      to: new Uint32Array(n),
      digits: new Uint16Array(n),
      start: work.start,
    }
  }
  return work
}

/**
 * The same order as `comparatorOrder`, by a radix sort on the values' bits, which is stable, so equal
 * values stay in index order. A double reads as an unsigned integer in the order of its value once a
 * positive one has its sign bit set and a negative one all its bits flipped; the highest value first is
 * that order inverted. Zero of either sign is one value, as the comparison has it. Comparison has no
 * order for NaN, so a NaN among the values is sorted by comparison, as before.
 */
export function indexOrder(values: ArrayLike<number>, n: number, descending: boolean): number[] {
  const { high, low, digits, start, from: ping, to: pong } = scratch(n)
  for (let i = 0; i < n; i++) {
    const value = values[i]!
    if (Number.isNaN(value)) return comparatorOrder(values, n, descending)
    doubleBits[0] = value === 0 ? 0 : value
    let h = wordBits[HIGH]!
    let l = wordBits[LOW]!
    if (h >>> 31 === 1) {
      h = ~h
      l = ~l
    } else {
      h |= 0x80000000
    }
    if (descending) {
      h = ~h
      l = ~l
    }
    high[i] = h
    low[i] = l
  }
  // Each pass writes the order it makes into the array the last one did not use.
  let from = ping
  let to = pong
  for (let i = 0; i < n; i++) from[i] = i
  for (let pass = 0; pass < PASSES; pass++) {
    const bit = pass * DIGIT_BITS
    start.fill(0)
    for (let i = 0; i < n; i++) {
      const digit = digitOf(high[i]!, low[i]!, bit)
      digits[i] = digit
      start[digit + 1]!++
    }
    // Keys that agree on this digit are already in order by it.
    if (start[(digits[0] ?? 0) + 1] === n) continue
    for (let d = 0; d < DIGIT_COUNT; d++) start[d + 1]! += start[d]!
    for (let k = 0; k < n; k++) {
      const i = from[k]!
      to[start[digits[i]!]!++] = i
    }
    ;[from, to] = [to, from]
  }
  return Array.from(from.subarray(0, n))
}
