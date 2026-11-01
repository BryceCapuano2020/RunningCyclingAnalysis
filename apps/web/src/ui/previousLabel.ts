/**
 * How the label of what a period is compared with reads in a sentence. The period before is "Previous 12 weeks"; a
 * window further back, which the What changed strip falls back to, is named by its months ("Jan to Mar").
 */
const PREVIOUS = /^Previous /

/** The label after "than" or "from": "previous 12 weeks", or the months as they are. */
export function inSentence(label: string): string {
  return PREVIOUS.test(label) ? label.toLowerCase() : label
}

/** The label after "than" or "from" where a period takes an article: "the previous 12 weeks", or "Jan to Mar". */
export function withThe(label: string): string {
  return PREVIOUS.test(label) ? `the ${label.toLowerCase()}` : label
}
