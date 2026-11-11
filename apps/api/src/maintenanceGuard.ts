/** Thrown by a metered binding once the run has no operations left. Caught by the step that hit it. */
export class OperationBudgetExhausted extends Error {
  constructor() {
    super('maintenance operation budget reached')
    this.name = 'OperationBudgetExhausted'
  }
}

/** Runs one step. If the run's operation budget is spent, the step ends and returns its fallback. */
export async function within<T>(fallback: T, step: () => Promise<T>): Promise<T> {
  try {
    return await step()
  } catch (error) {
    if (error instanceof OperationBudgetExhausted) return fallback
    throw error
  }
}

/** The class of an error, the only detail a maintenance failure logs. */
export function errorClass(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error
}

/**
 * Runs one maintenance step whose failure must not stop the run. An error in it ends only this
 * step: it returns its fallback and logs one line naming the event and the error's class.
 */
export async function guarded<T>(event: string, fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    console.error(JSON.stringify({ event, errorClass: errorClass(error) }))
    return fallback
  }
}
