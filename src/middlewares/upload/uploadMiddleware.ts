import multer from 'multer'
import path from 'path'
import { RequestHandler } from 'express'

const storage = multer.memoryStorage()

function fileFilter(_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif']
  const ext = path.extname(file.originalname).toLowerCase()
  if (allowed.includes(ext)) {
    cb(null, true)
  } else {
    const err: any = new Error('Зөвхөн зургийн файл оруулна уу (jpg, png, webp, gif, heic)')
    err.status = 400
    cb(err)
  }
}

const MAX_MB = Number(process.env.MAX_FILE_SIZE_MB) || 10
const limits = { fileSize: MAX_MB * 1024 * 1024 }

// Cast to RequestHandler to avoid multer @types conflict with express @types
export const uploadSingle      = multer({ storage, fileFilter, limits }).single('image')   as unknown as RequestHandler
export const uploadMultiple    = multer({ storage, fileFilter, limits }).array('images', 5)  as unknown as RequestHandler
export const uploadCover       = multer({ storage, fileFilter, limits }).single('cover')   as unknown as RequestHandler
export const uploadTourFields  = multer({ storage, fileFilter, limits }).fields([
  { name: 'image', maxCount: 1 },
  { name: 'qr_image', maxCount: 1 },
]) as unknown as RequestHandler
