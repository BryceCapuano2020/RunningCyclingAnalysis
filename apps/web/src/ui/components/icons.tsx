/**
 * The app's icons. Each is decorative (aria-hidden) and drawn in currentColor, so the text beside
 * it names it and its colour follows the text.
 */
import type { ReactNode } from 'react'
import {
  BRAND_RIDING,
  BRAND_RUNNING,
  WARNING_DOT,
  WARNING_STEM,
  WARNING_TRIANGLE,
  pathData,
} from './iconPaths'
import './icons.css'

export type IconSport = 'run' | 'ride' | 'swim'

interface IconProps {
  className?: string
}

function Icon({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      viewBox="0 0 24 24"
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

const SPORT_PATHS: Record<IconSport, ReactNode> = {
  run: (
    <>
      <circle cx="14" cy="4.5" r="2.2" fill="currentColor" stroke="none" />
      <path d="M9 21l3-6 3 2v4M7 12l3-4 4 1 2 4 3 1M12 15l-2-4" />
    </>
  ),
  ride: (
    <>
      <circle cx="5.5" cy="16.5" r="3.8" />
      <circle cx="18.5" cy="16.5" r="3.8" />
      <path d="M5.5 16.5l4-7h7l2 7M9.5 9.5l3 7h-7M14 6h3" />
    </>
  ),
  swim: (
    <>
      <circle cx="17" cy="6" r="2.2" fill="currentColor" stroke="none" />
      <path d="M3 18c2 0 2-1.5 4.5-1.5S10 18 12 18s2.5-1.5 4.5-1.5S19 18 21 18M6 13l5-4 4 3" />
    </>
  ),
}

/** The sport's glyph, shown next to every sport name. */
export function SportIcon({ sport, className }: IconProps & { sport: IconSport }) {
  return <Icon className={className}>{SPORT_PATHS[sport]}</Icon>
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

/** The brand mark: a rising running curve crossing a falling riding curve, on ink. */
export function BrandMark({ className }: IconProps) {
  return (
    <svg
      className={className ? `brand-mark ${className}` : 'brand-mark'}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="7" fill="#0e1116" />
      <path
        d={pathData(BRAND_RUNNING)}
        fill="none"
        stroke="#f0435f"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d={pathData(BRAND_RIDING)}
        fill="none"
        stroke="#4d6ef5"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
