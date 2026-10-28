import { z } from 'zod'

// These contracts run in strict-CSP browsers and Workers, where dynamic code generation is blocked.
// Zod decides at schema construction whether it may compile, so every module that builds a schema
// imports this first, before any schema exists.
z.config({ jitless: true })
