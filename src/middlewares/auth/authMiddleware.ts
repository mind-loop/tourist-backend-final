import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export type UserRole = 'superadmin' | 'admin' | 'user'

export interface JwtPayload {
  id: number
  email: string
  role: UserRole
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Нэвтрэх шаардлагатай' })
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET || 'secret') as JwtPayload
    req.user = payload
    next()
  } catch {
    return res.status(401).json({ success: false, message: 'Token хүчингүй эсвэл хугацаа дууссан' })
  }
}

// admin + superadmin both allowed
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: 'Зөвхөн админ хандах боломжтой' })
  }
  next()
}

// superadmin only
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: 'Зөвхөн супер админ хандах боломжтой' })
  }
  next()
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET || 'secret') as JwtPayload
      req.user = payload
    } catch { /* ignore */ }
  }
  next()
}
