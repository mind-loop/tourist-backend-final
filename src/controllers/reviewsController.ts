import { Request, Response } from 'express'
import pool from '../config/database'

// GET /reviews/place/:placeId  (public)
export async function getPlaceReviews(req: Request, res: Response) {
  try {
    const [rows]: any = await pool.execute(
      `SELECT r.id, r.rating, r.comment, r.created_at,
              u.name AS user_name, u.avatar AS user_avatar
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       WHERE r.place_id = ?
       ORDER BY r.created_at DESC`,
      [req.params.placeId]
    )
    res.json({ success: true, data: rows })
  } catch (err: any) {
    console.error('getPlaceReviews:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// POST /reviews  (auth required)
export async function createReview(req: Request, res: Response) {
  try {
    const { placeId, rating, comment } = req.body
    if (!placeId || !rating || !comment) {
      return res.status(400).json({ success: false, message: 'Бүх талбарыг бөглөнө үү' })
    }
    const r = Math.min(5, Math.max(1, parseInt(rating)))

    const [result]: any = await pool.execute(
      'INSERT INTO reviews (place_id, user_id, rating, comment) VALUES (?,?,?,?)',
      [placeId, req.user!.id, r, comment.trim()]
    )

    // Recalculate rating
    await pool.execute(
      `UPDATE places SET
         rating       = (SELECT ROUND(AVG(rating),1) FROM reviews WHERE place_id = ?),
         review_count = (SELECT COUNT(*) FROM reviews WHERE place_id = ?)
       WHERE id = ?`,
      [placeId, placeId, placeId]
    )

    res.status(201).json({ success: true, data: { id: result.insertId } })
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Та аль хэдийн сэтгэгдэл үлдээсэн байна' })
    }
    console.error('createReview:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// DELETE /reviews/:id  (admin)
export async function deleteReview(req: Request, res: Response) {
  try {
    const [rows]: any = await pool.execute('SELECT place_id FROM reviews WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ success: false, message: 'Сэтгэгдэл олдсонгүй' })
    const placeId = rows[0].place_id

    await pool.execute('DELETE FROM reviews WHERE id = ?', [req.params.id])

    await pool.execute(
      `UPDATE places SET
         rating       = COALESCE((SELECT ROUND(AVG(rating),1) FROM reviews WHERE place_id = ?), 0),
         review_count = (SELECT COUNT(*) FROM reviews WHERE place_id = ?)
       WHERE id = ?`,
      [placeId, placeId, placeId]
    )

    res.json({ success: true, message: 'Сэтгэгдэл устгагдлаа' })
  } catch (err: any) {
    console.error('deleteReview:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}
