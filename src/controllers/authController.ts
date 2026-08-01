import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import pool from '../config/database'

function signToken(payload: { id: number; email: string; role: string }) {
  return jwt.sign(payload, process.env.JWT_SECRET || 'secret', {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any,
  })
}

function safeUser(u: any) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, avatar: u.avatar || null, provider: u.provider }
}

// Startup migration — facebook_id багана болон provider enum-д 'facebook' нэмнэ
export async function migrateAuth() {
  await pool.execute(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_id VARCHAR(255) DEFAULT NULL, ADD INDEX idx_facebook_id (facebook_id)`
  ).catch(() =>
    pool.execute(`ALTER TABLE users ADD COLUMN facebook_id VARCHAR(255) DEFAULT NULL, ADD INDEX idx_facebook_id (facebook_id)`).catch(() => {})
  )
  await pool.execute(
    `ALTER TABLE users MODIFY COLUMN provider ENUM('local','google','facebook') NOT NULL DEFAULT 'local'`
  ).catch(() => {})
}

// POST /auth/register
export async function register(req: Request, res: Response) {
  try {
    const { name, email, password } = req.body
    if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Бүх талбарыг бөглөнө үү' })
    if (password.length < 6) return res.status(400).json({ success: false, message: 'Нууц үг хамгийн багадаа 6 тэмдэгт байх ёстой' })

    const [existing]: any = await pool.execute('SELECT id FROM users WHERE email = ?', [email])
    if (existing.length) return res.status(409).json({ success: false, message: 'Энэ имэйл бүртгэлтэй байна' })

    const hash = await bcrypt.hash(password, 12)
    const [result]: any = await pool.execute(
      `INSERT INTO users (name, email, password, role, provider) VALUES (?, ?, ?, 'user', 'local')`,
      [name.trim(), email.toLowerCase().trim(), hash]
    )
    const token = signToken({ id: result.insertId, email, role: 'user' })
    res.status(201).json({
      success: true,
      data: { id: result.insertId, name, email, role: 'user', avatar: null, provider: 'local', token },
    })
  } catch (err: any) {
    console.error('register error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// POST /auth/login
export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ success: false, message: 'Имэйл болон нууц үгийг оруулна уу' })

    const [rows]: any = await pool.execute(
      `SELECT * FROM users WHERE email = ? AND provider = 'local' AND is_active = 1 LIMIT 1`,
      [email.toLowerCase().trim()]
    )
    const user = rows[0]
    if (!user) return res.status(401).json({ success: false, message: 'Имэйл эсвэл нууц үг буруу байна' })

    const match = await bcrypt.compare(password, user.password)
    if (!match) return res.status(401).json({ success: false, message: 'Имэйл эсвэл нууц үг буруу байна' })

    const token = signToken({ id: user.id, email: user.email, role: user.role })
    res.json({ success: true, data: { ...safeUser(user), token } })
  } catch (err: any) {
    console.error('login error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// POST /auth/google/callback  — frontend Google OAuth flow
export async function googleCallback(req: Request, res: Response) {
  try {
    const { googleId, email, name, avatar } = req.body
    if (!googleId || !email) return res.status(400).json({ success: false, message: 'Google мэдээлэл дутуу байна' })

    const [rows]: any = await pool.execute(
      'SELECT * FROM users WHERE google_id = ? OR email = ? LIMIT 1',
      [googleId, email.toLowerCase().trim()]
    )
    let user = rows[0]

    if (!user) {
      const [result]: any = await pool.execute(
        `INSERT INTO users (name, email, avatar, role, provider, google_id) VALUES (?, ?, ?, 'user', 'google', ?)`,
        [name, email.toLowerCase().trim(), avatar || null, googleId]
      )
      const [newRows]: any = await pool.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [result.insertId])
      user = newRows[0]
    } else if (!user.google_id) {
      await pool.execute(
        'UPDATE users SET google_id = ?, avatar = COALESCE(?, avatar), provider = ? WHERE id = ?',
        [googleId, avatar || null, 'google', user.id]
      )
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role })
    res.json({ success: true, data: { ...safeUser(user), token } })
  } catch (err: any) {
    console.error('google callback error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// POST /auth/facebook/callback  — frontend Facebook Login flow
export async function facebookCallback(req: Request, res: Response) {
  try {
    const { accessToken } = req.body
    if (!accessToken) return res.status(400).json({ success: false, message: 'Facebook access token дутуу байна' })

    // Access token-г клиентээс ирсэн профайлыг найдахын оронд Facebook Graph API-аар шалгана
    const fbRes = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(accessToken)}`
    )
    const fbData: any = await fbRes.json()
    if (!fbRes.ok || fbData.error) {
      return res.status(401).json({ success: false, message: 'Facebook token хүчингүй байна' })
    }

    const facebookId = fbData.id
    const email       = fbData.email
    const name        = fbData.name
    const avatar      = fbData.picture?.data?.url || null
    if (!facebookId || !email) {
      return res.status(400).json({ success: false, message: 'Facebook имэйл хандах эрх шаардлагатай' })
    }

    const [rows]: any = await pool.execute(
      'SELECT * FROM users WHERE facebook_id = ? OR email = ? LIMIT 1',
      [facebookId, email.toLowerCase().trim()]
    )
    let user = rows[0]

    if (!user) {
      const [result]: any = await pool.execute(
        `INSERT INTO users (name, email, avatar, role, provider, facebook_id) VALUES (?, ?, ?, 'user', 'facebook', ?)`,
        [name, email.toLowerCase().trim(), avatar, facebookId]
      )
      const [newRows]: any = await pool.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [result.insertId])
      user = newRows[0]
    } else if (!user.facebook_id) {
      await pool.execute(
        'UPDATE users SET facebook_id = ?, avatar = COALESCE(avatar, ?), provider = ? WHERE id = ?',
        [facebookId, avatar, 'facebook', user.id]
      )
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role })
    res.json({ success: true, data: { ...safeUser(user), token } })
  } catch (err: any) {
    console.error('facebook callback error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// GET /auth/me
export async function getMe(req: Request, res: Response) {
  try {
    const [rows]: any = await pool.execute(
      'SELECT id, name, email, avatar, role, provider, created_at FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
      [req.user!.id]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Хэрэглэгч олдсонгүй' })
    res.json({ success: true, data: rows[0] })
  } catch (err: any) {
    console.error('getMe error:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// POST /auth/logout
export function logout(_req: Request, res: Response) {
  res.json({ success: true, message: 'Амжилттай гарлаа' })
}
