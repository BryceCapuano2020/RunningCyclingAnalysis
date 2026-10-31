// Prints the landing figures and the share image's description as JSON, for the build's plugin
// (landingFiguresPlugin.ts) to read: the config cannot import the analysis itself, so the plugin runs this under tsx.
import { ogAlt } from '../src/ui/landingFigures.ts'
import { computeLandingFigures } from './landingFigures.ts'

const figures = computeLandingFigures()
process.stdout.write(JSON.stringify({ figures, alt: ogAlt(figures) }))
