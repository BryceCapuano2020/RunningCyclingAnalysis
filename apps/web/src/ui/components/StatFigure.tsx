export interface StatFigureProps {
  label: string
  value: string
  /** A second line under the value, such as the highest heart rate. */
  sub?: string
  /** The class of the group, set by the page or list that holds it. */
  className: string
  labelClassName?: string
  valueClassName?: string
}

/** One labelled figure in a stat list: the label as a term, the value as its description. */
export function StatFigure({
  label,
  value,
  sub,
  className,
  labelClassName,
  valueClassName,
}: StatFigureProps) {
  return (
    <div className={className}>
      <dt className={labelClassName}>{label}</dt>
      <dd className={valueClassName}>{value}</dd>
      {sub && <dd className="secondary">{sub}</dd>}
    </div>
  )
}
