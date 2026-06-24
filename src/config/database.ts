import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
dotenv.config()

export const pool = mysql.createPool({
  host:             process.env.DB_HOST     || 'localhost',
  port:             Number(process.env.DB_PORT) || 3306,
  database:         process.env.DB_NAME     || 'qruvs_db',
  user:             process.env.DB_USER     || 'root',
  password:         process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit:  10,
  queueLimit:       0,
  charset:          'utf8mb4',
  timezone:         'Z',
  multipleStatements: false,
})

export async function testConnection() {
  const conn = await pool.getConnection()
  console.log('✅ MySQL connected')
  conn.release()
}

export default pool
