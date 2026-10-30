import { describe, expect, it } from 'vitest'
import type { Bindings } from './env.ts'
import { isLocalDevelopment } from './localDev.ts'

const env = (overrides: Partial<Bindings>): Bindings =>
  ({ ENVIRONMENT: 'development', APP_URL: 'http://localhost:5183', ...overrides }) as Bindings

describe('isLocalDevelopment', () => {
  it.each([
    ['http://localhost/api/me'],
    ['http://localhost:8787/api/me'],
    ['http://127.0.0.1:8787/api/me'],
    ['http://[::1]:8787/api/me'],
  ])('holds for a loopback request: %s', (url) => {
    expect(isLocalDevelopment(env({}), url)).toBe(true)
  })

  it.each([
    ['ENVIRONMENT is production', env({ ENVIRONMENT: 'production' }), 'http://localhost/'],
    ['ENVIRONMENT is unset', env({ ENVIRONMENT: undefined }), 'http://localhost/'],
    ['ENVIRONMENT differs in case', env({ ENVIRONMENT: 'Development' }), 'http://localhost/'],
    ['APP_URL is public', env({ APP_URL: 'https://rca.example.test' }), 'http://localhost/'],
    ['APP_URL is not a URL', env({ APP_URL: 'localhost' }), 'http://localhost/'],
    ['the request host is public', env({}), 'https://rca.example.test/api/me'],
    ['the request host only starts with localhost', env({}), 'http://localhost.example.test/'],
    ['the request host is a LAN address', env({}), 'http://192.168.0.5:8787/'],
  ])('fails when %s', (_, bindings, url) => {
    expect(isLocalDevelopment(bindings, url)).toBe(false)
  })
})
