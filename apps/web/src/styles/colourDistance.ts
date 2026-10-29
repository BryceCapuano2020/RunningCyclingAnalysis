/** The CIEDE2000 difference between two opaque #rrggbb colours: about 2 is a difference an eye can just see, 15 or more is plainly two colours. */

type Lab = [number, number, number]

const linear = (channel: number) => {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function labOf(hex: string): Lab {
  const [r, g, b] = [1, 3, 5].map((start) => linear(parseInt(hex.slice(start, start + 2), 16)))
  const x = (0.4124 * r! + 0.3576 * g! + 0.1805 * b!) / 0.95047
  const y = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  const z = (0.0193 * r! + 0.1192 * g! + 0.9505 * b!) / 1.08883
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

const rad = (degrees: number) => (degrees * Math.PI) / 180
const hue = (b: number, a: number) => {
  const degrees = (Math.atan2(b, a) * 180) / Math.PI
  return degrees < 0 ? degrees + 360 : degrees
}

export function deltaE2000(first: string, second: string): number {
  const [l1, a1, b1] = labOf(first)
  const [l2, a2, b2] = labOf(second)
  const meanChroma = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2
  const g = 0.5 * (1 - Math.sqrt(meanChroma ** 7 / (meanChroma ** 7 + 25 ** 7)))
  const ap1 = (1 + g) * a1
  const ap2 = (1 + g) * a2
  const c1 = Math.hypot(ap1, b1)
  const c2 = Math.hypot(ap2, b2)
  const h1 = hue(b1, ap1)
  const h2 = hue(b2, ap2)
  let dh = h2 - h1
  if (dh > 180) dh -= 360
  if (dh < -180) dh += 360
  const dL = l2 - l1
  const dC = c2 - c1
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin(rad(dh / 2))
  const meanL = (l1 + l2) / 2
  const meanC = (c1 + c2) / 2
  const meanH = Math.abs(h1 - h2) > 180 ? (h1 + h2 + 360) / 2 : (h1 + h2) / 2
  const t =
    1 -
    0.17 * Math.cos(rad(meanH - 30)) +
    0.24 * Math.cos(rad(2 * meanH)) +
    0.32 * Math.cos(rad(3 * meanH + 6)) -
    0.2 * Math.cos(rad(4 * meanH - 63))
  const sl = 1 + (0.015 * (meanL - 50) ** 2) / Math.sqrt(20 + (meanL - 50) ** 2)
  const sc = 1 + 0.045 * meanC
  const sh = 1 + 0.015 * meanC * t
  const rc = 2 * Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7))
  const rt = -Math.sin(rad(60 * Math.exp(-(((meanH - 275) / 25) ** 2)))) * rc
  return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh))
}

/** Machado et al. (2009) matrices for full colour-vision deficiency, applied to linear RGB. */
const CVD: Record<'protan' | 'deutan' | 'tritan', number[][]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
}

const encode = (value: number) => {
  const clamped = Math.max(0, Math.min(1, value))
  const srgb = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055
  return Math.round(255 * srgb)
    .toString(16)
    .padStart(2, '0')
}

/** An opaque #rrggbb colour as a person with this kind of colour-vision deficiency sees it. */
export function simulateCvd(hex: string, kind: keyof typeof CVD): string {
  const linearRgb = [1, 3, 5].map((start) => linear(parseInt(hex.slice(start, start + 2), 16)))
  return `#${CVD[kind].map((row) => encode(row[0]! * linearRgb[0]! + row[1]! * linearRgb[1]! + row[2]! * linearRgb[2]!)).join('')}`
}

export const CVD_KINDS = ['protan', 'deutan', 'tritan'] as const
