/**
 * The words that ask for a body weight. Each page says them once, in its own context: a note that
 * can link to Profile, a note in a dialog that cannot, and a field hint on Profile itself. The
 * purpose, and the request, are written here and nowhere else.
 */
export const WEIGHT_PURPOSE = 'to compare a ride with a run.'

/** The purpose on a card's note, where a ride's figures wait for the weight. */
export const WEIGHT_FIGURES_PURPOSE = 'to see ride figures.'

/** The request with its link target as words, so the link and the plain text read the same. */
export const WEIGHT_PROMPT_PARTS = {
  lead: 'Add your weight on',
  page: 'Profile',
  purpose: WEIGHT_PURPOSE,
} as const

/** The request as plain text, for a note where a link would leave the dialog it is in. */
export const WEIGHT_PROMPT_TEXT = `${WEIGHT_PROMPT_PARTS.lead} ${WEIGHT_PROMPT_PARTS.page} ${WEIGHT_PROMPT_PARTS.purpose}`
