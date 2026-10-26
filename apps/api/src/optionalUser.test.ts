import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { AppEnv } from './env.ts'
import { HttpError } from './errors.ts'
import { optionalUser } from './middleware.ts'

const app = new Hono<AppEnv>()
app.onError((error) =>
  error instanceof HttpError
    ? new Response(error.code, { status: error.status })
    : new Response('unexpected', { status: 500 }),
)
app.post('/probe', optionalUser, (c) => c.text('written'))
app.put('/probe', optionalUser, (c) => c.text('written'))

describe('optionalUser', () => {
  it.each(['POST', 'PUT'])('refuses a %s before it reads the session', async (method) => {
    const res = await app.request('/probe', { method })
    expect(res.status).toBe(405)
    expect(await res.text()).toBe('method_not_allowed')
  })
})
