import { Hono } from 'hono'
import type { AppEnv } from '../../env.ts'
import { createRoutes } from './create.ts'
import { fileRoutes } from './file.ts'
import { labelRoutes } from './labels.ts'
import { listRoutes } from './list.ts'
import { removeRoutes } from './remove.ts'
import { uploadRoutes } from './upload.ts'

/** The /api/activities routes. Each concern registers its own routes on this router. */
export const activityRoutes = new Hono<AppEnv>()
  .route('/', listRoutes)
  .route('/', createRoutes)
  .route('/', labelRoutes)
  .route('/', uploadRoutes)
  .route('/', fileRoutes)
  .route('/', removeRoutes)
