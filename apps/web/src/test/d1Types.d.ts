/*
 * The shape of Cloudflare's D1 the API's state inputs read through (apps/api/src/state/inputs.ts), for the web project's
 * typecheck. The server-equivalence test imports the API's compute, which names the type; the web project has the browser's
 * globals, not the Workers ones. Only the calls `readInputs` makes are declared, and it is never called from the web.
 */
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<Row>(): Promise<Row | null>
  all<Row>(): Promise<{ results: Row[] }>
}
interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch(statements: D1PreparedStatement[]): Promise<{ results: unknown[] }[]>
}
