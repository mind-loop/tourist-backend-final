// Нэг удаагийн скрипт: ангилал тус бүрт Увс аймагтай холбоотой бодит нэр/байгууллага дээр
// суурилсан жишээ (mock) үйлчилгээ нэмнэ. Бүгд DRAFT статустай орно — админ шалгаж
// баталгаажуулсны дараа өөрөө нийтэлнэ (утасны дугаар зэрэг заримыг баталгаажуулаагүй тул).
// Ажиллуулах: npx tsx src/scripts/seedServices.ts

import pool from '../config/database'
import slugify from 'slugify'
import { autoTranslateFields } from '../utils/autoTranslate'

interface SeedService {
  name_mn: string
  description_mn: string
  category: string
  address_mn?: string
  phone?: string
  open_hours_mn?: string
  status?: 'draft' | 'published'
}

const ITEMS: SeedService[] = [
  {
    name_mn: 'Grand Hotel & Restaurant',
    description_mn: 'Улаангом хотын төвд байрлах зочид буудал, ресторантай цогцолбор.',
    category: 'accommodation',
    address_mn: 'Улаангом хот, Увс аймаг',
    phone: '99454435',
    open_hours_mn: 'Өдөр бүр 24 цаг',
  },
  {
    name_mn: 'Jangar Cafe',
    description_mn: 'Уламжлалт монгол хоол, кофе, зууш санал болгодог кафе.',
    category: 'restaurant',
    address_mn: 'Улаангом хот, Увс аймаг',
    open_hours_mn: 'Өдөр бүр 09:00–22:00',
  },
  {
    name_mn: 'Петровис ШТС — Улаангом',
    description_mn: 'Петровис группын шатахуун түгээх станц, Улаангом хотод байрладаг.',
    category: 'gas_station',
    address_mn: 'Улаангом хот, Увс аймаг',
    open_hours_mn: 'Өдөр бүр 24 цаг',
  },
  {
    name_mn: 'Улаангом авто засвар, оношилгооны төв',
    description_mn: 'Автомашины оношилгоо, засвар үйлчилгээ үзүүлдэг төв (жишээ бичлэг — админ баталгаажуулна уу).',
    category: 'car_repair',
    address_mn: 'Улаангом хот, Увс аймаг',
  },
  {
    name_mn: 'Увс такси үйлчилгээ',
    description_mn: 'Улаангом хот дотор болон ойролцоо тосох, хүргэх такси үйлчилгээ (жишээ бичлэг — админ баталгаажуулна уу).',
    category: 'taxi',
    address_mn: 'Улаангом хот, Увс аймаг',
  },
  {
    name_mn: 'Увс аймгийн нэгдсэн эмнэлэг',
    description_mn: 'Увс аймгийн төв эмнэлэг — яаралтай болон төлөвлөгөөт эмчилгээ үйлчилгээ.',
    category: 'health',
    address_mn: '3-р баг, Улаангом сум, Увс аймаг',
    phone: '103',
    open_hours_mn: 'Өдөр бүр 24 цаг (яаралтай тусламж)',
  },
  {
    name_mn: 'Онцгой байдал — Гал/Цагдаа/Түргэн тусламж',
    description_mn: 'Улсын стандарт яаралтай дуудлагын дугаарууд: 101 — Гал команд, 102 — Цагдаа, 103 — Түргэн тусламж.',
    category: 'emergency',
    address_mn: 'Улаангом хот, Увс аймаг',
    phone: '101 / 102 / 103',
    open_hours_mn: 'Өдөр бүр 24 цаг',
  },
  {
    name_mn: 'Хаан банк — Улаангом салбар',
    description_mn: 'Хаан банкны Увс аймаг дахь салбар, бэлэн мөнгө болон банкны бүх үйлчилгээ.',
    category: 'bank',
    address_mn: 'Улаангом хот, Увс аймаг',
    phone: '1800-1917',
    open_hours_mn: 'Даваа–Баасан 09:00–18:00',
  },
  {
    name_mn: 'Улаангом хотын төв дэлгүүр',
    description_mn: 'Хүнс, өдөр тутмын хэрэглээний бараа худалдаалдаг дэлгүүр (жишээ бичлэг — админ баталгаажуулна уу).',
    category: 'supermarket',
    address_mn: 'Улаангом хот, Увс аймаг',
    open_hours_mn: 'Өдөр бүр 09:00–21:00',
  },
  {
    name_mn: 'Төв талбайн нийтийн бие засах газар',
    description_mn: 'Улаангом хотын төв талбай орчимд байрлах нийтийн бие засах газар.',
    category: 'restroom',
    address_mn: 'Улаангом хотын төв талбай, Увс аймаг',
  },
  {
    name_mn: 'Интернэт, SIM карт үйлчилгээ',
    description_mn: 'Мобиком, Юнител зэрэг оператор компаниудын салбар — SIM карт, мобайл дата үйлчилгээ.',
    category: 'internet',
    address_mn: 'Улаангом хот, Увс аймаг',
  },
  {
    name_mn: 'Увс аймгийн ЗДТГ — Соёл, аялал жуулчлалын хэлтэс',
    description_mn: 'Аялагчдад зориулсан мэдээлэл, зөвлөгөө өгдөг аймгийн албан ёсны хэлтэс.',
    category: 'tourist_info',
    address_mn: 'Увс аймгийн Засаг даргын Тамгын газар, Улаангом хот',
  },
  {
    name_mn: 'Увс нуур жуулчны бааз',
    description_mn: 'Увс нуурын эрэг дээр байрладаг жуулчны бааз — майхан, гэр, хоол хүнсний үйлчилгээтэй. Үнэ: ~20,000₮/хүнээс.',
    category: 'camping',
    address_mn: 'Увс нуурын эрэг, Увс аймаг',
  },
  {
    name_mn: 'Улаангом авто түрээсийн үйлчилгээ',
    description_mn: 'Хот дотор болон аймгаар аялахад зориулсан автомашин түрээслэх үйлчилгээ (жишээ бичлэг — админ баталгаажуулна уу).',
    category: 'car_rental',
    address_mn: 'Улаангом хот, Увс аймаг',
  },
  {
    name_mn: 'Цахилгаан машины цэнэглэх станц',
    description_mn: 'Улаангом хотод EV цэнэглэх станц одоогоор байхгүй — ирээдүйд нэмэгдэх төлөвлөгөөтэй ангилал.',
    category: 'ev_charging',
  },
]

async function main() {
  const [[admin]]: any = await pool.query(`SELECT id FROM users WHERE role='superadmin' LIMIT 1`)
  if (!admin) {
    console.error('Superadmin хэрэглэгч олдсонгүй — эхлээд db:seed ажиллуулна уу.')
    process.exit(1)
  }

  for (const item of ITEMS) {
    const [[existing]]: any = await pool.query(
      `SELECT id FROM services WHERE name_mn = ? LIMIT 1`,
      [item.name_mn]
    )
    if (existing) {
      console.log(`  ⏭  "${item.name_mn}" — аль хэдийн байна, алгасав`)
      continue
    }

    const body: Record<string, any> = { name_mn: item.name_mn, description_mn: item.description_mn }
    await autoTranslateFields(body, ['name', 'description'])

    const base = slugify(item.name_mn, { lower: true, strict: true }) || 'service'
    const slug = `${base}-${Date.now()}`

    await pool.execute(
      `INSERT INTO services
         (slug, name_mn, name_en, name_ru,
          description_mn, description_en, description_ru,
          category, address_mn, phone, open_hours_mn,
          status, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        slug,
        item.name_mn, body.name_en || '', body.name_ru || '',
        item.description_mn, body.description_en || null, body.description_ru || null,
        item.category, item.address_mn || null, item.phone || null, item.open_hours_mn || null,
        item.status || 'draft',
        admin.id,
      ]
    )
    console.log(`  ✓ "${item.name_mn}" нэмэгдлээ (${item.category})`)
  }

  console.log('\nБүх жишээ үйлчилгээ нэмэгдэж дууслаа (draft статустай — admin панелаас шалгаж нийтэлнэ үү).')
  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
