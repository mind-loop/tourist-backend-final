import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { RequestHandler } from 'express'

const UPLOAD_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads', 'images')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `${uuidv4()}${ext}`)
  },
})

function fileFilter(_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
  const ext = path.extname(file.originalname).toLowerCase()
  if (allowed.includes(ext)) cb(null, true)
  else cb(new Error('Зөвхөн зургийн файл оруулна уу'))
}

const MAX_MB = Number(process.env.MAX_FILE_SIZE_MB) || 10
const limits = { fileSize: MAX_MB * 1024 * 1024 }

// Cast to RequestHandler to avoid multer @types conflict with express @types
export const uploadSingle      = multer({ storage, fileFilter, limits }).single('image')   as unknown as RequestHandler
export const uploadMultiple    = multer({ storage, fileFilter, limits }).array('images', 20) as unknown as RequestHandler
export const uploadCover       = multer({ storage, fileFilter, limits }).single('cover')   as unknown as RequestHandler
export const uploadTourFields  = multer({ storage, fileFilter, limits }).fields([
  { name: 'image', maxCount: 1 },
  { name: 'qr_image', maxCount: 1 },
]) as unknown as RequestHandler

export const IMAGES_BASE = '/uploads/images'