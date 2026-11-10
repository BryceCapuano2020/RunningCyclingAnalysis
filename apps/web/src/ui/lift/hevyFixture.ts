export const HEVY_HEADER =
  'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe'

/** A synthetic workout row in the layout the reader expects: start, exercise, set index, type, kg, reps, rpe. */
export function hevyRow(
  start: string,
  exercise: string,
  index: number,
  type: string,
  kg: string,
  reps: string,
  rpe = '',
): string {
  return ['Test day', start, '', '', exercise, '', '', index, type, kg, reps, '', '', rpe].join(',')
}
