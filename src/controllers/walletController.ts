import { Request, Response } from 'express'
import pool from '../config/database'
import * as qpay from '../services/qpayService'

const MIN_TOPUP = 1000

// Хэтэвчний feature-г түр нуусан — хэрэглэгчийн шаардлагад нийцээгүй тул идэвхгүй болгов.
// Дахин идэвхжүүлэхдээ энэ утгыг true болгоно (paymentController.ts дахь ижил нэртэй утгатай хамт).
const WALLET_ENABLED = false

// Startup migration
export async function migrateWallet() {
  await pool.execute(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance DECIMAL(12,2) NOT NULL DEFAULT 0`
  ).catch(() =>
    pool.execute(`ALTER TABLE users ADD COLUMN wallet_balance DECIMAL(12,2) NOT NULL DEFAULT 0`).catch(() => {})
  )

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      user_id       INT NOT NULL,
      type          ENUM('topup','payment','refund') NOT NULL,
      amount        DECIMAL(12,2) NOT NULL,
      balance_after DECIMAL(12,2) DEFAULT NULL,
      description   VARCHAR(255) DEFAULT NULL,
      invoice_id    VARCHAR(200) DEFAULT NULL,
      status        ENUM('pending','paid','expired','failed') NOT NULL DEFAULT 'paid',
      expires_at    TIMESTAMP NULL,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user    (user_id),
      INDEX idx_invoice (invoice_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)

  await pool.execute(
    `ALTER TABLE wallet_transactions MODIFY COLUMN status ENUM('pending','paid','expired','failed') NOT NULL DEFAULT 'paid'`
  ).catch(() => {})
  await pool.execute(
    `ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP NULL`
  ).catch(() =>
    pool.execute(`ALTER TABLE wallet_transactions ADD COLUMN expires_at TIMESTAMP NULL`).catch(() => {})
  )
}

// Топ-ап invoice-г төлбөр баталгаажсаны дараа хэтэвчинд credit хийнэ (checkTopup болон webhook хоёулаа дуудна)
export async function creditWalletTopup(invoiceId: string): Promise<boolean> {
  const [rows]: any = await pool.execute(
    `SELECT * FROM wallet_transactions WHERE invoice_id = ? AND type = 'topup' AND status != 'paid' LIMIT 1`,
    [invoiceId]
  )
  if (!rows.length) return false
  const txn = rows[0]

  const [[user]]: any = await pool.query('SELECT wallet_balance FROM users WHERE id = ? LIMIT 1', [txn.user_id])
  const newBalance = Number(user.wallet_balance) + Number(txn.amount)

  await pool.execute('UPDATE users SET wallet_balance = ? WHERE id = ?', [newBalance, txn.user_id])
  await pool.execute(
    `UPDATE wallet_transactions SET status='paid', balance_after=? WHERE id=?`,
    [newBalance, txn.id]
  )
  return true
}

// GET /wallet  — үлдэгдэл + сүүлийн гүйлгээ
export async function getWallet(req: Request, res: Response) {
  try {
    const [[user]]: any = await pool.query('SELECT wallet_balance FROM users WHERE id = ? LIMIT 1', [req.user!.id])
    const [transactions]: any = await pool.query(
      `SELECT id, type, amount, balance_after, description, status, created_at
       FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
      [req.user!.id]
    )
    res.json({ success: true, data: { balance: Number(user?.wallet_balance) || 0, transactions } })
  } catch (err: any) {
    console.error('getWallet error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// POST /wallet/topup  — дурын дүнгээр QPay нэхэмжлэл үүсгэнэ
export async function createTopup(req: Request, res: Response) {
  if (!WALLET_ENABLED) {
    return res.status(403).json({ success: false, message: 'Хэтэвч цэнэглэх боломж түр идэвхгүй байна' })
  }
  try {
    const amount = Math.round(Number(req.body.amount))
    if (!amount || amount < MIN_TOPUP) {
      return res.status(400).json({ success: false, message: `Хамгийн багадаа ${MIN_TOPUP.toLocaleString()}₮-с цэнэглэнэ үү` })
    }

    const invoiceNo = `WALLET-${req.user!.id}-${Date.now()}`
    const result = await qpay.createInvoice({
      invoiceNo,
      description: `Хэтэвч цэнэглэх (ID:${req.user!.id})`,
      amount,
    })
    await pool.execute(
      `INSERT INTO wallet_transactions (user_id, type, amount, description, invoice_id, status, expires_at)
       VALUES (?, 'topup', ?, ?, ?, 'pending', ?)`,
      [req.user!.id, amount, 'Хэтэвч цэнэглэлт', result.invoiceId, result.expiresAt]
    )

    res.json({
      success: true,
      data: { invoiceId: result.invoiceId, qrImage: result.qrImage || null, qrText: result.qrText || null, amount },
    })
  } catch (err: any) {
    console.error('createTopup error:', err)
    res.status(500).json({ success: false, message: err.message || 'QPay алдаа' })
  }
}

// GET /wallet/topup/check/:invoiceId
export async function checkTopup(req: Request, res: Response) {
  try {
    const { invoiceId } = req.params
    const [existing]: any = await pool.execute(
      `SELECT status, expires_at FROM wallet_transactions WHERE invoice_id = ? AND user_id = ? LIMIT 1`,
      [invoiceId, req.user!.id]
    )
    if (!existing.length) return res.status(404).json({ success: false, message: 'Гүйлгээ олдсонгүй' })
    if (existing[0].status === 'paid') {
      const [[user]]: any = await pool.query('SELECT wallet_balance FROM users WHERE id = ? LIMIT 1', [req.user!.id])
      return res.json({ success: true, data: { paid: true, balance: Number(user.wallet_balance) } })
    }

    const { paid } = await qpay.checkPayment(invoiceId)
    if (paid) {
      await creditWalletTopup(invoiceId)
    } else if (qpay.isInvoiceExpired(existing[0].expires_at)) {
      await pool.execute(`UPDATE wallet_transactions SET status='expired' WHERE invoice_id=?`, [invoiceId])
      return res.json({ success: true, data: { paid: false, expired: true } })
    }

    const [[user]]: any = await pool.query('SELECT wallet_balance FROM users WHERE id = ? LIMIT 1', [req.user!.id])
    res.json({ success: true, data: { paid, balance: Number(user.wallet_balance) } })
  } catch (err: any) {
    console.error('checkTopup error:', err)
    res.status(500).json({ success: false, message: err.message || 'QPay шалгах алдаа' })
  }
}
