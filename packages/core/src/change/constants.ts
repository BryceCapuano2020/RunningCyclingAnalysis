/**
 * The change test's numbers. Each side of a comparison needs `minPerSide` efforts of the length and the two
 * together `minPooled`: with 4 and 4 the smallest attainable permutation p is 1/70, so the 10% level can be
 * reached; with fewer the null cannot separate the periods and the length is `untested`.
 */
export const CHANGE = {
  /** Random deals of the pooled efforts into a "now" and a "before" side. */
  draws: 2000,
  minPerSide: 4,
  minPooled: 12,
  /** Each tail of the record band: 5% a side, 10% in all. */
  tail: 0.05,
  /**
   * Each tail of the headline band, which the Balance strip and a curve's title use: 2.5% a side. A page that surfaces
   * a few claims at once (two sports, a lean, a title) would otherwise call one by chance in about one library in six.
   */
  strongTail: 0.025,
  /**
   * An unbalanced pair (the smaller side under this share of the pool) is dealt by choosing the small side's ranks
   * (O(small) a deal), not by walking the pool.
   */
  unbalancedShare: 0.125,
  /** The stream's seed; each sport and length adds its own offset, so a result is the same every time. */
  seed: 0x5eed,
} as const
