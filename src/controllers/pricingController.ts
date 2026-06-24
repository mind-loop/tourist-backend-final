import { Request, Response } from 'express'
import pool from '../config/database'

export type ContentType = 'tourist_place' | 'historical_place' | 'tour' | 'banner' | 'article' | 'admin_upgrade'

export const CONTENT_TYPES: ContentType[] = [
  'tourist_place', 'historical_place', 'tour', 'banner', 'article', 'admin_upgrade',
]

// tour_commission is stored separately (% not flat fee)
export async function getTourCommissionRate(): Promise<number> {
  const [rows]: any = await pool.execute(
    `SELECT fee FROM content_pricing WHERE content_type = 'tour_commission' LIMIT 1`
  )
  return Number(rows[0]?.fee) || 0
}

export async function setTourCommissionRate(rate: number, userId: number): Promise<void> {
  await pool.execute(
    `INSERT INTO content_pricing (content_type, fee, updated_by) VALUES ('tour_commission', ?, ?)
     ON DUPLICATE KEY UPDATE fee=VALUES(fee), updated_by=VALUES(updated_by)`,
    [Math.min(100, Math.max(0, rate)), userId]
  )
}

// GET /pricing  (any admin)
export async function getPricing(_req: Request, res: Response) {
  try {
    const [rows]: any = await pool.execute('SELECT * FROM content_pricing ORDER BY id ASC')
    res.json({ success: true, data: rows })
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// PUT /pricing/:contentType  (superadmin only)
export async function updatePricing(req: Request, res: Response) {
  try {
    const { contentType } = req.params
    if (!CONTENT_TYPES.includes(contentType as ContentType)) {
      return res.status(400).json({ success: false, message: 'Агуулгын төрөл буруу' })
    }
    const fee = Math.max(0, parseFloat(req.body.fee) || 0)
    await pool.execute(
      `INSERT INTO content_pricing (content_type, fee, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE fee=VALUES(fee), updated_by=VALUES(updated_by)`,
      [contentType, fee, req.user!.id]
    )
    res.json({ success: true, message: 'Үнэ шинэчлэгдлээ' })
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// Get fee for a single content type (internal use)
export async function getFeeFor(contentType: ContentType): Promise<number> {
  const [rows]: any = await pool.execute(
    'SELECT fee FROM content_pricing WHERE content_type = ? LIMIT 1',
    [contentType]
  )
  return rows[0] ? Number(rows[0].fee) : 0
}

// GET /pricing/tour-commission
export async function getTourCommission(_req: Request, res: Response) {
  try {
    const rate = await getTourCommissionRate()
    res.json({ success: true, data: { rate } })
  } catch {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// PUT /pricing/tour-commission (superadmin)
export async function updateTourCommission(req: Request, res: Response) {
  try {
    const rate = Math.min(100, Math.max(0, parseFloat(req.body.rate) || 0))
    await setTourCommissionRate(rate, req.user!.id)
    res.json({ success: true, message: 'Комисс шинэчлэгдлээ' })
  } catch {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// DB migration
export async function migratePricing() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS content_pricing (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      content_type VARCHAR(50) NOT NULL UNIQUE,
      fee          DECIMAL(10,2) NOT NULL DEFAULT 0,
      updated_by   INT DEFAULT NULL,
      updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)

  // Insert defaults (fee=0 = free for all)
  for (const ct of CONTENT_TYPES) {
    await pool.execute(
      `INSERT IGNORE INTO content_pricing (content_type, fee) VALUES (?, 0)`,
      [ct]
    )
  }
}
