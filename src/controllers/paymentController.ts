import { Request, Response } from 'express'
import pool from '../config/database'
import * as qpay from '../services/qpayService'
import { getFeeFor, type ContentType } from './pricingController'

// GET /pricing/fee/:contentType  — frontend checks price before showing QPay
export async function getContentFee(req: Request, res: Response) {
  try {
    const contentType = req.params.contentType as ContentType
    const fee = await getFeeFor(contentType)
    res.json({ success: true, data: { fee } })
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// POST /pay/create  (admin — not superadmin)
// body: { contentType, contentId }
export async function createContentPayment(req: Request, res: Response) {
  try {
    const { contentType, contentId } = req.body as { contentType: ContentType; contentId: number }

    if (!contentType || !contentId) {
      return res.status(400).json({ success: false, message: 'contentType, contentId шаардлагатай' })
    }

    const fee = await getFeeFor(contentType)
    if (fee <= 0) {
      return res.status(400).json({ success: false, message: 'Энэ агуулга үнэгүй, QPay шаардлагагүй' })
    }

    const contentLabel: Record<ContentType, string> = {
      tourist_place:    'Үзэсгэлэнт газар',
      historical_place: 'Хөшөө дурсгал',
      tour:             'Аялал',
      banner:           'Баннер',
      article:          'Нийтлэл',
    }

    const invoiceNo = `${contentType.toUpperCase()}-${contentId}-${Date.now()}`
    const result = await qpay.createInvoice({
      invoiceNo,
      description: `${contentLabel[contentType] ?? contentType} байршуулах хураамж #${contentId}`,
      amount: fee,
    })

    if (!result.invoiceId) {
      throw new Error('QPay invoice_id хоосон байна — response format шалгана уу')
    }

    const userId = req.user?.id ?? null
    const qrText  = result.qrText  || null
    const qrImage = result.qrImage || null

    await pool.execute(
      `INSERT INTO content_payments
         (content_type, content_id, user_id, invoice_id, amount, qr_text, qr_image)
       VALUES (?,?,?,?,?,?,?)`,
      [contentType, Number(contentId), userId, result.invoiceId, fee, qrText, qrImage]
    )

    res.json({
      success: true,
      data: {
        invoiceId: result.invoiceId,
        qrImage:   qrImage,
        qrText:    qrText,
        amount:    fee,
      },
    })
  } catch (err: any) {
    console.error('createContentPayment:', err)
    res.status(500).json({ success: false, message: err.message || 'QPay алдаа' })
  }
}

// GET /pay/check/:invoiceId  (admin polling)
export async function checkContentPayment(req: Request, res: Response) {
  try {
    const { invoiceId } = req.params

    // Already paid?
    const [existing]: any = await pool.execute(
      `SELECT content_type, content_id, status FROM content_payments WHERE invoice_id = ? LIMIT 1`,
      [invoiceId]
    )
    if (!existing.length) return res.status(404).json({ success: false, message: 'Нэхэмжлэл олдсонгүй' })
    if (existing[0].status === 'paid') {
      return res.json({ success: true, data: { paid: true } })
    }

    const { paid } = await qpay.checkPayment(invoiceId)

    if (paid) {
      await pool.execute(
        `UPDATE content_payments SET status='paid', paid_at=NOW() WHERE invoice_id=?`,
        [invoiceId]
      )
      await publishContent(existing[0].content_type as ContentType, existing[0].content_id)
    }

    res.json({ success: true, data: { paid } })
  } catch (err: any) {
    console.error('checkContentPayment:', err)
    res.status(500).json({ success: false, message: err.message || 'QPay шалгах алдаа' })
  }
}

// POST /pay/callback  (QPay webhook — no auth)
// QPay sends: { payment_id, invoice_id } or just { invoice_id }
export async function qpayCallback(req: Request, res: Response) {
  // Always respond 200 first — QPay retries if it gets non-200
  res.json({ success: true })

  try {
    // QPay may send invoice_id directly or nested inside object
    const body = req.body || {}
    const invoice_id: string =
      body.invoice_id ||
      body.invoiceId  ||
      body.payment?.invoice_id ||
      ''

    if (!invoice_id) {
      console.warn('[QPay callback] No invoice_id in body:', JSON.stringify(body))
      return
    }

    console.log('[QPay callback] invoice_id:', invoice_id)

    const { paid } = await qpay.checkPayment(invoice_id)
    if (!paid) return

    // 1. Check content_payments (admin content publishing fees)
    const [cpRows]: any = await pool.execute(
      'SELECT id, content_type, content_id FROM content_payments WHERE invoice_id = ? AND status != ? LIMIT 1',
      [invoice_id, 'paid']
    )
    if (cpRows.length) {
      await pool.execute(
        `UPDATE content_payments SET status='paid', paid_at=NOW() WHERE invoice_id=?`,
        [invoice_id]
      )
      await publishContent(cpRows[0].content_type as ContentType, cpRows[0].content_id)
      console.log('[QPay callback] content_payment paid:', cpRows[0].content_type, cpRows[0].content_id)
    }

    // 2. Check tour_registrations (tour booking payments)
    const [trRows]: any = await pool.execute(
      `SELECT id FROM tour_registrations WHERE qpay_invoice_id = ? AND qpay_status != 'paid' LIMIT 1`,
      [invoice_id]
    )
    if (trRows.length) {
      await pool.execute(
        `UPDATE tour_registrations SET qpay_status='paid', status='confirmed', paid_at=NOW() WHERE id=?`,
        [trRows[0].id]
      )
      console.log('[QPay callback] tour_registration paid, id:', trRows[0].id)
    }
  } catch (err) {
    console.error('[QPay callback] error:', err)
  }
}

// GET /pay/upgrade/fee  (any authenticated user)
export async function getUpgradeFee(req: Request, res: Response) {
  try {
    const fee = await getFeeFor('admin_upgrade')
    res.json({ success: true, data: { fee } })
  } catch {
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// POST /pay/upgrade  (any authenticated user — not admin yet)
export async function createUpgradePayment(req: Request, res: Response) {
  try {
    const userId = req.user!.id
    if (req.user!.role !== 'user') {
      return res.status(400).json({ success: false, message: 'Та аль хэдийн админ эрхтэй байна' })
    }

    const fee = await getFeeFor('admin_upgrade')
    if (fee <= 0) {
      // Free upgrade — just promote
      await pool.execute(`UPDATE users SET role='admin' WHERE id=?`, [userId])
      return res.json({ success: true, data: { free: true } })
    }

    const invoiceNo = `UPGRADE-${userId}-${Date.now()}`
    const result = await qpay.createInvoice({
      invoiceNo,
      description: `Админ эрх авах хураамж (ID:${userId})`,
      amount: fee,
    })

    if (!result.invoiceId) {
      throw new Error('QPay invoice_id хоосон байна')
    }

    await pool.execute(
      `INSERT INTO content_payments
         (content_type, content_id, user_id, invoice_id, amount, qr_text, qr_image)
       VALUES ('admin_upgrade', ?, ?, ?, ?, ?, ?)`,
      [userId, userId, result.invoiceId, fee, result.qrText || null, result.qrImage || null]
    )

    res.json({
      success: true,
      data: {
        invoiceId: result.invoiceId,
        qrImage:   result.qrImage || null,
        qrText:    result.qrText  || null,
        amount:    fee,
      },
    })
  } catch (err: any) {
    console.error('createUpgradePayment:', err)
    res.status(500).json({ success: false, message: err.message || 'QPay алдаа' })
  }
}

// GET /pay/upgrade/check/:invoiceId
export async function checkUpgradePayment(req: Request, res: Response) {
  try {
    const { invoiceId } = req.params
    const [existing]: any = await pool.execute(
      `SELECT content_id, status FROM content_payments WHERE invoice_id=? AND content_type='admin_upgrade' LIMIT 1`,
      [invoiceId]
    )
    if (!existing.length) return res.status(404).json({ success: false, message: 'Нэхэмжлэл олдсонгүй' })
    if (existing[0].status === 'paid') {
      return res.json({ success: true, data: { paid: true } })
    }

    const { paid } = await qpay.checkPayment(invoiceId)
    if (paid) {
      await pool.execute(
        `UPDATE content_payments SET status='paid', paid_at=NOW() WHERE invoice_id=?`,
        [invoiceId]
      )
      await pool.execute(`UPDATE users SET role='admin' WHERE id=?`, [existing[0].content_id])
    }

    res.json({ success: true, data: { paid } })
  } catch (err: any) {
    console.error('checkUpgradePayment:', err)
    res.status(500).json({ success: false, message: err.message || 'QPay шалгах алдаа' })
  }
}

// Publish content after payment confirmed
async function publishContent(contentType: ContentType, contentId: number) {
  switch (contentType) {
    case 'tourist_place':
    case 'historical_place':
      await pool.execute(`UPDATE places SET status='published' WHERE id=?`, [contentId])
      break
    case 'tour':
      await pool.execute(`UPDATE tours SET status='published' WHERE id=?`, [contentId])
      break
    case 'banner':
      await pool.execute(`UPDATE banners SET is_active=1 WHERE id=?`, [contentId])
      break
    case 'article':
      await pool.execute(`UPDATE articles SET status='published' WHERE id=?`, [contentId])
      break
    case 'admin_upgrade':
      await pool.execute(`UPDATE users SET role='admin' WHERE id=?`, [contentId])
      break
  }
}

// DB migration
export async function migratePayments() {
  // Alter users ENUM to include superadmin (safe if already exists)
  await pool.execute(`
    ALTER TABLE users
    MODIFY COLUMN role ENUM('superadmin','admin','user') NOT NULL DEFAULT 'user'
  `).catch(() => {/* already correct */})

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS content_payments (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      content_type VARCHAR(50) NOT NULL,
      content_id   INT NOT NULL,
      user_id      INT NOT NULL,
      invoice_id   VARCHAR(200) NOT NULL UNIQUE,
      amount       DECIMAL(10,2) NOT NULL DEFAULT 0,
      status       ENUM('pending','paid','expired','failed') DEFAULT 'pending',
      qr_text      TEXT,
      qr_image     TEXT,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      paid_at      TIMESTAMP NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_content (content_type, content_id),
      INDEX idx_invoice (invoice_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)
}
