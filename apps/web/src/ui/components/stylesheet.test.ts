import { describe, expect, it } from 'vitest'
import { ruleBody } from './stylesheet'

describe('ruleBody', () => {
  it('reads every top-level rule with the selector, not only the first', () => {
    const css = '.a {\n  color: red;\n}\n.b {\n  x: 1;\n}\n.a {\n  text-transform: uppercase;\n}\n'
    expect(ruleBody(css, '.a')).toMatch(/text-transform/)
    expect(ruleBody(css, '.a')).toMatch(/color: red/)
  })
})
