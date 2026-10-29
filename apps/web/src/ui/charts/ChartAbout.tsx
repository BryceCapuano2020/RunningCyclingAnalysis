import './ChartAbout.css'

/**
 * "About this chart": the notes that explain how a chart is drawn, which the one visible line leaves out. It sits
 * with "View as table", set as that disclosure is. Nothing is drawn without notes.
 */
export function ChartAbout({ notes }: { notes: readonly string[] }) {
  if (notes.length === 0) return null
  return (
    <details className="chart-frame__details chart-about">
      <summary>About this chart</summary>
      <ul className="chart-about__notes">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </details>
  )
}
