/**
 * Inserts `count` synthetic lift sets for an account in one statement (a recursive series, so no bound-value limit), dates
 * spread over 400 days across four exercises, and sets the account's `lift_count` to match. For tests of the lift read.
 */
export async function seedLiftSets(db: D1Database, userId: string, count: number): Promise<void> {
  await db
    .prepare(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?2)
       INSERT INTO lift_sets (user_id, date, exercise, equipment, set_order, reps, load_kg, rpe, warmup, updated_at)
       SELECT ?1, date('2025-01-01', '+' || (i % 400) || ' days'),
         CASE i % 4 WHEN 0 THEN 'back-squat' WHEN 1 THEN 'bench-press' WHEN 2 THEN 'deadlift' ELSE 'overhead-press' END,
         'barbell', i, 5, 40 + (i % 60), 8, 0, 1 FROM n`,
    )
    .bind(userId, count)
    .run()
  await db
    .prepare('UPDATE users SET lift_count = ?, lift_revision = lift_revision + 1 WHERE id = ?')
    .bind(count, userId)
    .run()
}
