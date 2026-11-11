import type { ActivityDigest } from '@rca/core/types'

const bytesOf = (digests: readonly ActivityDigest[]) =>
  digests.reduce((sum, digest) => sum + Buffer.byteLength(JSON.stringify(digest)), 0)

/** The digests with every heart-rate block list repeated `pad` times over (a real digest of a long activity is that much larger). */
function padded(digests: readonly ActivityDigest[], pad: number): ActivityDigest[] {
  return digests.map((digest) => ({
    ...digest,
    hrBlocks: Array.from({ length: Math.ceil(pad) }, () => digest.hrBlocks)
      .flat()
      .slice(0, Math.round(digest.hrBlocks.length * pad)),
  }))
}

/**
 * The digests grown to just under `targetBytes` of stored JSON in all, by repeating their heart-rate blocks: the size of an
 * account that has used its whole byte quota, for the memory measurements. The size is linear in the padding, so two
 * measurements place it and a third checks; it never goes over the target.
 */
export function paddedToBytes(
  digests: readonly ActivityDigest[],
  targetBytes: number,
): ActivityDigest[] {
  const one = bytesOf(digests)
  const two = bytesOf(padded(digests, 2))
  let pad = 1 + (targetBytes - one) / (two - one)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = padded(digests, pad)
    if (bytesOf(result) <= targetBytes) return result
    pad *= 0.99
  }
  throw new Error('paddedToBytes: the padding did not settle under the target')
}
