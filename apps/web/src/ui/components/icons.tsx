/**
 * The app's icons. Each is decorative (aria-hidden) and drawn in currentColor, so the text beside
 * it names it and its colour follows the text.
 */
import type { CSSProperties, ReactNode } from 'react'
import {
  BRAND_RIDING,
  BRAND_RUNNING,
  SPORT_GLYPHS,
  WARNING_DOT,
  WARNING_STEM,
  WARNING_TRIANGLE,
  inkBox,
  pathData,
} from './iconPaths'
import type { GlyphBox, SportGlyph } from './iconPaths'
import './icons.css'

export type IconSport = 'run' | 'ride' | 'swim'

interface IconProps {
  className?: string
}

/** The size of a glyph's box: its grid units, at the icon's unit (icons.css), so the box hugs its ink. */
function inkStyle(box: GlyphBox): CSSProperties {
  return {
    width: `calc(${box.width} * var(--icon-unit))`,
    height: `calc(${box.height} * var(--icon-unit))`,
    // The box keeps its centre where the 24 unit icon's centre sits, so a shorter glyph does not drop.
    verticalAlign: `calc(var(--icon-base) + (var(--icon-size) - ${box.height} * var(--icon-unit)) / 2)`,
  }
}

function Icon({
  className,
  sport,
  box,
  children,
}: IconProps & { sport?: IconSport; box?: GlyphBox; children: ReactNode }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      data-sport={sport}
      viewBox={box ? `${box.x} ${box.y} ${box.width} ${box.height}` : '0 0 24 24'}
      style={box ? inkStyle(box) : undefined}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

/** A glyph's dots and paths, drawn from the path data the share card also draws. */
function GlyphShapes({ glyph }: { glyph: SportGlyph }) {
  const { strokeWidth } = glyph
  return (
    <>
      {glyph.dots.map((dot) =>
        dot.filled ? (
          <circle
            key={`${dot.cx},${dot.cy}`}
            cx={dot.cx}
            cy={dot.cy}
            r={dot.r}
            fill="currentColor"
            stroke="none"
          />
        ) : (
          <circle
            key={`${dot.cx},${dot.cy}`}
            cx={dot.cx}
            cy={dot.cy}
            r={dot.r}
            strokeWidth={strokeWidth}
          />
        ),
      )}
      {glyph.paths.map((steps) => (
        <path key={pathData(steps)} d={pathData(steps)} strokeWidth={strokeWidth} />
      ))}
    </>
  )
}

const SPORT_PATHS: Record<IconSport, ReactNode> = {
  // The runner and the rider are in iconPaths.ts, so the share card draws the same figures.
  run: <GlyphShapes glyph={SPORT_GLYPHS.run} />,
  ride: <GlyphShapes glyph={SPORT_GLYPHS.ride} />,
  swim: (
    <>
      <circle cx="17" cy="6" r="2.2" fill="currentColor" stroke="none" />
      <path d="M3 18c2 0 2-1.5 4.5-1.5S10 18 12 18s2.5-1.5 4.5-1.5S19 18 21 18M6 13l5-4 4 3" />
    </>
  ),
}

/** A sport's glyph cropped to its ink, so its edge is the ink's edge. Swimming is drawn on the full grid. */
const SPORT_BOXES: Partial<Record<IconSport, GlyphBox>> = {
  run: inkBox(SPORT_GLYPHS.run),
  ride: inkBox(SPORT_GLYPHS.ride),
}

/** The sport's glyph, shown next to every sport name. */
export function SportIcon({ sport, className }: IconProps & { sport: IconSport }) {
  return (
    <Icon className={className} sport={sport} box={SPORT_BOXES[sport]}>
      {SPORT_PATHS[sport]}
    </Icon>
  )
}

export function WarningIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d={pathData(WARNING_TRIANGLE)} />
      <path d={pathData(WARNING_STEM)} />
      <circle cx={WARNING_DOT.x} cy={WARNING_DOT.y} r={WARNING_DOT.r} fill="currentColor" />
    </Icon>
  )
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4.5 12.5l5 5L19.5 7" />
    </Icon>
  )
}

export function PlusIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  )
}

/** An arrow rising out of a tray, for choosing files to send in. */
export function UploadIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 15V4.5M7.5 9L12 4.5 16.5 9" />
      <path d="M4.5 15v4.5h15V15" />
    </Icon>
  )
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  )
}

/** A person, for the account and profile link. The sliders glyph read as a filter. */
export function PersonIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.9-3.7 3.7-5.8 7-5.8s6.1 2.1 7 5.8" />
    </Icon>
  )
}

/** A balance beam on a post, for the Balance tab: two pans hang level from the beam. */
export function BalanceIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3 7h18M12 4v16M8 20h8" />
      <path d="M6 7l-2.5 6h5L6 7zM18 7l-2.5 6h5L18 7z" />
    </Icon>
  )
}

/** A list with a mark at each line, for the Activities tab. */
export function ActivitiesIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 6.5h.01M4 12h.01M4 17.5h.01M8.5 6.5H20M8.5 12H20M8.5 17.5H20" />
    </Icon>
  )
}

/**
 * The brand mark: a rising running curve crossing a falling riding curve, on ink. The tile and
 * the strokes take their colours from custom properties, so the tile has a ring in dark.
 */
export function BrandMark({ className }: IconProps) {
  return (
    <svg
      className={className ? `brand-mark ${className}` : 'brand-mark'}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="brand-mark__tile" x="0.5" y="0.5" width="31" height="31" rx="6.5" />
      <path
        className="brand-mark__run"
        d={pathData(BRAND_RUNNING)}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        className="brand-mark__ride"
        d={pathData(BRAND_RIDING)}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  )
}
