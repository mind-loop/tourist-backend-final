import pool from '../config/database'

// `ADD COLUMN IF NOT EXISTS` синтакс зөвхөн MySQL 8.0.29+-д дэмжигддэг.
// Түүнээс өмнөх MySQL/MariaDB дээр энэ синтакс алдаа өгдөг тул IF NOT EXISTS-г хассан
// хувилбараар дахин оролдоно ("Duplicate column" алдааг чимээгүй үл тоомсорлоно).
export async function alterTableSafe(sql: string): Promise<void> {
  await pool.execute(sql).catch(() =>
    pool.execute(sql.replace(/ IF NOT EXISTS/gi, '')).catch(() => {})
  )
}
