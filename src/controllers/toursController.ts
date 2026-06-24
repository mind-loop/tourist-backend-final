import { Request, Response } from 'express'
import pool from '../config/database'
import * as qpay from '../services/qpayService'

// GET /tours  (public)
export async function getTours(req: Request, res: Response) {
  try {
    const { status = 'published', limit = 20 } = req.query
    const whereClause = status === 'all' ? '' : 'WHERE t.status = ?'
    const qParams: any[] = status === 'all' ? [Number(limit)] : [status, Number(limit)]

    const [rows]: any = await pool.query(
      `SELECT t.id, t.slug, t.title_mn, t.title_en, t.title_ru,
              t.start_date, t.end_date, t.price,
              t.max_participants, t.current_participants,
              t.cover_image, t.status, t.created_at
       FROM tours t
       ${whereClause}
       ORDER BY t.start_date ASC, t.created_at DESC
       LIMIT ?`,
      qParams
    )
    res.json({ success: true, data: rows })
  } catch (err: any) {
    console.error('getTours:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// GET /tours/admin/list  (admin — own tours only, superadmin sees all)
export async function getAdminTours(req: Request, res: Response) {
  try {
    const isSuperAdmin = req.user!.role === 'superadmin'
    const whereClause = isSuperAdmin ? '' : 'WHERE t.created_by = ?'
    const params: any[] = isSuperAdmin ? [] : [req.user!.id]

    const [rows]: any = await pool.query(
      `SELECT t.id, t.slug, t.title_mn, t.title_en, t.title_ru,
              t.start_date, t.end_date, t.price,
              t.max_participants, t.current_participants,
              t.cover_image, t.status, t.created_by, t.created_at
       FROM tours t
       ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT 200`,
      params
    )
    res.json({ success: true, data: rows })
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// GET /tours/id/:id  (admin)
export async function getTourById(req: Request, res: Response) {
  try {
    const [rows]: any = await pool.execute('SELECT * FROM tours WHERE id = ? LIMIT 1', [req.params.id])
    if (!rows.length) return res.status(404).json({ success: false, message: 'Аялал олдсонгүй' })
    const tour = rows[0]
    if (req.user!.role !== 'superadmin' && tour.created_by !== req.user!.id) {
      return res.status(403).json({ success: false, message: 'Зөвшөөрөлгүй' })
    }
    res.json({ success: true, data: tour })
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// GET /tours/:slug  (public)
export async function getTourBySlug(req: Request, res: Response) {
  try {
    const [rows]: any = await pool.execute(
      'SELECT * FROM tours WHERE slug = ? AND status = "published" LIMIT 1',
      [req.params.slug]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Аялал олдсонгүй' })
    res.json({ success: true, data: rows[0] })
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// POST /tours/:id/register  (public, no auth)
export async function registerTour(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { name, email = '', phone, participant_count = 1, note = '' } = req.body

    if (!name?.trim() || !phone?.trim()) {
      return res.status(400).json({ success: false, message: 'Нэр болон утасны дугаар шаардлагатай' })
    }

    const [tourRows]: any = await pool.execute(
      'SELECT id, title_mn, max_participants, current_participants, price FROM tours WHERE id = ? AND status = "published" LIMIT 1',
      [id]
    )
    if (!tourRows.length) return res.status(404).json({ success: false, message: 'Аялал олдсонгүй' })

    const tour = tourRows[0]
    const count = Math.max(1, Number(participant_count) || 1)
    const tourPrice = Number(tour.price) || 0
    const totalAmount = tourPrice * count

    if (tour.max_participants > 0 &&
        tour.current_participants + count > tour.max_participants) {
      return res.status(400).json({ success: false, message: 'Бүртгүүлэх боломжгүй, суудал дүүрсэн байна' })
    }

    // Free tour: directly confirmed
    if (tourPrice <= 0) {
      await pool.execute(
        `INSERT INTO tour_registrations (tour_id, name, email, phone, participant_count, note, qpay_status, amount, status)
         VALUES (?, ?, ?, ?, ?, ?, 'free', 0, 'confirmed')`,
        [id, name.trim(), email.trim(), phone.trim(), count, note.trim() || null]
      )
      await pool.execute(
        'UPDATE tours SET current_participants = current_participants + ? WHERE id = ?',
        [count, id]
      )
      return res.status(201).json({ success: true, message: 'Амжилттай бүртгэгдлээ!', data: { paid: true } })
    }

    // Paid tour: create registration then QPay invoice
    const [regResult]: any = await pool.execute(
      `INSERT INTO tour_registrations (tour_id, name, email, phone, participant_count, note, qpay_status, amount, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, 'pending')`,
      [id, name.trim(), email.trim(), phone.trim(), count, note.trim() || null, totalAmount]
    )
    const registrationId = regResult.insertId

    await pool.execute(
      'UPDATE tours SET current_participants = current_participants + ? WHERE id = ?',
      [count, id]
    )

    // Create QPay invoice
    const invoiceNo = `TOUR-${id}-REG-${registrationId}-${Date.now()}`
    const invoice = await qpay.createInvoice({
      invoiceNo,
      description: `${tour.title_mn} — ${name.trim()} (${count} хүн)`,
      amount: totalAmount,
      customerName: name.trim(),
    })

    await pool.execute(
      'UPDATE tour_registrations SET qpay_invoice_id = ? WHERE id = ?',
      [invoice.invoiceId, registrationId]
    )

    res.status(201).json({
      success: true,
      message: 'Бүртгэл үүсгэгдлээ. Төлбөр хийнэ үү.',
      data: {
        registrationId,
        invoiceId:  invoice.invoiceId,
        qrImage:    invoice.qrImage,
        qrText:     invoice.qrText,
        amount:     totalAmount,
        paid:       false,
      },
    })
  } catch (err: any) {
    console.error('registerTour:', err)
    res.status(500).json({ success: false, message: err.message || 'Серверийн алдаа' })
  }
}

// POST /tours/reg-check  (public — poll until paid)
export async function checkTourRegistrationPayment(req: Request, res: Response) {
  try {
    const { invoiceId } = req.body
    if (!invoiceId) return res.status(400).json({ success: false, message: 'invoiceId шаардлагатай' })

    const [rows]: any = await pool.execute(
      'SELECT id, qpay_status FROM tour_registrations WHERE qpay_invoice_id = ? LIMIT 1',
      [invoiceId]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Бүртгэл олдсонгүй' })

    const reg = rows[0]
    if (reg.qpay_status === 'paid') {
      return res.json({ success: true, data: { paid: true } })
    }

    const { paid } = await qpay.checkPayment(invoiceId)
    if (paid) {
      await pool.execute(
        `UPDATE tour_registrations SET qpay_status='paid', status='confirmed', paid_at=NOW() WHERE id=?`,
        [reg.id]
      )
    }
    res.json({ success: true, data: { paid } })
  } catch (err: any) {
    console.error('checkTourRegistrationPayment:', err)
    res.status(500).json({ success: false, message: err.message || 'Серверийн алдаа' })
  }
}

// GET /tours/:id/settlement  (superadmin)
export async function getTourSettlement(req: Request, res: Response) {
  try {
    const { id } = req.params

    const [tourRows]: any = await pool.execute(
      `SELECT t.*, u.name AS creator_name, u.email AS creator_email
       FROM tours t
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.id = ? LIMIT 1`,
      [id]
    )
    if (!tourRows.length) return res.status(404).json({ success: false, message: 'Аялал олдсонгүй' })
    const tour = tourRows[0]

    // Paid registrations
    const [paidRows]: any = await pool.execute(
      `SELECT SUM(amount) AS total_collected, COUNT(*) AS paid_count, SUM(participant_count) AS total_participants
       FROM tour_registrations
       WHERE tour_id = ? AND qpay_status = 'paid'`,
      [id]
    )
    const totalCollected = Number(paidRows[0]?.total_collected) || 0
    const paidCount      = Number(paidRows[0]?.paid_count) || 0
    const totalParticipants = Number(paidRows[0]?.total_participants) || 0

    // Commission rate from content_pricing
    const [commRows]: any = await pool.execute(
      `SELECT fee FROM content_pricing WHERE content_type = 'tour_commission' LIMIT 1`
    )
    const commissionRate = Number(commRows[0]?.fee) || 0

    const commissionAmount = Math.round(totalCollected * commissionRate / 100)
    const adminAmount      = totalCollected - commissionAmount

    res.json({
      success: true,
      data: {
        tour: {
          id: tour.id,
          title_mn: tour.title_mn,
          end_date: tour.end_date,
          price: Number(tour.price),
          payment_bank: tour.payment_bank,
          payment_account: tour.payment_account,
          payment_name: tour.payment_name,
          settlement_status: tour.settlement_status || 'pending',
          settled_at: tour.settled_at,
          creator_name: tour.creator_name,
          creator_email: tour.creator_email,
        },
        totalCollected,
        paidCount,
        totalParticipants,
        commissionRate,
        commissionAmount,
        adminAmount,
      },
    })
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// POST /tours/:id/settle  (superadmin)
export async function settleTour(req: Request, res: Response) {
  try {
    await pool.execute(
      `UPDATE tours SET settlement_status='settled', settled_at=NOW(), settled_by=? WHERE id=?`,
      [req.user!.id, req.params.id]
    )
    res.json({ success: true, message: 'Тооцоо хийгдлээ' })
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// GET /tours/:id/registrations  (admin)
export async function getTourRegistrations(req: Request, res: Response) {
  try {
    if (!await checkOwnership(req.params.id, req.user!.id, req.user!.role)) {
      return res.status(403).json({ success: false, message: 'Зөвшөөрөлгүй' })
    }
    const [rows]: any = await pool.query(
      'SELECT * FROM tour_registrations WHERE tour_id = ? ORDER BY created_at DESC',
      [req.params.id]
    )
    const [[{ total_participants }]]: any = await pool.query(
      'SELECT COALESCE(SUM(participant_count),0) AS total_participants FROM tour_registrations WHERE tour_id = ? AND status != "cancelled"',
      [req.params.id]
    )
    res.json({ success: true, data: rows, total_participants: Number(total_participants) })
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// PATCH /tours/registrations/:regId/status  (admin)
export async function updateRegistrationStatus(req: Request, res: Response) {
  try {
    const { status } = req.body
    if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Статус буруу' })
    }

    // Fetch current registration to know old status + participant_count
    const [rows]: any = await pool.execute(
      'SELECT tour_id, status AS old_status, participant_count FROM tour_registrations WHERE id = ? LIMIT 1',
      [req.params.regId]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Бүртгэл олдсонгүй' })

    const { tour_id, old_status, participant_count } = rows[0]

    await pool.execute('UPDATE tour_registrations SET status = ? WHERE id = ?', [status, req.params.regId])

    // Adjust current_participants count
    if (old_status !== 'cancelled' && status === 'cancelled') {
      // cancelling an active registration → subtract
      await pool.execute(
        'UPDATE tours SET current_participants = GREATEST(0, current_participants - ?) WHERE id = ?',
        [participant_count, tour_id]
      )
    } else if (old_status === 'cancelled' && status !== 'cancelled') {
      // restoring a cancelled registration → add back
      await pool.execute(
        'UPDATE tours SET current_participants = current_participants + ? WHERE id = ?',
        [participant_count, tour_id]
      )
    }

    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// POST /tours  (admin)
export async function createTour(req: Request, res: Response) {
  try {
    const b = req.body
    const files = req.files as Record<string, Express.Multer.File[]> | undefined
    const coverFile = files?.image?.[0] || null
    const qrFile    = files?.qr_image?.[0] || null
    const cover_image = coverFile ? `/uploads/images/${coverFile.filename}` : b.cover_image || null
    const payment_qr  = qrFile    ? `/uploads/images/${qrFile.filename}`   : b.payment_qr || null
    const slug = `tour-${Date.now()}`

    const [result]: any = await pool.execute(
      `INSERT INTO tours
         (slug, title_mn, title_en, title_ru,
          description_mn, description_en, description_ru,
          highlights_mn, start_date, end_date, price,
          max_participants, meeting_point_mn,
          contact_phone, contact_email,
          payment_bank, payment_account, payment_name, payment_qr,
          cover_image, status, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        slug,
        b.title_mn || '', b.title_en || '', b.title_ru || '',
        b.description_mn || null, b.description_en || null, b.description_ru || null,
        b.highlights_mn || null,
        b.start_date || null, b.end_date || null,
        parseFloat(b.price) || 0,
        parseInt(b.max_participants) || 0,
        b.meeting_point_mn || null,
        b.contact_phone || null, b.contact_email || null,
        b.payment_bank || null, b.payment_account || null, b.payment_name || null,
        payment_qr,
        cover_image, b.status || 'draft',
        req.user!.id,
      ]
    )
    res.status(201).json({ success: true, data: { id: (result as any).insertId, slug } })
  } catch (err: any) {
    console.error('createTour:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

async function checkOwnership(tourId: string | number, userId: number, role: string): Promise<boolean> {
  if (role === 'superadmin') return true
  const [rows]: any = await pool.execute('SELECT created_by FROM tours WHERE id = ? LIMIT 1', [tourId])
  return rows.length > 0 && rows[0].created_by === userId
}

// PUT /tours/:id  (admin)
export async function updateTour(req: Request, res: Response) {
  try {
    if (!await checkOwnership(req.params.id, req.user!.id, req.user!.role)) {
      return res.status(403).json({ success: false, message: 'Зөвхөн өөрийн аялалыг засах боломжтой' })
    }
    const b = req.body
    const files = req.files as Record<string, Express.Multer.File[]> | undefined
    const coverFile = files?.image?.[0] || null
    const qrFile    = files?.qr_image?.[0] || null
    const cover_image = coverFile ? `/uploads/images/${coverFile.filename}` : b.cover_image || null
    const payment_qr  = qrFile    ? `/uploads/images/${qrFile.filename}`   : b.payment_qr || null

    await pool.execute(
      `UPDATE tours SET
         title_mn=?, title_en=?, title_ru=?,
         description_mn=?, description_en=?, description_ru=?,
         highlights_mn=?, start_date=?, end_date=?, price=?,
         max_participants=?, meeting_point_mn=?,
         contact_phone=?, contact_email=?,
         payment_bank=?, payment_account=?, payment_name=?, payment_qr=?,
         cover_image=?, status=?
       WHERE id=?`,
      [
        b.title_mn || '', b.title_en || '', b.title_ru || '',
        b.description_mn || null, b.description_en || null, b.description_ru || null,
        b.highlights_mn || null,
        b.start_date || null, b.end_date || null,
        parseFloat(b.price) || 0,
        parseInt(b.max_participants) || 0,
        b.meeting_point_mn || null,
        b.contact_phone || null, b.contact_email || null,
        b.payment_bank || null, b.payment_account || null, b.payment_name || null,
        payment_qr,
        cover_image, b.status || 'draft',
        req.params.id,
      ]
    )
    res.json({ success: true, message: 'Аялал шинэчлэгдлээ' })
  } catch (err: any) {
    console.error('updateTour:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// DELETE /tours/:id  (admin)
export async function deleteTour(req: Request, res: Response) {
  try {
    if (!await checkOwnership(req.params.id, req.user!.id, req.user!.role)) {
      return res.status(403).json({ success: false, message: 'Зөвхөн өөрийн аялалыг устгах боломжтой' })
    }
    const [regs]: any = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM tour_registrations
       WHERE tour_id = ? AND status != 'cancelled'`,
      [req.params.id]
    )
    if (Number(regs[0].cnt) > 0) {
      return res.status(400).json({
        success: false,
        message: 'Захиалга бүртгэлтэй аялалыг устгах боломжгүй',
      })
    }
    await pool.execute('DELETE FROM tours WHERE id = ?', [req.params.id])
    res.json({ success: true, message: 'Аялал устгагдлаа' })
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// PATCH /tours/:id/status  (admin)
export async function updateTourStatus(req: Request, res: Response) {
  try {
    if (!await checkOwnership(req.params.id, req.user!.id, req.user!.role)) {
      return res.status(403).json({ success: false, message: 'Зөвхөн өөрийн аялалын төлвийг өөрчлөх боломжтой' })
    }
    const { status } = req.body
    if (!['published', 'draft'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Статус буруу' })
    }
    await pool.execute('UPDATE tours SET status = ? WHERE id = ?', [status, req.params.id])
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// Startup migration
export async function migrateTours() {
  // Add settlement + payment columns (safe — ignore if already exists)
  const alterQueries = [
    `ALTER TABLE tours ADD COLUMN IF NOT EXISTS settlement_status ENUM('pending','settled') DEFAULT 'pending'`,
    `ALTER TABLE tours ADD COLUMN IF NOT EXISTS settled_at TIMESTAMP NULL`,
    `ALTER TABLE tours ADD COLUMN IF NOT EXISTS settled_by INT DEFAULT NULL`,
    `ALTER TABLE tours ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50) DEFAULT NULL`,
    `ALTER TABLE tours ADD COLUMN IF NOT EXISTS contact_email VARCHAR(150) DEFAULT NULL`,
    `ALTER TABLE tour_registrations ADD COLUMN IF NOT EXISTS qpay_invoice_id VARCHAR(200) DEFAULT NULL`,
    `ALTER TABLE tour_registrations ADD COLUMN IF NOT EXISTS qpay_status ENUM('free','pending','paid') DEFAULT 'free'`,
    `ALTER TABLE tour_registrations ADD COLUMN IF NOT EXISTS amount DECIMAL(10,2) DEFAULT 0`,
    `ALTER TABLE tour_registrations ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP NULL`,
  ]
  for (const q of alterQueries) {
    await pool.execute(q).catch(() => {/* column may already exist in MySQL 5.x */})
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tours (
      id                   INT AUTO_INCREMENT PRIMARY KEY,
      slug                 VARCHAR(200) NOT NULL UNIQUE,
      title_mn             VARCHAR(300) NOT NULL,
      title_en             VARCHAR(300) DEFAULT '',
      title_ru             VARCHAR(300) DEFAULT '',
      description_mn       LONGTEXT DEFAULT NULL,
      description_en       LONGTEXT DEFAULT NULL,
      description_ru       LONGTEXT DEFAULT NULL,
      highlights_mn        TEXT DEFAULT NULL,
      start_date           DATE DEFAULT NULL,
      end_date             DATE DEFAULT NULL,
      price                DECIMAL(10,2) DEFAULT 0,
      max_participants     INT DEFAULT 0,
      current_participants INT DEFAULT 0,
      meeting_point_mn     VARCHAR(300) DEFAULT NULL,
      payment_bank         VARCHAR(100) DEFAULT NULL,
      payment_account      VARCHAR(100) DEFAULT NULL,
      payment_name         VARCHAR(200) DEFAULT NULL,
      payment_qr           VARCHAR(500) DEFAULT NULL,
      cover_image          VARCHAR(500) DEFAULT NULL,
      status               ENUM('published','draft') DEFAULT 'draft',
      created_by           INT DEFAULT NULL,
      created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_slug   (slug),
      INDEX idx_status (status)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tour_registrations (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      tour_id           INT NOT NULL,
      name              VARCHAR(200) NOT NULL,
      email             VARCHAR(150) DEFAULT '',
      phone             VARCHAR(50) NOT NULL,
      participant_count INT DEFAULT 1,
      note              TEXT DEFAULT NULL,
      qpay_invoice_id   VARCHAR(200) DEFAULT NULL,
      qpay_status       ENUM('free','pending','paid') DEFAULT 'free',
      amount            DECIMAL(10,2) DEFAULT 0,
      paid_at           TIMESTAMP NULL,
      status            ENUM('pending','confirmed','cancelled') DEFAULT 'pending',
      created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE,
      INDEX idx_tour (tour_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)
}
