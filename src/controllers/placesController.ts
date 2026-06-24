import { Request, Response } from 'express'
import pool from '../config/database'
import slugify from 'slugify'

function isSA(req: Request) { return req.user?.role === 'superadmin' }

async function ownsPlace(id: string | number, userId: number, role: string) {
  if (role === 'superadmin') return true
  const [r]: any = await pool.execute('SELECT created_by FROM places WHERE id=? LIMIT 1', [id])
  return r.length > 0 && r[0].created_by === userId
}

// Startup migration
export async function migratePlaces() {
  for (const sql of [
    `ALTER TABLE places ADD COLUMN IF NOT EXISTS aimag_center_km DECIMAL(8,1) DEFAULT NULL`,
    `ALTER TABLE places ADD COLUMN IF NOT EXISTS created_by INT DEFAULT NULL`,
  ]) {
    await pool.execute(sql).catch(() => {
      // MySQL 5.x fallback — strip IF NOT EXISTS
      return pool.execute(sql.replace(' IF NOT EXISTS', '')).catch(() => {})
    })
  }
}

// GET /places/admin/list  (admin — own only, superadmin all)
export async function getAdminPlaces(req: Request, res: Response) {
  try {
    const where = isSA(req) ? '' : 'WHERE p.created_by = ?'
    const params = isSA(req) ? [] : [req.user!.id]
    const [rows]: any = await pool.query(
      `SELECT p.id, p.slug, p.name_mn, p.name_en, p.name_ru,
              p.category, p.status, p.rating, p.review_count, p.created_at,
              COALESCE(
                (SELECT url FROM place_images WHERE place_id=p.id AND is_cover=1 ORDER BY id LIMIT 1),
                (SELECT url FROM place_images WHERE place_id=p.id ORDER BY id LIMIT 1)
              ) AS cover_url
       FROM places p
       ${where}
       ORDER BY p.created_at DESC LIMIT 200`,
      params
    )
    res.json({ success: true, data: rows })
  } catch {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// GET /places
export async function getPlaces(req: Request, res: Response) {
  try {
    const { category, status = 'published', page = 1, limit = 12, search } = req.query
    const pageNum  = Math.max(1, Number(page))
    const limitNum = Math.min(50, Math.max(1, Number(limit)))
    const offset   = (pageNum - 1) * limitNum

    const conditions: string[] = ['p.status = ?']
    const params: any[] = [status]

    if (category && category !== '') {
      conditions.push('p.category = ?')
      params.push(category)
    }
    if (search) {
      conditions.push('(p.name_mn LIKE ? OR p.name_en LIKE ? OR p.name_ru LIKE ?)')
      params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }

    const where = conditions.join(' AND ')

    // cover_url: is_cover=1 байгаа эхний зураг, байхгүй бол хамгийн эхний зураг
    const [rows]: any = await pool.query(
      `SELECT
         p.id, p.slug, p.name_mn, p.name_en, p.name_ru,
         p.category, p.status, p.rating, p.review_count,
         p.latitude, p.longitude, p.entry_fee, p.aimag_center_km, p.created_at,
         COALESCE(
           (SELECT url FROM place_images WHERE place_id = p.id AND is_cover = 1 ORDER BY id ASC LIMIT 1),
           (SELECT url FROM place_images WHERE place_id = p.id ORDER BY id ASC LIMIT 1)
         ) AS cover_url,
         GROUP_CONCAT(
           DISTINCT CONCAT(t.id, '::', t.key_name, '::', t.label_mn, '::', t.label_en, '::', t.label_ru)
           ORDER BY t.id SEPARATOR '||'
         ) AS tags_raw
       FROM places p
       LEFT JOIN place_tags pt ON pt.place_id = p.id
       LEFT JOIN tags t ON t.id = pt.tag_id
       WHERE ${where}
       GROUP BY p.id
       ORDER BY p.created_at DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      params
    )

    const [[countRow]]: any = await pool.query(
      `SELECT COUNT(*) AS total FROM places p WHERE ${where}`,
      params
    )

    const data = rows.map((r: any) => {
      // images: cover зураг байвал оруулна, байхгүй бол хоосон array
      const images = r.cover_url
        ? [{ id: 0, url: r.cover_url, is_cover: 1, sort_order: 0 }]
        : []

      // tags: '||' separator ашигласан, '::' field separator
      const tags = r.tags_raw
        ? r.tags_raw.split('||').map((s: string) => {
            const parts = s.split('::')
            return {
              id:       Number(parts[0]),
              key_name: parts[1] || '',
              label_mn: parts[2] || '',
              label_en: parts[3] || '',
              label_ru: parts[4] || '',
            }
          })
        : []

      // cover_url, tags_raw хэрэглэгчид харуулахгүй
      const { cover_url, tags_raw, ...rest } = r
      return { ...rest, images, tags }
    })

    res.json({
      success: true,
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: countRow.total,
        totalPages: Math.ceil(countRow.total / limitNum),
      },
    })
  } catch (err: any) {
    console.error('getPlaces error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// GET /places/:slug
export async function getPlaceBySlug(req: Request, res: Response) {
  try {
    const { slug } = req.params
    const [rows]: any = await pool.execute(
      'SELECT * FROM places WHERE slug = ? LIMIT 1',
      [slug]
    )
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Газар олдсонгүй' })
    }

    const place = rows[0]

    const [tags]: any = await pool.execute(
      `SELECT t.id, t.key_name, t.label_mn, t.label_en, t.label_ru, t.icon
       FROM tags t
       JOIN place_tags pt ON pt.tag_id = t.id
       WHERE pt.place_id = ?
       ORDER BY t.id`,
      [place.id]
    )

    const [images]: any = await pool.execute(
      `SELECT id, url, caption, is_cover, sort_order
       FROM place_images
       WHERE place_id = ?
       ORDER BY is_cover DESC, sort_order ASC, id ASC`,
      [place.id]
    )

    const [reviews]: any = await pool.execute(
      `SELECT r.id, r.rating, r.comment, r.created_at,
              u.name AS user_name, u.avatar AS user_avatar
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       WHERE r.place_id = ?
       ORDER BY r.created_at DESC
       LIMIT 20`,
      [place.id]
    )

    res.json({ success: true, data: { ...place, tags, images, reviews } })
  } catch (err: any) {
    console.error('getPlaceBySlug error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// POST /places (admin)
export async function createPlace(req: Request, res: Response) {
  try {
    const b = req.body
    const files = (req.files as Express.Multer.File[]) || []

    if (!b.name_mn) {
      return res.status(400).json({ success: false, message: 'Монгол нэр заавал шаардлагатай' })
    }

    const base = slugify(b.name_mn, { lower: true, strict: true }) || 'place'
    const slug = `${base}-${Date.now()}`

    const [result]: any = await pool.execute(
      `INSERT INTO places
         (slug, name_mn, name_en, name_ru,
          description_mn, description_en, description_ru,
          category, latitude, longitude, altitude, area, depth,
          best_season_mn, best_season_en, best_season_ru,
          entry_fee, open_hours_mn, open_hours_en, open_hours_ru,
          phone, aimag_center_km, status, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        slug,
        b.name_mn,
        b.name_en || '',
        b.name_ru || '',
        b.description_mn || null,
        b.description_en || null,
        b.description_ru || null,
        b.category || 'other',
        parseFloat(b.latitude)  || 0,
        parseFloat(b.longitude) || 0,
        b.altitude   || null,
        b.area       || null,
        b.depth      || null,
        b.best_season_mn || null,
        b.best_season_en || null,
        b.best_season_ru || null,
        parseFloat(b.entry_fee) || 0,
        b.open_hours_mn  || null,
        b.open_hours_en  || null,
        b.open_hours_ru  || null,
        b.phone      || null,
        b.aimag_center_km ? parseFloat(b.aimag_center_km) : null,
        b.status     || 'draft',
        req.user!.id,
      ]
    )
    const placeId = result.insertId

    // Tags
    if (b.tag_ids) {
      const ids: number[] = JSON.parse(b.tag_ids)
      for (const tagId of ids) {
        await pool.execute(
          'INSERT IGNORE INTO place_tags (place_id, tag_id) VALUES (?,?)',
          [placeId, tagId]
        )
      }
    }

    // Images — эхний файл cover болно
    for (let i = 0; i < files.length; i++) {
      await pool.execute(
        'INSERT INTO place_images (place_id, url, is_cover, sort_order) VALUES (?,?,?,?)',
        [placeId, `/uploads/images/${files[i].filename}`, i === 0 ? 1 : 0, i]
      )
    }

    res.status(201).json({ success: true, data: { id: placeId, slug } })
  } catch (err: any) {
    console.error('createPlace error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// PUT /places/:id (admin — own only)
export async function updatePlace(req: Request, res: Response) {
  try {
    if (!await ownsPlace(req.params.id, req.user!.id, req.user!.role)) {
      return res.status(403).json({ success: false, message: 'Зөвхөн өөрийн газрыг засах боломжтой' })
    }
    const { id } = req.params
    const b = req.body
    const files = (req.files as Express.Multer.File[]) || []

    await pool.execute(
      `UPDATE places SET
         name_mn=?, name_en=?, name_ru=?,
         description_mn=?, description_en=?, description_ru=?,
         category=?, latitude=?, longitude=?,
         altitude=?, area=?, depth=?,
         best_season_mn=?, best_season_en=?, best_season_ru=?,
         entry_fee=?, open_hours_mn=?, open_hours_en=?, open_hours_ru=?,
         phone=?, aimag_center_km=?, status=?
       WHERE id=?`,
      [
        b.name_mn, b.name_en || '', b.name_ru || '',
        b.description_mn || null, b.description_en || null, b.description_ru || null,
        b.category || 'other',
        parseFloat(b.latitude)  || 0,
        parseFloat(b.longitude) || 0,
        b.altitude || null, b.area || null, b.depth || null,
        b.best_season_mn || null, b.best_season_en || null, b.best_season_ru || null,
        parseFloat(b.entry_fee) || 0,
        b.open_hours_mn || null, b.open_hours_en || null, b.open_hours_ru || null,
        b.phone || null,
        b.aimag_center_km ? parseFloat(b.aimag_center_km) : null,
        b.status || 'draft',
        id,
      ]
    )

    // Tags солих
    if (b.tag_ids !== undefined) {
      await pool.execute('DELETE FROM place_tags WHERE place_id = ?', [id])
      const ids: number[] = JSON.parse(b.tag_ids || '[]')
      for (const tagId of ids) {
        await pool.execute(
          'INSERT IGNORE INTO place_tags (place_id, tag_id) VALUES (?,?)',
          [id, tagId]
        )
      }
    }

    // Шинэ зураг нэмэх
    if (files.length > 0) {
      // Одоо cover байгаа эсэхийг шалгана
      const [existing]: any = await pool.execute(
        'SELECT id FROM place_images WHERE place_id = ? AND is_cover = 1 LIMIT 1',
        [id]
      )
      const hasCover = existing.length > 0

      for (let i = 0; i < files.length; i++) {
        const isCover = !hasCover && i === 0 ? 1 : 0
        await pool.execute(
          'INSERT INTO place_images (place_id, url, is_cover, sort_order) VALUES (?,?,?,?)',
          [id, `/uploads/images/${files[i].filename}`, isCover, 999 + i]
        )
      }
    }

    res.json({ success: true, message: 'Газар шинэчлэгдлээ' })
  } catch (err: any) {
    console.error('updatePlace error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// DELETE /places/:id (admin — own only)
export async function deletePlace(req: Request, res: Response) {
  try {
    if (!await ownsPlace(req.params.id, req.user!.id, req.user!.role)) {
      return res.status(403).json({ success: false, message: 'Зөвхөн өөрийн газрыг устгах боломжтой' })
    }
    await pool.execute('DELETE FROM places WHERE id = ?', [req.params.id])
    res.json({ success: true, message: 'Газар устгагдлаа' })
  } catch (err: any) {
    console.error('deletePlace error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// PATCH /places/:id/status (admin — own only)
export async function updateStatus(req: Request, res: Response) {
  try {
    if (!await ownsPlace(req.params.id, req.user!.id, req.user!.role)) {
      return res.status(403).json({ success: false, message: 'Зөвхөн өөрийн газрын төлвийг өөрчлөх боломжтой' })
    }
    const { status } = req.body
    if (!['published', 'draft'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Статус буруу байна' })
    }
    await pool.execute('UPDATE places SET status = ? WHERE id = ?', [status, req.params.id])
    res.json({ success: true, message: 'Статус шинэчлэгдлээ' })
  } catch (err: any) {
    console.error('updateStatus error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// DELETE /places/images/:imageId (admin)
export async function deleteImage(req: Request, res: Response) {
  try {
    const { imageId } = req.params
    const [rows]: any = await pool.execute(
      'SELECT place_id, url, is_cover FROM place_images WHERE id = ? LIMIT 1',
      [imageId]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Зураг олдсонгүй' })

    const { place_id, url, is_cover } = rows[0]
    await pool.execute('DELETE FROM place_images WHERE id = ?', [imageId])

    // Устгасан зураг cover байсан бол дараагийн зургийг cover болгоно
    if (is_cover) {
      await pool.execute(
        'UPDATE place_images SET is_cover = 1 WHERE place_id = ? ORDER BY id ASC LIMIT 1',
        [place_id]
      )
    }

    // Disk дээрх файлыг устгана
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.join(process.cwd(), url)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

    res.json({ success: true, message: 'Зураг устгагдлаа' })
  } catch (err: any) {
    console.error('deleteImage error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// PATCH /places/images/:imageId/cover (admin)
export async function setCoverImage(req: Request, res: Response) {
  try {
    const { imageId } = req.params
    const [rows]: any = await pool.execute(
      'SELECT place_id FROM place_images WHERE id = ? LIMIT 1',
      [imageId]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Зураг олдсонгүй' })

    const { place_id } = rows[0]
    await pool.execute('UPDATE place_images SET is_cover = 0 WHERE place_id = ?', [place_id])
    await pool.execute('UPDATE place_images SET is_cover = 1 WHERE id = ?', [imageId])

    res.json({ success: true, message: 'Cover зураг шинэчлэгдлээ' })
  } catch (err: any) {
    console.error('setCoverImage error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// GET /places/id/:id  (admin — edit хийхэд ашиглана)
export async function getPlaceById(req: Request, res: Response) {
  try {
    const [rows]: any = await pool.execute('SELECT * FROM places WHERE id = ? LIMIT 1', [req.params.id])
    if (!rows.length) return res.status(404).json({ success: false, message: 'Газар олдсонгүй' })
    const place = rows[0]

    const [tags]: any = await pool.execute(
      `SELECT t.id, t.key_name, t.label_mn, t.label_en, t.label_ru, t.icon
       FROM tags t JOIN place_tags pt ON pt.tag_id = t.id
       WHERE pt.place_id = ? ORDER BY t.id`,
      [place.id]
    )
    const [images]: any = await pool.execute(
      `SELECT id, url, caption, is_cover, sort_order
       FROM place_images WHERE place_id = ?
       ORDER BY is_cover DESC, sort_order ASC, id ASC`,
      [place.id]
    )
    const [reviews]: any = await pool.execute(
      `SELECT r.id, r.rating, r.comment, r.created_at, u.name AS user_name, u.avatar AS user_avatar
       FROM reviews r JOIN users u ON u.id = r.user_id
       WHERE r.place_id = ? ORDER BY r.created_at DESC LIMIT 20`,
      [place.id]
    )
    res.json({ success: true, data: { ...place, tags, images, reviews } })
  } catch (err: any) {
    console.error('getPlaceById:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}
