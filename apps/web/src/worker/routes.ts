import type { ActivityRecord } from '@rca/contract'
import type { RouteShape } from '@rca/core/route/routeShape'
import { originalActivity } from './originalActivity'
import type { WorkerRequest, WorkerResponse } from './protocol'

/** A route request, as the worker receives it. */
export type RouteRequest = Extract<WorkerRequest, { type: 'routeShape' }>

/** The requests the route memory answers: a route, or the forgetting of this tab's routes. */
export type RouteMemoryRequest = Extract<WorkerRequest, { type: 'routeShape' | 'forgetRoutes' }>

/** A route as a reply gives it: the shape, or the fact that it is in an original not yet read. */
interface RouteAnswer {
  route: RouteShape | null
  original: boolean
}

/**
 * The route shapes this worker answers for, held in its memory only. A shape is the one of a file
 * imported in this tab, or the one read from an original file the first time it is asked for. It is
 * never written to storage or sent anywhere, and it goes when the worker does.
 */
export class RouteMemory {
  private readonly shapes = new Map<string, RouteShape | null>()
  private readonly records: ReadonlyMap<string, ActivityRecord>
  private readonly kept: (id: string) => Promise<RouteShape | null>

  /**
   * `records` are the saved activities of the session, by library id. `kept` reads the route kept
   * with a digest in this browser.
   */
  constructor(
    records: ReadonlyMap<string, ActivityRecord>,
    kept: (id: string) => Promise<RouteShape | null>,
  ) {
    this.records = records
    this.kept = kept
  }

  /** Keeps the shape of an activity this tab imported, whether or not it has a shape. */
  remember(recordId: string, route: RouteShape | null): void {
    this.shapes.set(recordId, route)
  }

  forget(recordId: string): void {
    this.shapes.delete(recordId)
  }

  clear(): void {
    this.shapes.clear()
  }

  /**
   * The reply to a route request, under the signed-in account when the request names one. A request
   * to forget the routes empties the memory and is answered with no route, so every request gets a
   * reply and the page's queue of replies stays in step.
   */
  async reply(
    request: RouteMemoryRequest,
  ): Promise<Extract<WorkerResponse, { type: 'routeShape' }>> {
    if (request.type === 'forgetRoutes') {
      this.shapes.clear()
      return { type: 'routeShape', route: null, original: false }
    }
    const answer = await this.answer(request)
    return { type: 'routeShape', ...answer }
  }

  private async answer(request: RouteRequest): Promise<RouteAnswer> {
    if (request.userId === undefined) return { route: await this.kept(request.id), original: false }
    const record = this.records.get(request.id)
    return this.ofRecord(record, request.userId, request.fromOriginal === true)
  }

  /**
   * The shape of a saved activity of the signed-in account: the copy this tab kept, else the one of
   * its original file. The file is read only when `fromOriginal` asks for it, and then once. An
   * activity with neither has no shape, and nothing is read for it.
   */
  private async ofRecord(
    record: ActivityRecord | undefined,
    userId: string,
    fromOriginal: boolean,
  ): Promise<RouteAnswer> {
    // An activity the account no longer has, or never listed, has no route.
    if (record === undefined) return { route: null, original: false }
    // A digest of an indoor activity has no route, and its original is not read for one.
    if (record.digest.indoor) return { route: null, original: false }
    if (this.shapes.has(record.id)) {
      return { route: this.shapes.get(record.id) ?? null, original: false }
    }
    if (!record.hasFile) return { route: null, original: false }
    if (!fromOriginal) return { route: null, original: true }
    const { activity } = await originalActivity(record, userId)
    const route = activity?.route ?? null
    this.shapes.set(record.id, route)
    return { route, original: false }
  }
}
