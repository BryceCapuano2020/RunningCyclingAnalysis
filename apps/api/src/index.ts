import { createApp } from './app.ts'
import type { Bindings } from './env.ts'
import { systemDeps } from './deps.ts'
import { runMaintenance } from './maintenance.ts'
import { handleStateBatch } from './state/consumer.ts'
import type { StateMessage } from './state/message.ts'

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
