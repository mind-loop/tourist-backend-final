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
