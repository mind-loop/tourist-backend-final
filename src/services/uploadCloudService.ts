import path from 'path'
import convertHeic from 'heic-convert'

const UPLOAD_SERVICE_URL     = process.env.UPLOAD_SERVICE_URL || 'https://upload.itwork.mn'
const UPLOAD_SERVICE_API_KEY = process.env.UPLOAD_SERVICE_API_KEY || ''
const UPLOAD_SERVICE_BUCKET  = process.env.UPLOAD_SERVICE_BUCKET || 'tourist'

const HEIC_EXTENSIONS = ['.heic', '.heif']
const HEIC_MIME_TYPES = ['image/heic', 'image/heif']

export interface UploadedImage {
  url: string
  key: string
}

function isHeic(file: Express.Multer.File): boolean {
  return HEIC_EXTENSIONS.includes(path.extname(file.originalname).toLowerCase())
    || HEIC_MIME_TYPES.includes(file.mimetype)
}

// iPhone-с ирдэг HEIC/HEIF зургийг браузерт харагддаг JPEG рүү хөрвүүлнэ —
// upload-cloudmn болон ихэнх браузер HEIC-г шууд дэмждэггүй
async function normalizeImage(file: Express.Multer.File): Promise<Express.Multer.File> {
  if (!isHeic(file)) return file

  const jpegBuffer = await convertHeic({ buffer: file.buffer, format: 'JPEG', quality: 0.9 })
  const base = path.basename(file.originalname, path.extname(file.originalname))
  return {
    ...file,
    buffer: Buffer.from(jpegBuffer),
    mimetype: 'image/jpeg',
    originalname: `${base}.jpg`,
  }
}

function toBlob(file: Express.Multer.File): Blob {
  return new Blob([file.buffer], { type: file.mimetype })
}

// Нэг зураг upload-cloudmn руу байршуулна
export async function uploadImage(file: Express.Multer.File): Promise<UploadedImage> {
  const normalized = await normalizeImage(file)

  const form = new FormData()
  form.append('bucket', UPLOAD_SERVICE_BUCKET)
  form.append('image', toBlob(normalized), normalized.originalname)

  const res = await fetch(`${UPLOAD_SERVICE_URL}/api/upload`, {
    method: 'POST',
    headers: { 'x-api-key': UPLOAD_SERVICE_API_KEY },
    body: form,
  })
  const data: any = await res.json().catch(() => null)
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'Зураг байршуулах үйлчилгээ амжилтгүй боллоо')
  }
  return { url: data.url, key: data.key }
}

// Олон зургийг нэг дор upload-cloudmn руу байршуулна
export async function uploadImages(files: Express.Multer.File[]): Promise<UploadedImage[]> {
  if (files.length === 0) return []

  const normalized = await Promise.all(files.map(normalizeImage))

  const form = new FormData()
  form.append('bucket', UPLOAD_SERVICE_BUCKET)
  for (const file of normalized) {
    form.append('images', toBlob(file), file.originalname)
  }

  const res = await fetch(`${UPLOAD_SERVICE_URL}/api/upload/bulk`, {
    method: 'POST',
    headers: { 'x-api-key': UPLOAD_SERVICE_API_KEY },
    body: form,
  })
  const data: any = await res.json().catch(() => null)
  if (!res.ok || !data?.success || (data.failed && data.failed.length > 0)) {
    throw new Error(data?.error || 'Зураг байршуулах үйлчилгээ амжилтгүй боллоо')
  }
  return data.uploaded.map((u: any) => ({ url: u.url, key: u.key }))
}

// upload-cloudmn дээрх зургийг устгана (URL-аар)
export async function deleteImage(url: string): Promise<void> {
  const res = await fetch(`${UPLOAD_SERVICE_URL}/api/upload`, {
    method: 'DELETE',
    headers: {
      'x-api-key': UPLOAD_SERVICE_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) {
    const data: any = await res.json().catch(() => null)
    throw new Error(data?.error || 'Зураг устгах үйлчилгээ амжилтгүй боллоо')
  }
}
