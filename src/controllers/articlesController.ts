import { Request, Response } from 'express'
import pool from '../config/database'

function isSA(req: Request) { return req.user?.role === 'superadmin' }

async function ownsArticle(id: string | number, userId: number, role: string) {
  if (role === 'superadmin') return true
  const [r]: any = await pool.execute('SELECT author_id FROM articles WHERE id=? LIMIT 1', [id])
  return r.length > 0 && r[0].author_id === userId
}

// GET /articles  (public)
export async function getArticles(req: Request, res: Response) {
  try {
    const { status = 'published', page = 1, limit = 10 } = req.query
    const pageNum  = Math.max(1, Number(page))
    const limitNum = Math.min(50, Math.max(1, Number(limit)))
    const offset   = (pageNum - 1) * limitNum

    const [rows]: any = await pool.query(
      `SELECT a.id, a.slug, a.title_mn, a.title_en, a.title_ru,
              a.excerpt_mn, a.excerpt_en, a.excerpt_ru,
              a.cover_image, a.status, a.published_at, a.created_at,
              u.name AS author_name
       FROM articles a
       LEFT JOIN users u ON u.id = a.author_id
       WHERE a.status = ?
       ORDER BY a.created_at DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      [status === 'all' ? 'published' : status]
    )
    res.json({ success: true, data: rows })
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// GET /articles/admin/list  (admin — own only, superadmin all)
export async function getAdminArticles(req: Request, res: Response) {
  try {
    const where = isSA(req) ? '' : 'WHERE a.author_id = ?'
    const params = isSA(req) ? [] : [req.user!.id]
    const [rows]: any = await pool.query(
      `SELECT a.id, a.slug, a.title_mn, a.title_en, a.title_ru,
              a.cover_image, a.status, a.published_at, a.created_at,
              u.name AS author_name
       FROM articles a
       LEFT JOIN users u ON u.id = a.author_id
       ${where}
       ORDER BY a.created_at DESC LIMIT 200`,
      params
    )
    res.json({ success: true, data: rows })
  } catch {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// GET /articles/:slug  (public)
export async function getArticleBySlug(req: Request, res: Response) {
  try {
    const [rows]: any = await pool.execute(
      `SELECT a.*, u.name AS author_name FROM articles a
       LEFT JOIN users u ON u.id = a.author_id
       WHERE a.slug = ? AND a.status = 'published' LIMIT 1`,
      [req.params.slug]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Нийтлэл олдсонгүй' })
    res.json({ success: true, data: rows[0] })
  } catch (err: any) {
    console.error('getArticleBySlug:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// POST /articles  (admin)
export async function createArticle(req: Request, res: Response) {
  try {
    const b = req.body
    if (!b.title_mn) return res.status(400).json({ success: false, message: 'Монгол гарчиг заавал шаардлагатай' })

    const slug = `article-${Date.now()}`
    const coverImage = req.file ? `/uploads/images/${req.file.filename}` : null
    const isPublished = b.status === 'published'

    const [result]: any = await pool.execute(
      `INSERT INTO articles
         (slug, title_mn, title_en, title_ru,
          content_mn, content_en, content_ru,
          excerpt_mn, excerpt_en, excerpt_ru,
          cover_image, tags, status, author_id, published_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        slug,
        b.title_mn, b.title_en || '', b.title_ru || '',
        b.content_mn || null, b.content_en || null, b.content_ru || null,
        b.excerpt_mn || null, b.excerpt_en || null, b.excerpt_ru || null,
        coverImage,
        b.tags ? JSON.stringify(JSON.parse(b.tags)) : JSON.stringify([]),
        b.status || 'draft',
        req.user!.id,
        isPublished ? new Date() : null,
      ]
    )
    res.status(201).json({ success: true, data: { id: result.insertId, slug } })
  } catch (err: any) {
    console.error('createArticle:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// GET /articles/id/:id  (admin edit)
export async function getArticleById(req: Request, res: Response) {
  try {
    const [rows]: any = await pool.execute(
      `SELECT a.*, u.name AS author_name FROM articles a
       LEFT JOIN users u ON u.id = a.author_id
       WHERE a.id = ? LIMIT 1`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Нийтлэл олдсонгүй' })
    if (!await ownsArticle(req.params.id, req.user!.id, req.user!.role)) {
      return res.status(403).json({ success: false, message: 'Зөвшөөрөлгүй' })
    }
    res.json({ success: true, data: rows[0] })
  } catch {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// PUT /articles/:id  (admin — own only)
export async function updateArticle(req: Request, res: Response) {
  try {
    if (!await ownsArticle(req.params.id, req.user!.id, req.user!.role)) {
      return res.status(403).json({ success: false, message: 'Зөвхөн өөрийн нийтлэлийг засах боломжтой' })
    }
    const b = req.body
    const coverImage = req.file ? `/uploads/images/${req.file.filename}` : b.cover_image || null
    const isPublished = b.status === 'published'

    await pool.execute(
      `UPDATE articles SET
         title_mn=?, title_en=?, title_ru=?,
         content_mn=?, content_en=?, content_ru=?,
         excerpt_mn=?, excerpt_en=?, excerpt_ru=?,
         cover_image=?, status=?,
         published_at=COALESCE(IF(? AND published_at IS NULL, NOW(), published_at), published_at)
       WHERE id=?`,
      [
        b.title_mn, b.title_en || '', b.title_ru || '',
        b.content_mn || null, b.content_en || null, b.content_ru || null,
        b.excerpt_mn || null, b.excerpt_en || null, b.excerpt_ru || null,
        coverImage, b.status || 'draft',
        isPublished,
        req.params.id,
      ]
    )
    res.json({ success: true, message: 'Нийтлэл шинэчлэгдлээ' })
  } catch (err: any) {
    console.error('updateArticle:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// PATCH /articles/:id/status  (admin — own only)
export async function updateArticleStatus(req: Request, res: Response) {
  try {
    if (!await ownsArticle(req.params.id, req.user!.id, req.user!.role)) {
      return res.status(403).json({ success: false, message: 'Зөвхөн өөрийн нийтлэлийн төлвийг өөрчлөх боломжтой' })
    }
    const { status } = req.body
    if (!['draft', 'published'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Буруу статус' })
    }
    const isPublished = status === 'published'
    await pool.execute(
      `UPDATE articles SET status=?,
       published_at=COALESCE(IF(? AND published_at IS NULL, NOW(), published_at), published_at)
       WHERE id=?`,
      [status, isPublished, req.params.id]
    )
    res.json({ success: true, message: 'Нийтлэлийн статус шинэчлэгдлээ' })
  } catch (err: any) {
    console.error('updateArticleStatus:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// DELETE /articles/:id  (admin — own only)
export async function deleteArticle(req: Request, res: Response) {
  try {
    if (!await ownsArticle(req.params.id, req.user!.id, req.user!.role)) {
      return res.status(403).json({ success: false, message: 'Зөвхөн өөрийн нийтлэлийг устгах боломжтой' })
    }
    await pool.execute('DELETE FROM articles WHERE id = ?', [req.params.id])
    res.json({ success: true, message: 'Нийтлэл устгагдлаа' })
  } catch (err: any) {
    console.error('deleteArticle:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}
