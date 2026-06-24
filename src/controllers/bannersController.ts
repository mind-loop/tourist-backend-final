import { Request, Response } from 'express'
import pool from '../config/database'

function isSA(req: Request) { return req.user?.role === 'superadmin' }

async function ownsBanner(id: string | number, userId: number, role: string) {
  if (role === 'superadmin') return true
  const [r]: any = await pool.execute('SELECT created_by FROM banners WHERE id=? LIMIT 1', [id])
  return r.length > 0 && r[0].created_by === userId
}

// GET /banners/active  (public)
export async function getActiveBanners(_req: Request, res: Response) {
  try {
    const [rows]: any = await pool.execute(
      'SELECT * FROM banners WHERE is_active=1 ORDER BY sort_order ASC, id ASC'
    )
    res.json({ success: true, data: rows })
  } catch {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// GET /banners  (admin — own only, superadmin all)
export async function getAllBanners(req: Request, res: Response) {
  try {
    const where = isSA(req) ? '' : 'WHERE created_by=?'
    const params = isSA(req) ? [] : [req.user!.id]
    const [rows]: any = await pool.query(
      `SELECT * FROM banners ${where} ORDER BY sort_order ASC, id ASC`,
      params
    )
    res.json({ success: true, data: rows })
  } catch {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// POST /banners  (admin)
export async function createBanner(req: Request, res: Response) {
  try {
    const { title_mn, title_en, title_ru, subtitle_mn, subtitle_en, subtitle_ru, link_url, sort_order } = req.body
    if (!title_mn) return res.status(400).json({ success: false, message: 'Монгол гарчиг заавал шаардлагатай' })

    const imageUrl = req.file ? `/uploads/images/${req.file.filename}` : ''
    const [result]: any = await pool.execute(
      `INSERT INTO banners
         (title_mn, title_en, title_ru, subtitle_mn, subtitle_en, subtitle_ru,
          image_url, link_url, sort_order, is_active, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,0,?)`,
      [
        title_mn, title_en || '', title_ru || '',
        subtitle_mn || null, subtitle_en || null, subtitle_ru || null,
        imageUrl, link_url || null, parseInt(sort_order) || 0,
        req.user!.id,
      ]
    )
    res.status(201).json({ success: true, data: { id: result.insertId } })
  } catch {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// PATCH /banners/:id/toggle  (admin — own only)
export async function toggleBanner(req: Request, res: Response) {
  try {
    if (!await ownsBanner(req.params.id, req.user!.id, req.user!.role)) {
      return res.status(403).json({ success: false, message: 'Зөвхөн өөрийн баннерийг өөрчлөх боломжтой' })
    }
    await pool.execute('UPDATE banners SET is_active=NOT is_active WHERE id=?', [req.params.id])
    res.json({ success: true, message: 'Баннер шинэчлэгдлээ' })
  } catch {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// DELETE /banners/:id  (admin — own only)
export async function deleteBanner(req: Request, res: Response) {
  try {
    if (!await ownsBanner(req.params.id, req.user!.id, req.user!.role)) {
      return res.status(403).json({ success: false, message: 'Зөвхөн өөрийн баннерийг устгах боломжтой' })
    }
    await pool.execute('DELETE FROM banners WHERE id=?', [req.params.id])
    res.json({ success: true, message: 'Баннер устгагдлаа' })
  } catch {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// DB migration
export async function migrateBanners() {
  await pool.execute(
    `ALTER TABLE banners ADD COLUMN IF NOT EXISTS created_by INT DEFAULT NULL`
  ).catch(() => {})
}
