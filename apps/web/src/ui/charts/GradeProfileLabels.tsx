import type { DirectLabel } from './gradeProfileLayout'

/** The sports' grades named beside their points at the headline duration, in ink, with an estimate's range under. */
export function SportLabels({ labels }: { labels: readonly DirectLabel[] }) {
  return (
    <>
      {labels.map((label) => (
        <text
          key={label.sport}
          data-testid="profile-label"
          data-sport={label.sport}
          className="grade-profile__label"
          x={label.x}
          y={label.y}
          textAnchor={label.anchor}
        >
          {label.text}
          {label.range === null ? null : (
            <tspan
              className="grade-profile__label-range"
              x={label.x}
              dy={label.below ? '1.35em' : '-1.35em'}
            >
              {label.range}
            </tspan>
          )}
        </text>
      ))}
    </>
  )
}
