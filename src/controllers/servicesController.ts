import { Request, Response } from 'express'
import pool from '../config/database'
import slugify from 'slugify'
import { autoTranslateFields } from '../utils/autoTranslate'
import { alterTableSafe } from '../utils/dbMigrate'
import { uploadImage } from '../services/uploadCloudService'

function isSA(req: Request) { return req.user?.role === 'superadmin' }

async function ownsService(id: string | number, userId: number, role: string) {
  if (role === 'superadmin') return true
  const [r]: any = await pool.execute('SELECT created_by FROM services WHERE id=? LIMIT 1', [id])
  return r.length > 0 && r[0].created_by === userId
}

// Startup migration
export async function migrateServices() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS services (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      slug           VARCHAR(200) NOT NULL UNIQUE,
      name_mn        VARCHAR(200) NOT NULL,
      name_en        VARCHAR(200) DEFAULT '',
      name_ru        VARCHAR(200) DEFAULT '',
      description_mn LONGTEXT,
      description_en LONGTEXT,
      description_ru LONGTEXT,
      category       VARCHAR(30) NOT NULL DEFAULT 'other',
      address_mn     VARCHAR(300) DEFAULT NULL,
      address_en     VARCHAR(300) DEFAULT NULL,
      address_ru     VARCHAR(300) DEFAULT NULL,
      phone          VARCHAR(50)  DEFAULT NULL,
      open_hours_mn  VARCHAR(200) DEFAULT NULL,
      open_hours_en  VARCHAR(200) DEFAULT NULL,
      open_hours_ru  VARCHAR(200) DEFAULT NULL,
      latitude       DECIMAL(10,7) DEFAULT NULL,
      longitude      DECIMAL(10,7) DEFAULT NULL,
      cover_image    VARCHAR(500) DEFAULT NULL,
      youtube_url    VARCHAR(500) DEFAULT NULL,
      status         ENUM('published','draft') NOT NULL DEFAULT 'draft',
      created_by     INT DEFAULT NULL,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_slug     (slug),
      INDEX idx_status   (status),
      INDEX idx_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // category нь эрт үед ENUM('hotel','restaurant','repair','other') байсан —
  // одоо чөлөөт ангилалын жагсаалт болгож VARCHAR руу шилжүүлж, хуучин утгуудыг шинэ key рүү мапп хийнэ
  await alterTableSafe(`ALTER TABLE services ADD COLUMN IF NOT EXISTS youtube_url VARCHAR(500) DEFAULT NULL`)
  await pool.execute(`ALTER TABLE services MODIFY COLUMN category VARCHAR(30) NOT NULL DEFAULT 'other'`).catch(() => {})
  await pool.execute(`UPDATE services SET category='accommodation' WHERE category='hotel'`).catch(() => {})
  await pool.execute(`UPDATE services SET category='car_repair' WHERE category='repair'`).catch(() => {})
}

// GET /services  (public)
export async function getServices(req: Request, res: Response) {
  try {
    const { category, status = 'published', page = 1, limit = 12, search } = req.query
    const pageNum  = Math.max(1, Number(page))
    const limitNum = Math.min(50, Math.max(1, Number(limit)))
    const offset   = (pageNum - 1) * limitNum

    const conditions: string[] = ['status = ?']
    const params: any[] = [status]

    if (category && category !== '') {
      conditions.push('category = ?')
      params.push(category)
    }
    if (search) {
      conditions.push('(name_mn LIKE ? OR name_en LIKE ? OR name_ru LIKE ?)')
      params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }

    const where = conditions.join(' AND ')

    const [rows]: any = await pool.query(
      `SELECT * FROM services WHERE ${where} ORDER BY created_at DESC LIMIT ${limitNum} OFFSET ${offset}`,
      params
    )
    const [[countRow]]: any = await pool.query(`SELECT COUNT(*) AS total FROM services WHERE ${where}`, params)

    res.json({
      success: true,
      data: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: countRow.total,
        totalPages: Math.ceil(countRow.total / limitNum),
      },
    })
  } catch (err: any) {
    console.error('getServices error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// GET /services/admin/list  (admin — own only, superadmin all)
export async function getAdminServices(req: Request, res: Response) {
  try {
    const where = isSA(req) ? '' : 'WHERE created_by = ?'
    const params = isSA(req) ? [] : [req.user!.id]
    const [rows]: any = await pool.query(
      `SELECT * FROM services ${where} ORDER BY created_at DESC LIMIT 200`,
      params
    )
    res.json({ success: true, data: rows })
  } catch {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// GET /services/:slug  (public)
export async function getServiceBySlug(req: Request, res: Response) {
  try {
    const [rows]: any = await pool.execute(
      `SELECT * FROM services WHERE slug = ? AND status = 'published' LIMIT 1`,
      [req.params.slug]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Үйлчилгээ олдсонгүй' })
    res.json({ success: true, data: rows[0] })
  } catch (err: any) {
    console.error('getServiceBySlug error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// GET /services/id/:id  (admin edit)
export async function getServiceById(req: Request, res: Response) {
  try {
    const [rows]: any = await pool.execute('SELECT * FROM services WHERE id = ? LIMIT 1', [req.params.id])
    if (!rows.length) return res.status(404).json({ success: false, message: 'Үйлчилгээ олдсонгүй' })
    res.json({ success: true, data: rows[0] })
  } catch (err: any) {
    console.error('getServiceById error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// POST /services  (admin)
export async function createService(req: Request, res: Response) {
  try {
    const b = req.body
    if (!b.name_mn) return res.status(400).json({ success: false, message: 'Монгол нэр заавал шаардлагатай' })

    await autoTranslateFields(b, ['name', 'description', 'address', 'open_hours'])

    const base = slugify(b.name_mn, { lower: true, strict: true }) || 'service'
    const slug = `${base}-${Date.now()}`
    const cover_image = req.file ? (await uploadImage(req.file)).url : null

    const [result]: any = await pool.execute(
      `INSERT INTO services
         (slug, name_mn, name_en, name_ru,
          description_mn, description_en, description_ru,
          category, address_mn, address_en, address_ru,
          phone, open_hours_mn, open_hours_en, open_hours_ru,
          latitude, longitude, cover_image, youtube_url, status, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        slug,
        b.name_mn, b.name_en || '', b.name_ru || '',
        b.description_mn || null, b.description_en || null, b.description_ru || null,
        b.category || 'other',
        b.address_mn || null, b.address_en || null, b.address_ru || null,
        b.phone || null,
        b.open_hours_mn || null, b.open_hours_en || null, b.open_hours_ru || null,
        b.latitude ? parseFloat(b.latitude) : null,
        b.longitude ? parseFloat(b.longitude) : null,
        cover_image, b.youtube_url || null, b.status || 'draft',
        req.user!.id,
      ]
    )
    res.status(201).json({ success: true, data: { id: result.insertId, slug } })
  } catch (err: any) {
    console.error('createService error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// PUT /services/:id  (admin — own only)
export async function updateService(req: Request, res: Response) {
  try {
    if (!await ownsService(req.params.id, req.user!.id, req.user!.role)) {
      return res.status(403).json({ success: false, message: 'Зөвхөн өөрийн үйлчилгээг засах боломжтой' })
    }
    const { id } = req.params
    const b = req.body

    await autoTranslateFields(b, ['name', 'description', 'address', 'open_hours'])

    const cover_image = req.file ? (await uploadImage(req.file)).url : b.cover_image || null

    await pool.execute(
      `UPDATE services SET
         name_mn=?, name_en=?, name_ru=?,
         description_mn=?, description_en=?, description_ru=?,
         category=?, address_mn=?, address_en=?, address_ru=?,
         phone=?, open_hours_mn=?, open_hours_en=?, open_hours_ru=?,
         latitude=?, longitude=?, cover_image=?, youtube_url=?, status=?
       WHERE id=?`,
      [
        b.name_mn, b.name_en || '', b.name_ru || '',
        b.description_mn || null, b.description_en || null, b.description_ru || null,
        b.category || 'other',
        b.address_mn || null, b.address_en || null, b.address_ru || null,
        b.phone || null,
        b.open_hours_mn || null, b.open_hours_en || null, b.open_hours_ru || null,
        b.latitude ? parseFloat(b.latitude) : null,
        b.longitude ? parseFloat(b.longitude) : null,
        cover_image, b.youtube_url || null, b.status || 'draft',
        id,
      ]
    )
    res.json({ success: true, message: 'Үйлчилгээ шинэчлэгдлээ' })
  } catch (err: any) {
    console.error('updateService error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// DELETE /services/:id  (admin — own only)
export async function deleteService(req: Request, res: Response) {
  try {
    if (!await ownsService(req.params.id, req.user!.id, req.user!.role)) {
      return res.status(403).json({ success: false, message: 'Зөвхөн өөрийн үйлчилгээг устгах боломжтой' })
    }
    await pool.execute('DELETE FROM services WHERE id = ?', [req.params.id])
    res.json({ success: true, message: 'Үйлчилгээ устгагдлаа' })
  } catch (err: any) {
    console.error('deleteService error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// PATCH /services/:id/status  (admin — own only)
export async function updateServiceStatus(req: Request, res: Response) {
  try {
    if (!await ownsService(req.params.id, req.user!.id, req.user!.role)) {
      return res.status(403).json({ success: false, message: 'Зөвхөн өөрийн үйлчилгээний төлвийг өөрчлөх боломжтой' })
    }
    const { status } = req.body
    if (!['published', 'draft'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Статус буруу байна' })
    }
    await pool.execute('UPDATE services SET status = ? WHERE id = ?', [status, req.params.id])
    res.json({ success: true, message: 'Статус шинэчлэгдлээ' })
  } catch (err: any) {
    console.error('updateServiceStatus error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}
