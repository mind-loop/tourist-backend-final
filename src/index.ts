import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import path from 'path'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import { testConnection } from './config/database'
import routes from './routes/index'
import { migrateRoutes }  from './controllers/routesController'
import { migratePlaces }  from './controllers/placesController'
import { migrateTours }   from './controllers/toursController'
import { migratePayments } from './controllers/paymentController'
import { migratePricing }  from './controllers/pricingController'
import { migrateBanners }  from './controllers/bannersController'

dotenv.config()

const app  = express()
const PORT = Number(process.env.PORT) || 4000

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}))

const ALLOWED_ORIGINS = [
  'https://tourist-api.e-uvs.mn',
  'https://www.e-uvs.mn',
  'https://tourist.e-uvs.mn',
  'https://e-uvs.mn',
  'http://localhost:5173',
  'http://localhost:3000',
]

app.use(cors({
  origin: (origin, cb) => {
    // server-to-server (origin байхгүй) болон жагсаалтад байвал зөвшөөрнө
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    cb(new Error(`CORS: ${origin} зөвшөөрөгдөөгүй`))
  },
  credentials: true,
  methods:     ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}))

// ── Rate limit auth ───────────────────────────────────────────────────────────
app.use('/api/v1/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Хэт олон хүсэлт, 15 минутын дараа дахин оролдоно уу' },
}))

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(morgan('dev'))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ── Static files (uploaded images) ───────────────────────────────────────────
app.use(
  '/uploads',
  express.static(path.join(process.cwd(), 'uploads'), {
    maxAge: '7d',
    etag: true,
  })
)

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/v1', routes)

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), port: PORT })
})

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route олдсонгүй' })
})

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err)
  const status  = err.status || err.statusCode || 500
  const message = err.message || 'Серверийн алдаа'
  res.status(status).json({ success: false, message })
})

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await testConnection()
    await migratePlaces()
    await migrateRoutes()
    await migrateTours()
    await migratePayments()
    await migratePricing()
    await migrateBanners()
    app.listen(PORT, () => {
      console.log(`\n🚀  QRUVS API  →  http://localhost:${PORT}`)
      console.log(`📡  ENV: ${process.env.NODE_ENV || 'development'}`)
      console.log(`\n📋  Routes:`)
      console.log(`    POST  /api/v1/auth/register`)
      console.log(`    POST  /api/v1/auth/login`)
      console.log(`    GET   /api/v1/places`)
      console.log(`    GET   /api/v1/places/:slug`)
      console.log(`    GET   /api/v1/tags`)
      console.log(`    GET   /api/v1/banners/active`)
      console.log(`    GET   /health\n`)
    })
  } catch (err) {
    console.error('❌ Startup failed:', err)
    process.exit(1)
  }
}

start()
