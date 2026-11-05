/** A figure as its number and its unit, the unit set smaller after a non-breaking space: "5:31 /mi". */
export function UnitFigure({ value }: { value: string }) {
  const at = value.indexOf(' ')
  if (at < 0) return <>{value}</>
  return (
    <>
      {value.slice(0, at)}
      <span className="row__unit">{` ${value.slice(at + 1)}`}</span>
    </>
  )
}
