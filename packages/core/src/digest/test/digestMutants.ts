/**
 * Damaged copies of a digest, for tests that hold every reader of a digest to the same verdict.
 * Each mutant is JSON text, as it travels, so the numbers JSON cannot hold (1e999, which reads as
 * Infinity) are real. The generator is deterministic and knows nothing of the rules: it breaks each
 * field of a valid digest in every way that has gone wrong before, and the readers say whether
 * the result is a digest.
 */

export type Wire = Record<string, unknown>

/**
 * What a mutant is for, where a reader may differ from another on purpose:
 * `forward` is a name or distance a newer build could add, which a stored or device reader drops and
 * a create refuses; `bests-without-distance` is a run with bests and no distance, which a create refuses.
 */
export type MutantTag = 'forward' | 'bests-without-distance'

export interface Mutant {
  /** Where and how the digest was broken, for a failure message. */
  name: string
  /** For a `forward` mutant: the digest it is once the name nobody knows is taken out. */
  repaired?: unknown
  json: string
  /** The JSON read back: what a reader is handed. */
  wire: unknown
  tags: MutantTag[]
}

/** Stands in for a value JSON cannot write; swapped for the text after stringifying. */
const SENTINEL = '"__SENTINEL__"'

const REPLACEMENTS: Array<[string, unknown]> = [
  ['null', null],
  ['a string', 'x'],
  ['true', true],
  ['zero', 0],
  ['minus one', -1],
  ['a fraction', 0.5],
  ['1e300', 1e300],
  ['-1e300', -1e300],
  ['a number past the safe integers', 2 ** 53 + 2],
  ['an empty array', []],
  ['an empty object', {}],
]

/** Numeric roots with the values on each side of their bounds. */
const BOUNDARIES: Record<string, number[]> = {
  startMs: [-1, 0, 4102444800000, 4102444800001, 8.64e15, 8.64e15 + 1],
  durationS: [0, 604800, 604801, 1.5],
  distanceM: [0, 25_000_000, 25_000_001],
  elevationGainM: [1_000_000, 1_000_001],
  maxHeartRate: [0, 300, 301],
  modelRevision: [0, 1, 1_000_000, 1_000_001, 2 ** 53],
  movingS: [0, 604801],
}

function clone(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}

type Step = string | number

function isContainer(value: unknown): value is Wire | unknown[] {
  return typeof value === 'object' && value !== null
}

function stepsOf(value: unknown): Step[] {
  if (Array.isArray(value)) {
    return value.length === 0 ? [] : [...new Set([0, value.length - 1])]
  }
  return Object.keys(value as Wire)
}

/** Every path to a node, arrays visited at their first and last element only. */
function paths(value: unknown, prefix: Step[] = []): Step[][] {
  const found: Step[][] = []
  if (!isContainer(value)) return found
  for (const step of stepsOf(value)) {
    const next = [...prefix, step]
    found.push(next)
    found.push(...paths((value as Record<Step, unknown>)[step], next))
  }
  return found
}

function nameOf(path: Step[]): string {
  return (
    path.map((step) => (typeof step === 'number' ? `[${step}]` : `.${step}`)).join('') || 'digest'
  )
}

function at(root: unknown, path: Step[]): unknown {
  let node = root
  for (const step of path) node = (node as Record<Step, unknown>)[step]
  return node
}

/** A copy with the value at `path` replaced, or deleted when `replace` is the sentinel `DELETE`. */
const DELETE = Symbol('delete')
function withValue(base: Wire, path: Step[], replace: unknown): unknown {
  const copy = clone(base)
  const parent = at(copy, path.slice(0, -1)) as Record<Step, unknown>
  const last = path[path.length - 1]!
  if (replace === DELETE) {
    if (Array.isArray(parent)) parent.splice(last as number, 1)
    else delete parent[last]
  } else {
    parent[last] = replace
  }
  return copy
}

/** The text of a value, with the sentinel swapped for 1e999. */
function textOf(value: unknown): string {
  return JSON.stringify(value).replace(SENTINEL, '1e999')
}

export function mutantsOf(base: Wire): Mutant[] {
  const mutants: Mutant[] = []
  const add = (name: string, value: unknown, tags: MutantTag[] = [], repaired?: unknown): void => {
    const json = textOf(value)
    mutants.push({
      name,
      json,
      wire: JSON.parse(json),
      tags,
      ...(repaired === undefined ? {} : { repaired }),
    })
  }

  for (const path of paths(base)) {
    const name = nameOf(path)
    const node = at(base, path)
    add(`delete ${name}`, withValue(base, path, DELETE))
    for (const [label, replacement] of REPLACEMENTS) {
      // A string in the place of a flag's kind is a kind nobody knows: the flag is dropped.
      const unknownKind = replacement === 'x' && path[0] === 'flags' && path[2] === 'kind'
      const without = unknownKind ? (base.flags as unknown[]).filter((_, i) => i !== path[1]) : []
      add(
        `${name} as ${label}`,
        withValue(base, path, replacement),
        unknownKind ? ['forward'] : [],
        unknownKind ? { ...base, flags: without } : undefined,
      )
    }
    add(`${name} as infinity`, withValue(base, path, '__SENTINEL__'))
    if (typeof node === 'number') {
      add(`${name} one more`, withValue(base, path, node + 1))
      add(`${name} one less`, withValue(base, path, node - 1))
    }
    if (isContainer(node) && !Array.isArray(node)) {
      const copy = clone(base)
      ;(at(copy, path) as Wire).__unknown__ = { nested: [1, 2, 3] }
      // Every key of flagCounts is a quality kind, so a key nobody knows is a kind nobody knows.
      if (path[path.length - 1] === 'flagCounts') {
        add(`an unknown key in ${name}`, copy, ['forward'], base)
      } else {
        add(`an unknown key in ${name}`, copy)
      }
    }
    if (Array.isArray(node) && node.length > 0) {
      for (const extra of [1, 60, node.length * 4 + 1]) {
        const longer = [...node, ...Array.from({ length: extra }, () => node[node.length - 1])]
        add(`${name} ${extra} longer`, withValue(base, path, longer))
      }
    }
  }
  const root = clone(base) as Wire
  root.__unknown__ = 1
  add('an unknown key in the digest', root)

  for (const [key, values] of Object.entries(BOUNDARIES)) {
    for (const value of values) add(`${key} = ${value}`, { ...base, [key]: value })
  }
  const set = (name: string, values: Wire, tags: MutantTag[] = []): void =>
    add(name, { ...base, ...values }, tags)
  set('another sport', { sport: 'swim' })
  set('a ride with a walking pace', { sport: 'ride', walkingPace: true })
  set('a walking pace that is not true', { walkingPace: false })
  set('a race that is not true', { race: false })
  set('a race', { race: true })
  set('a moving time past the duration', { movingS: 1e9 })
  set('a power source nobody knows', { powerSource: 'guess' })
  set('another version', { version: 2 })
  set('bests with no distance', { distanceM: null }, ['bests-without-distance'])
  set('bests on a ride', { sport: 'ride' })
  addForward(base, add)
  return mutants
}

/** The names and distances a newer build could add. */
function addForward(
  base: Wire,
  add: (name: string, value: unknown, tags?: MutantTag[], repaired?: unknown) => void,
): void {
  const flag = { kind: 'gremlin', start: 0, end: 1, message: 'm' }
  add('a quality kind nobody knows in flags', { ...base, flags: [flag] }, ['forward'], {
    ...base,
    flags: [],
  })
  add(
    'a quality kind nobody knows in the counts',
    { ...base, flagCounts: { gremlin: 1 } },
    ['forward'],
    { ...base, flagCounts: {} },
  )
  // A kind is a string: a number or an object in its place is damage, not another build's name.
  for (const damage of [null, 7, {}, []]) {
    const name = `a quality kind that is ${JSON.stringify(damage)}`
    add(name, { ...base, flags: [{ ...flag, kind: damage }] })
  }
  if (Array.isArray(base.distanceBests) && base.distanceBests.length > 0) {
    const [first, ...rest] = base.distanceBests as Wire[]
    add(
      'a record distance nobody knows',
      { ...base, distanceBests: [{ ...first, distanceM: 2000 }, ...rest] },
      ['forward'],
      { ...base, distanceBests: rest },
    )
  }
  const distributions = base.distributions
  if (isContainer(distributions)) {
    add('a measure nobody knows', { ...base, distributions: { ...distributions, cadence: {} } })
  }
}
