import { createApp } from './app.ts'
import type { Bindings } from './env.ts'
import { systemDeps } from './deps.ts'
import { runMaintenance } from './maintenance.ts'
import { handleStateBatch } from './state/consumer.ts'
import type { StateMessage } from './state/message.ts'

/*
 * Portability: the Hono handlers use fetch-style requests, so the app can run on Node, Bun or Deno with another entry
 * point; only the bindings (D1, R2, secrets) change. The Drizzle schema is SQLite; Postgres would need new migrations
 * and column types. R2 is used through the S3-compatible operations (put, get, delete), so S3 or MinIO could replace it
 * behind a small interface. Auth uses Web Crypto and fetch only. packages/core and apps/web have no Cloudflare
 * dependency: the web app is static and can be hosted anywhere.
 */
const app = createApp()

export default {
  fetch: (request: Request, env: Bindings, ctx: ExecutionContext) => app.fetch(request, env, ctx),
  /**
   * The state job's Queue (wrangler.toml [[queues.consumers]]): computes the results of
   * each account a write named.
   */
  async queue(batch: MessageBatch<StateMessage>, env: Bindings): Promise<void> {
    const report = await handleStateBatch(batch, env, systemDeps)
    console.log(JSON.stringify({ event: 'state_batch', ...report }))
  },
  /** Daily cron (wrangler.toml [triggers]): expired rows, pending deletions and orphaned objects. */
  scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext): void {
    ctx.waitUntil(
      runMaintenance(env, systemDeps).then(
        (report) => console.log(JSON.stringify({ event: 'maintenance', ...report })),
        (error: unknown) =>
          console.error(
            JSON.stringify({
              event: 'maintenance_failed',
              errorClass: error instanceof Error ? error.constructor.name : typeof error,
            }),
          ),
      ),
    )
  },
} satisfies ExportedHandler<Bindings, StateMessage>
