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
  /** Each tail of the band: 5% a side, 10% in all. */
  tail: 0.05,
  /** The stream's seed; each sport and length adds its own offset, so a result is the same every time. */
  seed: 0x5eed,
} as const
