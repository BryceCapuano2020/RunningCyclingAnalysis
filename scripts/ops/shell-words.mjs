// Splits a shell command line into its simple commands, each an array of words, closely enough for
// agent-guard.mjs to tell which programs a command starts. It honours quotes, backslashes, comments
// and here-documents (whose bodies are data, not commands); it does not expand anything. An output
// redirection appears as a `>` or `>>` word before its target.

const SEPARATORS = new Set([';', '&', '|', '\n', '(', ')', '`'])

/** The delimiter of a here-document that starts at `at` (just past `<<`), and where it ends. */
function heredocDelimiter(text, at) {
  let i = at
  if (text[i] === '-') i++
  while (text[i] === ' ' || text[i] === '\t') i++
  let word = ''
  while (i < text.length && !/[\s;&|<>()]/.test(text[i])) {
    if (text[i] !== "'" && text[i] !== '"' && text[i] !== '\\') word += text[i]
    i++
  }
  return { word, end: i }
}

/** The index just past the body of the here-documents opened on the line ending at `newline`. */
function skipHeredocs(text, newline, delimiters) {
  let i = newline + 1
  for (const delimiter of delimiters) {
    for (;;) {
      if (i >= text.length) return text.length
      const end = text.indexOf('\n', i) === -1 ? text.length : text.indexOf('\n', i)
      const line = text.slice(i, end).replace(/^\t+/, '')
      i = end + 1
      if (line === delimiter) break
    }
  }
  return i - 1
}

/** The simple commands of `text`, each as its list of words. */
export function simpleCommands(text) {
  const commands = []
  let words = []
  let word = ''
  let started = false
  let quote = null
  let heredocs = []
  const endWord = () => {
    if (started) words.push(word)
    word = ''
    started = false
  }
  const endCommand = () => {
    endWord()
    if (words.length) commands.push(words)
    words = []
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === quote) quote = null
      else if (c === '\\' && quote === '"' && i + 1 < text.length) word += text[++i]
      else word += c
      continue
    }
    if (c === "'" || c === '"') {
      quote = c
      started = true
    } else if (c === '\\' && i + 1 < text.length) {
      if (text[i + 1] !== '\n') word += text[i + 1]
      started = started || text[i + 1] !== '\n'
      i++
    } else if (c === '#' && !started) {
      while (i + 1 < text.length && text[i + 1] !== '\n') i++
    } else if (text.startsWith('<<<', i)) {
      endWord()
      i += 2
    } else if (c === '<' && text[i + 1] === '<') {
      endWord()
      const { word: delimiter, end } = heredocDelimiter(text, i + 2)
      if (delimiter) heredocs.push(delimiter)
      i = end - 1
    } else if (c === '>' && text[i + 1] !== '&') {
      // An output redirection keeps its operator as a word of its own, so the word after it is known to be a target.
      endWord()
      const op = text[i + 1] === '>' ? '>>' : '>'
      words.push(op)
      i += op.length - 1
    } else if (c === ' ' || c === '\t' || c === '<' || c === '>') {
      endWord()
    } else if (SEPARATORS.has(c)) {
      endCommand()
      if (c === '\n' && heredocs.length) {
        i = skipHeredocs(text, i, heredocs)
        heredocs = []
      }
    } else {
      word += c
      started = true
    }
  }
  endCommand()
  return commands
}
