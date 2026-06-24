import { Request, Response } from 'express'
import pool from '../config/database'

export async function getUsers(_req: Request, res: Response) {
  try {
    const [rows]: any = await pool.execute(
      'SELECT id, name, email, role, provider, is_active, created_at FROM users ORDER BY created_at DESC'
    )
    res.json({ success: true, data: rows })
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// PATCH /users/:id/role  (superadmin only)
export async function updateRole(req: Request, res: Response) {
  try {
    const { role } = req.body
    if (!['superadmin', 'admin', 'user'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Эрх буруу байна' })
    }
    // Don't allow demoting yourself
    if (Number(req.params.id) === req.user!.id) {
      return res.status(400).json({ success: false, message: 'Өөрийн эрхийг өөрчлөх боломжгүй' })
    }
    await pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id])
    res.json({ success: true, message: 'Эрх шинэчлэгдлээ' })
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

export async function getDashboardStats(req: Request, res: Response) {
  try {
    const isSA = req.user?.role === 'superadmin'
    const uid  = req.user!.id

    const placesWhere     = isSA ? '' : 'WHERE created_by=?'
    const publishedWhere  = isSA ? "WHERE status='published'" : "WHERE status='published' AND created_by=?"
    const articlesWhere   = isSA ? '' : 'WHERE author_id=?'
    const toursWhere      = isSA ? '' : 'WHERE created_by=?'
    const p = isSA ? [] : [uid]

    const [[places]]:   any = await pool.query(`SELECT COUNT(*) AS count FROM places ${placesWhere}`,   p)
    const [[published]]:any = await pool.query(`SELECT COUNT(*) AS count FROM places ${publishedWhere}`, p)
    const [[users]]:    any = await pool.execute('SELECT COUNT(*) AS count FROM users')
    const [[reviews]]:  any = await pool.execute('SELECT COUNT(*) AS count FROM reviews')
    const [[articles]]: any = await pool.query(`SELECT COUNT(*) AS count FROM articles ${articlesWhere}`, p)
    const [[tours]]:    any = await pool.query(`SELECT COUNT(*) AS count FROM tours ${toursWhere}`,      p)

    res.json({
      success: true,
      data: {
        totalPlaces:     places.count,
        publishedPlaces: published.count,
        totalUsers:      users.count,
        totalReviews:    reviews.count,
        totalArticles:   articles.count,
        totalTours:      tours.count,
      },
    })
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}
