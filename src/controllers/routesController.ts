import { Request, Response } from 'express'
import pool from '../config/database'

function isSA(req: Request) { return req.user?.role === 'superadmin' }

async function ownsRoute(id: string | number, userId: number, role: string) {
  if (role === 'superadmin') return true
  const [r]: any = await pool.execute('SELECT created_by FROM routes WHERE id=? LIMIT 1', [id])
  return r.length > 0 && r[0].created_by === userId
}

// GET /routes  (public)
export async function getRoutes(req: Request, res: Response) {
  try {
    const [rows]: any = await pool.query(
      `SELECT * FROM routes WHERE status='published' ORDER BY sort_order ASC, id ASC`
    )
    res.json({ success: true, data: rows })
  } catch {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// GET /routes/admin/list  (admin — own only, superadmin all)
export async function getAdminRoutes(req: Request, res: Response) {
  try {
    const where = isSA(req) ? '' : 'WHERE created_by = ?'
    const params = isSA(req) ? [] : [req.user!.id]
    const [rows]: any = await pool.query(
      `SELECT * FROM routes ${where} ORDER BY sort_order ASC, id ASC`,
      params
    )
    res.json({ success: true, data: rows })
  } catch {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// GET /routes/:id  (public)
export async function getRouteById(req: Request, res: Response) {
  try {
    const [rows]: any = await pool.execute('SELECT * FROM routes WHERE id=? LIMIT 1', [req.params.id])
    if (!rows.length) return res.status(404).json({ success: false, message: 'Маршрут олдсонгүй' })
    res.json({ success: true, data: rows[0] })
  } catch {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// POST /routes  (admin)
export async function createRoute(req: Request, res: Response) {
  try {
    const b = req.body
    const file = (req.file as Express.Multer.File) || null
    const cover_image = file ? `/uploads/images/${file.filename}` : b.cover_image || null

    const [result]: any = await pool.execute(
      `INSERT INTO routes
         (title_mn, title_en, title_ru,
          from_mn, from_en, from_ru,
          to_mn, to_en, to_ru,
          total_km, paved_km, dirt_km,
          duration_minutes, stop_count, food_count, overnight_count,
          aimag_center_km, cover_image, status, sort_order, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        b.title_mn || '', b.title_en || '', b.title_ru || '',
        b.from_mn  || '', b.from_en  || '', b.from_ru  || '',
        b.to_mn    || '', b.to_en    || '', b.to_ru    || '',
        parseFloat(b.total_km) || 0, parseFloat(b.paved_km) || 0, parseFloat(b.dirt_km) || 0,
        parseInt(b.duration_minutes) || 0, parseInt(b.stop_count) || 0,
        parseInt(b.food_count) || 0, parseInt(b.overnight_count) || 0,
        parseFloat(b.aimag_center_km) || 0,
        cover_image, b.status || 'draft', parseInt(b.sort_order) || 0,
        req.user!.id,
      ]
    )
    res.status(201).json({ success: true, data: { id: (result as any).insertId } })
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// PUT /routes/:id  (admin — own only)
export async function updateRoute(req: Request, res: Response) {
  try {
    if (!await ownsRoute(req.params.id, req.user!.id, req.user!.role)) {
      return res.status(403).json({ success: false, message: 'Зөвхөн өөрийн маршрутыг засах боломжтой' })
    }
    const b = req.body
    const file = (req.file as Express.Multer.File) || null
    const cover_image = file ? `/uploads/images/${file.filename}` : b.cover_image || null

    await pool.execute(
      `UPDATE routes SET
         title_mn=?, title_en=?, title_ru=?,
         from_mn=?, from_en=?, from_ru=?,
         to_mn=?, to_en=?, to_ru=?,
         total_km=?, paved_km=?, dirt_km=?,
         duration_minutes=?, stop_count=?, food_count=?, overnight_count=?,
         aimag_center_km=?, cover_image=?, status=?, sort_order=?
       WHERE id=?`,
      [
        b.title_mn || '', b.title_en || '', b.title_ru || '',
        b.from_mn  || '', b.from_en  || '', b.from_ru  || '',
        b.to_mn    || '', b.to_en    || '', b.to_ru    || '',
        parseFloat(b.total_km) || 0, parseFloat(b.paved_km) || 0, parseFloat(b.dirt_km) || 0,
        parseInt(b.duration_minutes) || 0, parseInt(b.stop_count) || 0,
        parseInt(b.food_count) || 0, parseInt(b.overnight_count) || 0,
        parseFloat(b.aimag_center_km) || 0,
        cover_image, b.status || 'draft', parseInt(b.sort_order) || 0,
        req.params.id,
      ]
    )
    res.json({ success: true, message: 'Маршрут шинэчлэгдлээ' })
  } catch {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// DELETE /routes/:id  (admin — own only)
export async function deleteRoute(req: Request, res: Response) {
  try {
    if (!await ownsRoute(req.params.id, req.user!.id, req.user!.role)) {
      return res.status(403).json({ success: false, message: 'Зөвхөн өөрийн маршрутыг устгах боломжтой' })
    }
    await pool.execute('DELETE FROM routes WHERE id=?', [req.params.id])
    res.json({ success: true, message: 'Маршрут устгагдлаа' })
  } catch {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// PATCH /routes/:id/status  (admin — own only)
export async function updateRouteStatus(req: Request, res: Response) {
  try {
    if (!await ownsRoute(req.params.id, req.user!.id, req.user!.role)) {
      return res.status(403).json({ success: false, message: 'Зөвхөн өөрийн маршрутын төлвийг өөрчлөх боломжтой' })
    }
    const { status } = req.body
    if (!['published', 'draft'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Статус буруу байна' })
    }
    await pool.execute('UPDATE routes SET status=? WHERE id=?', [status, req.params.id])
    res.json({ success: true, message: 'Статус шинэчлэгдлээ' })
  } catch {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// DB migration
export async function migrateRoutes() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS routes (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      title_mn        VARCHAR(255) NOT NULL DEFAULT '',
      title_en        VARCHAR(255) DEFAULT '',
      title_ru        VARCHAR(255) DEFAULT '',
      from_mn         VARCHAR(255) NOT NULL DEFAULT '',
      from_en         VARCHAR(255) DEFAULT '',
      from_ru         VARCHAR(255) DEFAULT '',
      to_mn           VARCHAR(255) NOT NULL DEFAULT '',
      to_en           VARCHAR(255) DEFAULT '',
      to_ru           VARCHAR(255) DEFAULT '',
      total_km        DECIMAL(8,1) NOT NULL DEFAULT 0,
      paved_km        DECIMAL(8,1) DEFAULT 0,
      dirt_km         DECIMAL(8,1) DEFAULT 0,
      duration_minutes INT DEFAULT 0,
      stop_count      INT DEFAULT 0,
      food_count      INT DEFAULT 0,
      overnight_count INT DEFAULT 0,
      aimag_center_km DECIMAL(8,1) DEFAULT 0,
      cover_image     VARCHAR(500),
      status          ENUM('published','draft') DEFAULT 'draft',
      sort_order      INT DEFAULT 0,
      created_by      INT DEFAULT NULL,
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)
  await pool.execute(
    `ALTER TABLE routes ADD COLUMN IF NOT EXISTS created_by INT DEFAULT NULL`
  ).catch(() => {})
}
