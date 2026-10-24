/** WCAG contrast and the colour it paints over a translucent one, for the token tests. */

/** WCAG relative luminance of an opaque #rrggbb colour. */
export function luminance(hex: string): number {
  const linear = (start: number) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(1) + 0.7152 * linear(3) + 0.0722 * linear(5)
}

/** WCAG contrast ratio between two opaque colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** A colour as #rrggbb or #rrggbbaa, laid over an opaque background, as the browser paints it. */
export function over(foreground: string, background: string): string {
  const alpha = foreground.length === 9 ? parseInt(foreground.slice(7, 9), 16) / 255 : 1
  const channels = [1, 3, 5].map((start) => {
    const top = parseInt(foreground.slice(start, start + 2), 16)
    const below = parseInt(background.slice(start, start + 2), 16)
    return Math.round(top * alpha + below * (1 - alpha))
      .toString(16)
      .padStart(2, '0')
  })
  return `#${channels.join('')}`
}
