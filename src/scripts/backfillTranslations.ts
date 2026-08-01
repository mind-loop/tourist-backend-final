// Нэг удаагийн скрипт: одоо байгаа мэдээллүүдийн хоосон title_en/title_ru гэх мэт
// талбаруудыг харгалзах _mn утгаас Google Translate ашиглан автоматаар бөглөнө.
// Ажиллуулах: npm run translate:backfill

import pool from '../config/database'
import { autoTranslateFields } from '../utils/autoTranslate'

interface TableSpec {
  table: string
  idCol: string
  fields: string[]
}

const TABLES: TableSpec[] = [
  { table: 'places',   idCol: 'id', fields: ['name', 'description', 'best_season', 'open_hours'] },
  { table: 'articles', idCol: 'id', fields: ['title', 'excerpt', 'content'] },
  { table: 'tours',    idCol: 'id', fields: ['title', 'description'] },
  { table: 'routes',   idCol: 'id', fields: ['title', 'from', 'to'] },
  { table: 'tags',     idCol: 'id', fields: ['label'] },
  { table: 'banners',  idCol: 'id', fields: ['title', 'subtitle'] },
]

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function backfillTable(spec: TableSpec) {
  const { table, idCol, fields } = spec
  const cols = fields.flatMap(f => [`${f}_mn`, `${f}_en`, `${f}_ru`])
  const whereParts = fields.map(f => `(${f}_mn IS NOT NULL AND ${f}_mn <> '' AND ((${f}_en IS NULL OR ${f}_en = '') OR (${f}_ru IS NULL OR ${f}_ru = '')))`)

  const [rows]: any = await pool.query(
    `SELECT ${idCol}, ${cols.join(', ')} FROM ${table} WHERE ${whereParts.join(' OR ')}`
  )

  console.log(`\n[${table}] ${rows.length} мөр орчуулга дутуу байна`)

  for (const row of rows) {
    const before = { ...row }
    await autoTranslateFields(row, fields)

    const setParts: string[] = []
    const params: any[] = []
    for (const f of fields) {
      for (const lang of ['en', 'ru'] as const) {
        const key = `${f}_${lang}`
        if (row[key] !== before[key]) {
          setParts.push(`${key} = ?`)
          params.push(row[key])
        }
      }
    }
    if (setParts.length === 0) continue

    params.push(row[idCol])
    await pool.execute(`UPDATE ${table} SET ${setParts.join(', ')} WHERE ${idCol} = ?`, params)
    console.log(`  ✓ ${table}#${row[idCol]} шинэчлэгдлээ (${setParts.length} талбар)`)
    await sleep(300) // Google-ийн үл мэдэгдэх endpoint-г хэт хурдан дуудахгүй байх зорилгоор
  }
}

async function main() {
  for (const spec of TABLES) {
    try {
      await backfillTable(spec)
    } catch (err: any) {
      console.error(`[${spec.table}] backfill алдаа:`, err.message)
    }
  }
  console.log('\nБүх backfill дууслаа.')
  await pool.end()
}

main()
