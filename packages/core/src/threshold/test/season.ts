import { RIDER, allOutRide, library, steadyRide, tempoRide, type Library } from './rides'

/*
 * A 26-week window of 20 rides, for the cost test: the weeks of a rider who rides most days of a month and then less, with
 * enough 5 min blocks (300 in the band) that the heart-rate line works at its largest, thinned to 300 points. Noise-free, as
 * the unit-test libraries are; the cost does not depend on the noise.
 */
export function season(): Library {
  const specs = Array.from({ length: 20 }, (_, i) => {
    const over = { ageDays: Math.round((i * 182) / 19) }
    const id = `s${i}`
    if (i % 5 === 0) return allOutRide(RIDER, id, over)
    if (i % 5 === 1) return steadyRide(RIDER, id, over)
    return tempoRide(RIDER, id, { ...over, hardS: 2400 })
  })
  return library(RIDER, specs)
}
