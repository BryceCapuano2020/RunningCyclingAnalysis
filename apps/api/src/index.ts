import { createApp } from './app.ts'
import type { Bindings } from './env.ts'
import { systemDeps } from './deps.ts'
import { runMaintenance } from './maintenance.ts'

const app = createApp()

export default {
  fetch: (request: Request, env: Bindings, ctx: ExecutionContext) => app.fetch(request, env, ctx),
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
} satisfies ExportedHandler<Bindings>
