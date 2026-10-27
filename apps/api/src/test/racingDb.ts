/**
 * Wraps a D1 binding so that `before` runs once, just before the first statement whose SQL matches
 * `match` executes: a stand-in for another request that changes the database between two steps of
 * this one.
 */
export function racingDb(
  target: D1Database,
  match: RegExp,
  before: () => Promise<void>,
): D1Database {
  let fired = false
  const race = async () => {
    if (fired) return
    fired = true
    await before()
  }
  const hooked = (statement: D1PreparedStatement): D1PreparedStatement =>
    new Proxy(statement, {
      get(obj, prop) {
        const value: unknown = Reflect.get(obj, prop, obj)
        if (typeof value !== 'function') return value
        if (prop === 'bind') {
          return (...args: unknown[]) =>
            hooked(Reflect.apply(value, obj, args) as D1PreparedStatement)
        }
        if (prop === 'first' || prop === 'run' || prop === 'all' || prop === 'raw') {
          return async (...args: unknown[]) => {
            await race()
            return Reflect.apply(value, obj, args)
          }
        }
        return value.bind(obj)
      },
    })
  return new Proxy(target, {
    get(obj, prop) {
      const value: unknown = Reflect.get(obj, prop, obj)
      if (prop === 'prepare' && typeof value === 'function') {
        return (query: string) => {
          const statement = Reflect.apply(value, obj, [query]) as D1PreparedStatement
          return match.test(query) ? hooked(statement) : statement
        }
      }
      return typeof value === 'function' ? value.bind(obj) : value
    },
  })
}
