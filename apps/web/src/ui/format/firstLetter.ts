/** The text with its first letter in lower case, to follow a lead-in. */
export const lowerFirst = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`

/** The text with its first letter in upper case, to start a sentence. */
export const upperFirst = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`
