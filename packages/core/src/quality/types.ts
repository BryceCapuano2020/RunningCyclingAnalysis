/** The quality flags and masks an activity's samples carry. Kept apart from types.ts for its size budget. */

export type QualityKind =
  | 'hr-dropout'
  | 'hr-spike'
  | 'hr-implausible-for-power'
  | 'power-spike'
  | 'power-dropout'
  | 'speed-spike'
  | 'implausible-speed'
  | 'altitude-jump'
  | 'implausible-climb'
  | 'stream-disagreement'
  | 'missing-altitude'
  /** Revision 7: the heart-rate strap repeated the cadence. Written by revision 7 only. */
  | 'hr-cadence-lock'

export interface QualityFlag {
  kind: QualityKind
  /** First affected sample index, inclusive. */
  start: number
  /** Last affected sample index, exclusive. */
  end: number
  /** Human-readable, one sentence, no trailing period. */
  message: string
}

export interface QualityReport {
  flags: QualityFlag[]
  /** 1 where speed is usable by motion and virtual-power models, else 0. Length n. */
  validMotion: Uint8Array
  /** 1 where measured power is usable, independent of GPS and altitude quality, else 0. Length n. */
  validPower: Uint8Array
  /** 1 where grade derived from altitude is usable, else 0. Length n. */
  validGrade: Uint8Array
  /**
   * 1 where the altitude sample is finite and not left out by an altitude-jump or implausible-climb
   * flag, else 0. Unlike validGrade, it does not depend on the grade, so it is the mask for air
   * density. Length n.
   */
  validAltitude: Uint8Array
  /** 1 where the heart-rate sample is usable, else 0. Length n. */
  validHeartRate: Uint8Array
}
