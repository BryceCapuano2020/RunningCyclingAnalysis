/** How far apart two opaque colours look, and how they look to a reader with colour-vision deficiency, for the token tests. */

type Vec = [number, number, number]

function linear(hex: string): Vec {
  return [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }) as Vec
}

function encode(channel: number): string {
  const clamped = Math.min(1, Math.max(0, channel))
  const gamma = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055
  return Math.round(gamma * 255)
    .toString(16)
    .padStart(2, '0')
}

/** Machado, Oliveira and Fernandes (2009), full severity, applied to linear RGB. */
const DEFICIENCY = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
} as const

export type Deficiency = keyof typeof DEFICIENCY

export const DEFICIENCIES = Object.keys(DEFICIENCY) as Deficiency[]

/** The colour as a reader with the deficiency sees it, as #rrggbb. */
export function simulate(hex: string, deficiency: Deficiency): string {
  const [r, g, b] = linear(hex)
  const channels = DEFICIENCY[deficiency].map((row) => encode(row[0] * r + row[1] * g + row[2] * b))
  return `#${channels.join('')}`
}

function lab(hex: string): Vec {
  const [r, g, b] = linear(hex)
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

const RAD = Math.PI / 180
const hueOf = (b: number, a: number) => {
  const h = Math.atan2(b, a) / RAD
  return h < 0 ? h + 360 : h
}

/** CIEDE2000 between two opaque colours: about 2 is the least a trained eye sees, 7 or more is plain. */
export function deltaE(first: string, second: string): number {
  return deltaELab(lab(first), lab(second))
}

/** CIEDE2000 between two colours given in CIELAB, as the published reference pairs are. */
export function deltaELab(first: readonly number[], second: readonly number[]): number {
  const [l1 = 0, a1 = 0, b1 = 0] = first
  const [l2 = 0, a2 = 0, b2 = 0] = second
  const meanC = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2
  const g = 0.5 * (1 - Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7)))
  const a1p = a1 * (1 + g)
  const a2p = a2 * (1 + g)
  const c1 = Math.hypot(a1p, b1)
  const c2 = Math.hypot(a2p, b2)
  const h1 = hueOf(b1, a1p)
  const h2 = hueOf(b2, a2p)
  let dh = 0
  if (c1 * c2 !== 0) {
    dh = h2 - h1
    if (dh > 180) dh -= 360
    else if (dh < -180) dh += 360
  }
  const dL = l2 - l1
  const dC = c2 - c1
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin((dh * RAD) / 2)
  const meanL = (l1 + l2) / 2
  const meanCp = (c1 + c2) / 2
  let meanH = h1 + h2
  if (c1 * c2 !== 0) {
    meanH = Math.abs(h1 - h2) > 180 ? (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2 : (h1 + h2) / 2
  }
  const t =
    1 -
    0.17 * Math.cos((meanH - 30) * RAD) +
    0.24 * Math.cos(2 * meanH * RAD) +
    0.32 * Math.cos((3 * meanH + 6) * RAD) -
    0.2 * Math.cos((4 * meanH - 63) * RAD)
  const rotation = 30 * Math.exp(-(((meanH - 275) / 25) ** 2))
  const rc = 2 * Math.sqrt(meanCp ** 7 / (meanCp ** 7 + 25 ** 7))
  const sl = 1 + (0.015 * (meanL - 50) ** 2) / Math.sqrt(20 + (meanL - 50) ** 2)
  const sc = 1 + 0.045 * meanCp
  const sh = 1 + 0.015 * meanCp * t
  const rt = -Math.sin(2 * rotation * RAD) * rc
  return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh))
}

/** The colour in OKLCH: its lightness, 0 to 1, and its chroma, about 0 for a grey and 0.3 for the most vivid. */
export function oklch(hex: string): { lightness: number; chroma: number } {
  const [r, g, b] = linear(hex)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return {
    lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    chroma: Math.hypot(a, bb),
  }
}
