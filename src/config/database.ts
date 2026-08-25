import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
dotenv.config()

const DB_HOST     = process.env.DB_HOST     || 'localhost'
const DB_PORT     = Number(process.env.DB_PORT) || 3306
const DB_NAME     = process.env.DB_NAME     || 'qruvs_db'
const DB_USER     = process.env.DB_USER     || 'root'
const DB_PASSWORD = process.env.DB_PASSWORD || ''

export const pool = mysql.createPool({
  host:             DB_HOST,
  port:             DB_PORT,
  database:         DB_NAME,
  user:             DB_USER,
  password:         DB_PASSWORD,
  waitForConnections: true,
  connectionLimit:  10,
  queueLimit:       0,
  charset:          'utf8mb4',
  timezone:         'Z',
  multipleStatements: false,
  enableKeepAlive:  true,
  keepAliveInitialDelay: 10000,
})

// Огт хоосон MySQL сервер дээр (DB_NAME-тэй бааз урьдчилан үүсээгүй) ч гэсэн
// `yarn dev`/`npm run dev` ганцаараа ажиллуулах боломжтой байхын тулд DB-гүй холболтоор
// шаардлагатай бол баазыг өөрөө үүсгэнэ. pool нь database сонгосон тул баазгүй бол холбогдож чадахгүй.
export async function ensureDatabaseExists() {
  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
  })
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  )
  await conn.end()
}

export async function testConnection() {
  const conn = await pool.getConnection()
  console.log('✅ MySQL connected')
  conn.release()
}

export default pool
