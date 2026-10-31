import type { ImportManifest } from '../importManifest'
import { groupThousands } from '@rca/core/units'
import { plural } from '../components/plural'

/** The most damaged zips named in one sentence. */
const NAMED = 3

function damagedText(manifest: ImportManifest): string {
  const named = manifest.damaged
    .slice(0, NAMED)
    .map(({ name, lost }) =>
      lost === null
        ? `${name} ends early, so some of its files are missing.`
        : `${name} is damaged: ${plural(lost, 'file')} in it could not be read.`,
    )
  const more = manifest.damaged.length - NAMED
  const rest =
    more > 0 ? [`${plural(more, 'other zip')} ${more === 1 ? 'is' : 'are'} damaged too.`] : []
  return [...named, ...rest, 'Download the export again and add it.'].join(' ')
}

/**
 * What the athlete is told when the library is only part of what they added: an import that was cut off
 * says how far it got, and a damaged zip says which and what to do. Both leave the results standing, since
 * the files that were read are in the library.
 */
export function incompleteText(manifest: ImportManifest): string {
  if (manifest.state === 'partial-source') return damagedText(manifest)
  const { read, expected } = manifest
  const again = 'Add the same files again to finish'
  if (read === 0) {
    return expected === null
      ? `The last import stopped before it read any files. ${again}.`
      : `The last import stopped before it read any of its ${groupThousands(String(expected))} files. ${again}.`
  }
  const reached =
    expected === null || read >= expected
      ? 'The last import stopped before it finished.'
      : `The last import stopped after ${groupThousands(String(read))} of ${groupThousands(String(expected))} files.`
  return `${reached} What it added is here. ${again}: files already added are skipped.`
}
