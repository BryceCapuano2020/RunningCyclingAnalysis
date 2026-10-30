/**
 * Keeps the held-out configurations out of tuning code. A file may name `heldOut` in an import (or
 * the `HELD_OUT_CONFIGS` table) only when it is a held-out test or one of the held-out files.
 */
const ALLOWED = [
  /\.heldout(\.sim)?\.test\.ts$/,
  /\/heldOut\.ts$/,
  /\/heldOut\.bands\.ts$/,
  /\/heldOutGuard\.ts$/,
  /\/heldOutGuard\.node\.test\.ts$/,
]
const REACHES_HELD_OUT =
  /(?:from|import|require)\s*\(?\s*['"][^'"]*heldOut[^'"]*['"]|HELD_OUT_CONFIGS/

export interface SourceFile {
  path: string
  text: string
}

export function heldOutOffenders(files: readonly SourceFile[]): string[] {
  return files
    .filter((f) => !ALLOWED.some((ok) => ok.test(f.path)) && REACHES_HELD_OUT.test(f.text))
    .map((f) => f.path)
}
