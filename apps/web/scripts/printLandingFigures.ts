// Prints the landing figures as JSON, for the build's plugin
// (landingFiguresPlugin.ts) to read: the config cannot import the analysis itself, so the plugin runs this under tsx.
import { computeLandingFigures } from './landingFigures.ts'

process.stdout.write(JSON.stringify(computeLandingFigures()))
