import bcrypt from 'bcryptjs'
import pool from './database'
import dotenv from 'dotenv'
dotenv.config()

async function seed() {
  console.log('🌱 Seeding...')

  // Ensure role ENUM includes 'superadmin' before inserting superadmin user
  await pool.execute(`
    ALTER TABLE users
    MODIFY COLUMN role ENUM('superadmin','admin','user') NOT NULL DEFAULT 'user'
  `).catch(() => { /* already updated */ })

  // ── SuperAdmin ──────────────────────────────────────────────────────────────
  const superHash = await bcrypt.hash('superadmin123', 10)
  await pool.execute(
    `INSERT INTO users (name, email, password, role, provider)
     VALUES (?, ?, ?, 'superadmin', 'local')
     ON DUPLICATE KEY UPDATE role='superadmin', password=VALUES(password)`,
    ['SuperAdmin', 'superadmin@qruvs.mn', superHash]
  )
  console.log('  ✅ SuperAdmin: superadmin@qruvs.mn / superadmin123')

  // ── Admin user ──────────────────────────────────────────────────────────────
  const hash = await bcrypt.hash('admin123', 10)
  await pool.execute(
    `INSERT INTO users (name, email, password, role, provider)
     VALUES (?, ?, ?, 'admin', 'local')
     ON DUPLICATE KEY UPDATE role='admin', password=VALUES(password)`,
    ['Admin', 'admin@qruvs.mn', hash]
  )
  console.log('  ✅ Admin: admin@qruvs.mn / admin123')

  // ── Tags ────────────────────────────────────────────────────────────────────
  const tags = [
    ['wifi',          'Интернэттэй',  'WiFi available',  'Есть интернет',  'ti-wifi'],
    ['parking',       'Зогсоол',      'Parking',         'Парковка',       'ti-car'],
    ['accommodation', 'Буудалтай',    'Accommodation',   'Жильё',          'ti-tent'],
    ['photo_spot',    'Фото цэг',     'Photo spot',      'Фото-точка',     'ti-camera'],
    ['paid',          'Төлбөртэй',    'Paid entry',      'Платный вход',   'ti-currency-tugrik'],
    ['free',          'Үнэгүй',       'Free entry',      'Бесплатно',      'ti-circle-check'],
    ['transport',     'Тээвэртэй',    'Transport',       'Транспорт',      'ti-bus'],
    ['guide',         'Хөтөчтэй',     'Guide available', 'Есть гид',       'ti-user'],
    ['camping',       'Кемп',         'Camping',         'Кемпинг',        'ti-campfire'],
    ['restaurant',    'Хоол',         'Food available',  'Есть питание',   'ti-soup'],
  ]
  for (const [key, mn, en, ru, icon] of tags) {
    await pool.execute(
      `INSERT IGNORE INTO tags (key_name, label_mn, label_en, label_ru, icon) VALUES (?,?,?,?,?)`,
      [key, mn, en, ru, icon]
    )
  }
  console.log('  ✅ Tags')

  const [users]: any = await pool.execute('SELECT id FROM users LIMIT 1')
  const adminId = users[0]?.id

  // ── Places ──────────────────────────────────────────────────────────────────
  // [slug, name_mn, name_en, name_ru, desc_mn, category, lat, lng, alt, area, depth, season_mn, fee, km, rating, reviews]
  const places: any[] = [
    // LAKE
    [
      'uvs-lake',
      'Үүрэг нуур', 'Uvs Lake', 'Озеро Увс',
      'Үүрэг нуур нь Монгол улсын хамгийн том давстай нуур бөгөөд ЮНЕСКО-гийн Дэлхийн өвд бүртгэгдсэн. Талбай 3,350 км², гүн 20 м. 200 гаруй зүйлийн шувуу амьдардаг.',
      'Uvs Lake is Mongolia\'s largest saltwater lake and a UNESCO World Heritage Site. Area 3,350 km², depth 20 m. Home to over 200 bird species.',
      'Озеро Увс — крупнейшее солёное озеро Монголии, объект Всемирного наследия ЮНЕСКО. Площадь 3350 км², глубина 20 м.',
      'lake', 50.3412, 92.7589, '759 м', '3,350 км²', '20 м', '6–9-р сар', 2000, 18.0, 4.8, 215,
    ],
    [
      'achit-lake',
      'Ачит нуур', 'Achit Lake', 'Озеро Ачит',
      'Ачит нуур нь цэнгэг усны нуур бөгөөд загасчлалаар алдартай. Эрэг дагуу кемп байх боломжтой.',
      'Achit Lake is a freshwater lake famous for fishing. Camping is available along the shore.',
      'Озеро Ачит — пресноводное озеро, известное рыбалкой. Возможен кемпинг на берегу.',
      'lake', 49.5500, 90.6800, '1,435 м', '290 км²', '20 м', '5–9-р сар', 0, 145.0, 4.5, 87,
    ],
    [
      'uureg-lake',
      'Хяргас нуур', 'Khyargas Lake', 'Озеро Хиргис',
      'Хяргас нуур нь давстай нуур бөгөөд эрэг нь цагаан элсэрхэг. Зуны улиралд усны температур дулаахан.',
      'Khyargas Lake is a saltwater lake with white sandy shores. Water temperature is warm in summer.',
      'Озеро Хиргис — солёное озеро с белыми песчаными берегами.',
      'lake', 49.1700, 93.4200, '1,028 м', '1,407 км²', '80 м', '6–8-р сар', 0, 65.0, 4.3, 52,
    ],

    // MOUNTAIN
    [
      'turgen-mountain',
      'Түргэн уул', 'Turgen Mountain', 'Горный массив Тургэн',
      'Түргэн уул нь Увс аймгийн хамгийн өндөр цэгүүдийн нэг. Оргилын өндөр 3,965 м. Мөнхийн цас, мөсөн голуудтай. Аялагчдад зориулсан хөтөч байна.',
      'Turgen Mountain is one of the highest peaks in Uvs Province, reaching 3,965 m. Permanent snow and glaciers. Guided tours available.',
      'Горный массив Түргэн — одна из высочайших точек аймака Увс, высота 3965 м. Вечные снега и ледники.',
      'mountain', 50.0300, 91.3500, '3,965 м', null, null, '7–8-р сар', 0, 95.0, 4.7, 63,
    ],
    [
      'kharkhiraa-mountain',
      'Хархираа уул', 'Kharkhiraa Mountain', 'Гора Хархирaa',
      'Хархираа уул нь Увс аймгийн баруун хэсэгт оршдог. Оргилын өндөр 4,037 м — аймгийн хамгийн өндөр цэг. Мөсөн гол, цасан орой.',
      'Kharkhiraa Mountain, at 4,037 m, is the highest peak in Uvs Province. Features glaciers and a snow-capped summit.',
      'Гора Хархирaa высотой 4037 м — высшая точка аймака Увс с ледниками и заснеженной вершиной.',
      'mountain', 49.1200, 91.2500, '4,037 м', null, null, '7–8-р сар', 0, 110.0, 4.9, 41,
    ],

    // RIVER
    [
      'tes-river',
      'Тэс гол', 'Tes River', 'Река Тэс',
      'Тэс гол нь Увс аймгийн голын сав газрын нэг. Загас, бугын ан амьтан элбэгтэй. Байгалийн үзэсгэлэнт газар.',
      'Tes River is one of the main rivers of Uvs Province. Rich in fish and wildlife. Beautiful natural scenery.',
      'Река Тэс — одна из главных рек аймака Увс. Богата рыбой и дикой природой.',
      'river', 50.2800, 93.9500, null, null, null, '5–9-р сар', 0, 42.0, 4.2, 28,
    ],
    [
      'khovd-river',
      'Ховд гол', 'Khovd River', 'Река Ховд',
      'Ховд гол нь Монголын баруун хэсгийн томоохон голуудын нэг. Тунгалаг ус, загасчлалын сайн нөхцөлтэй.',
      'Khovd River is one of the major rivers in western Mongolia. Clear water, excellent fishing conditions.',
      'Река Ховд — одна из крупных рек западной Монголии. Прозрачная вода, отличные условия для рыбалки.',
      'river', 48.9800, 91.6400, null, null, null, '5–9-р сар', 0, 130.0, 4.1, 19,
    ],

    // FOREST
    [
      'turgen-forest',
      'Түргэний ой', 'Turgen Forest', 'Тургэнский лес',
      'Түргэн уулын энгэрт орших ой. Нарс, хус, шинэс мод зонхилдог. Ойн жуулчин аялал хийх боломжтой.',
      'Forest on the slopes of Turgen Mountain. Pine, birch and larch are dominant trees. Forest hiking available.',
      'Лес на склонах горы Тургэн. Преобладают сосна, берёза и лиственница. Возможны лесные прогулки.',
      'forest', 50.0800, 91.4200, '1,800 м', '450 км²', null, '5–9-р сар', 0, 100.0, 4.4, 33,
    ],

    // STEPPE
    [
      'uvs-steppe',
      'Увсын тал', 'Uvs Steppe', 'Увская степь',
      'Увсын тал нь Монголын баруун хэсгийн уудам тал. ЮНЕСКО-гийн биосферийн нөөц газар. Нүүдэлчдийн уламжлалт амьдралыг харах боломжтой.',
      'The Uvs Steppe is a vast grassland in western Mongolia and a UNESCO Biosphere Reserve. Traditional nomadic life can be observed.',
      'Увская степь — обширные угодья западной Монголии, биосферный заповедник ЮНЕСКО.',
      'steppe', 50.5500, 92.4000, '759 м', '10,000 км²', null, '5–10-р сар', 0, 25.0, 4.6, 74,
    ],
    [
      'aldarhaan-steppe',
      'Алдархааны тал', 'Aldarhaan Steppe', 'Степь Алдархаан',
      'Алдархааны тал нь намрын улиралд алтан өнгөтэй болж үзэсгэлэнтэй харагддаг. Нүүдэлчдийн гэр буудал байна.',
      'The Aldarhaan Steppe turns golden in autumn, creating a beautiful landscape. Nomadic ger camps available.',
      'Степь Алдархаан осенью становится золотистой. Есть номадские лагери.',
      'steppe', 49.8500, 93.2000, '900 м', null, null, '5–10-р сар', 0, 55.0, 4.3, 38,
    ],

    // HISTORICAL
    [
      'ulaangom-monument',
      'Улаангомын эртний булш', 'Ulaangom Ancient Burial', 'Древние курганы Улаангома',
      'Улаангом хотын ойролцоо оршдог эртний булш. МЭӨ 3–4-р мянган жилийн өмнөх үеийн дурсгал. Нэн ховор археологийн олдворуудтай.',
      'Ancient burial mounds near Ulaangom city, dating back 3,000–4,000 years BC. Contains rare archaeological findings.',
      'Древние курганы вблизи Улаангома, датируемые 3000–4000 лет до н.э. Редкие археологические находки.',
      'historical', 49.9800, 92.0700, null, null, null, '5–10-р сар', 0, 5.0, 4.5, 42,
    ],
    [
      'deer-stone',
      'Буган чулуу', 'Deer Stones', 'Оленные камни',
      'Буган чулуу нь МЭӨ 1000–700 оны үеийн дурсгалт чулуу. Буга, амьтны дүрс сийлсэн. Монголын эртний соёлыг илэрхийлдэг.',
      'Deer Stones are carved stone monuments from 1000–700 BC, depicting deer and animals. They represent ancient Mongolian culture.',
      'Оленные камни — каменные монументы 1000–700 гг. до н.э. с изображением оленей. Символ древней культуры Монголии.',
      'historical', 49.9600, 91.9800, null, null, null, '4–10-р сар', 1000, 8.0, 4.6, 58,
    ],
    [
      'tsambagarav-temple',
      'Цамбагарав хийд', 'Tsambagarav Temple', 'Монастырь Цамбагарав',
      'Цамбагарав хийд нь 18-р зуунд байгуулагдсан буддын хийд. Уулын энгэрт оршдог. Дотоод зураг, хуучин барилга сонирхолтой.',
      'Tsambagarav Temple is an 18th-century Buddhist monastery on a mountain slope with interesting murals and old architecture.',
      'Монастырь Цамбагарав — буддийский монастырь XVIII века на горном склоне с фресками и старинной архитектурой.',
      'historical', 48.6700, 91.6000, '1,600 м', null, null, '5–10-р сар', 2000, 165.0, 4.7, 31,
    ],
    [
      'sagly-mounds',
      'Сагли булш', 'Sagly Burial Mounds', 'Могильники Сагли',
      'Сагли булш нь Увс аймгийн хамгийн том эртний оршуулгын газар. Хүрэл болон төмрийн эрин үеийн дурсгалт газар.',
      'Sagly burial mounds are the largest ancient burial site in Uvs Province, dating from the Bronze and Iron Ages.',
      'Могильники Сагли — крупнейшее древнее захоронение в аймаке Увс, относящееся к бронзовому и железному векам.',
      'historical', 50.1200, 93.3500, null, null, null, '5–10-р сар', 0, 72.0, 4.2, 18,
    ],

    // OTHER
    [
      'ulaan-davaa',
      'Улаан даваа', 'Ulaan Pass', 'Перевал Улаан',
      'Улаан даваа нь 2,200 м өндөрт орших уулын давааны нэг. Орой дээрээс Увсын тал, Хяргас нуур харагдана.',
      'Ulaan Pass sits at 2,200 m elevation. From the top, you can see the Uvs Steppe and Khyargas Lake.',
      'Перевал Улаан находится на высоте 2200 м. С вершины видны степь Увс и озеро Хиргис.',
      'other', 49.5000, 92.8000, '2,200 м', null, null, '6–9-р сар', 0, 48.0, 4.4, 27,
    ],
  ]

  let placeCount = 0
  const placeIds: Record<string, number> = {}

  for (const p of places) {
    const [
      slug, name_mn, name_en, name_ru,
      desc_mn, desc_en, desc_ru,
      category, lat, lng, alt, area, depth,
      season_mn, fee, km, rating, reviews,
    ] = p

    try {
      const [res]: any = await pool.execute(
        `INSERT IGNORE INTO places
         (slug, name_mn, name_en, name_ru,
          description_mn, description_en, description_ru,
          category, latitude, longitude, altitude, area, depth,
          best_season_mn, entry_fee, aimag_center_km,
          status, rating, review_count, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          slug, name_mn, name_en, name_ru,
          desc_mn, desc_en, desc_ru,
          category, lat, lng, alt, area, depth,
          season_mn, fee, km,
          'published', rating, reviews, adminId,
        ]
      )
      if ((res as any).insertId) {
        placeIds[slug] = (res as any).insertId
        placeCount++
      } else {
        // already exists — fetch id
        const [rows]: any = await pool.execute('SELECT id FROM places WHERE slug = ? LIMIT 1', [slug])
        if (rows[0]) placeIds[slug] = rows[0].id
      }
    } catch (e: any) {
      console.error(`  ⚠️  Place ${slug}:`, e.message)
    }
  }
  console.log(`  ✅ Places: ${placeCount} нэмэгдлээ`)

  // Tag assignments
  const [tagRows]: any = await pool.execute('SELECT id, key_name FROM tags')
  const tagMap: Record<string, number> = {}
  for (const t of tagRows) tagMap[t.key_name] = t.id

  const placeTags: Record<string, string[]> = {
    'uvs-lake':         ['photo_spot', 'accommodation', 'paid', 'camping'],
    'achit-lake':       ['photo_spot', 'camping', 'free'],
    'uureg-lake':       ['photo_spot', 'free'],
    'turgen-mountain':  ['guide', 'photo_spot', 'camping'],
    'kharkhiraa-mountain': ['guide', 'photo_spot'],
    'tes-river':        ['photo_spot', 'free', 'camping'],
    'khovd-river':      ['photo_spot', 'free'],
    'turgen-forest':    ['photo_spot', 'free', 'camping'],
    'uvs-steppe':       ['accommodation', 'guide', 'photo_spot'],
    'aldarhaan-steppe': ['accommodation', 'photo_spot'],
    'ulaangom-monument': ['photo_spot', 'free'],
    'deer-stone':       ['photo_spot', 'paid'],
    'tsambagarav-temple': ['photo_spot', 'paid', 'guide'],
    'sagly-mounds':     ['photo_spot', 'free'],
    'ulaan-davaa':      ['photo_spot', 'free'],
  }

  for (const [slug, keys] of Object.entries(placeTags)) {
    const pid = placeIds[slug]
    if (!pid) continue
    for (const k of keys) {
      const tid = tagMap[k]
      if (tid) {
        await pool.execute(
          `INSERT IGNORE INTO place_tags (place_id, tag_id) VALUES (?,?)`,
          [pid, tid]
        ).catch(() => {})
      }
    }
  }
  console.log('  ✅ Place tags')

  // ── Routes ──────────────────────────────────────────────────────────────────
  const routeData = [
    {
      title_mn: 'Улаангом — Үүрэг нуур',
      title_en: 'Ulaangom — Uvs Lake',
      from_mn: 'Улаангом', from_en: 'Ulaangom',
      to_mn: 'Үүрэг нуур', to_en: 'Uvs Lake',
      total_km: 18, paved_km: 10, dirt_km: 8,
      duration_minutes: 35, stop_count: 2, food_count: 1, overnight_count: 1,
      aimag_center_km: 18, sort_order: 1,
    },
    {
      title_mn: 'Улаангом — Хяргас нуур',
      title_en: 'Ulaangom — Khyargas Lake',
      from_mn: 'Улаангом', from_en: 'Ulaangom',
      to_mn: 'Хяргас нуур', to_en: 'Khyargas Lake',
      total_km: 65, paved_km: 45, dirt_km: 20,
      duration_minutes: 90, stop_count: 3, food_count: 2, overnight_count: 1,
      aimag_center_km: 65, sort_order: 2,
    },
    {
      title_mn: 'Улаангом — Ачит нуур',
      title_en: 'Ulaangom — Achit Lake',
      from_mn: 'Улаангом', from_en: 'Ulaangom',
      to_mn: 'Ачит нуур', to_en: 'Achit Lake',
      total_km: 145, paved_km: 80, dirt_km: 65,
      duration_minutes: 180, stop_count: 4, food_count: 2, overnight_count: 2,
      aimag_center_km: 145, sort_order: 3,
    },
    {
      title_mn: 'Улаангом — Хархираа — Түргэн',
      title_en: 'Ulaangom — Kharkhiraa — Turgen',
      from_mn: 'Улаангом', from_en: 'Ulaangom',
      to_mn: 'Түргэн уул', to_en: 'Turgen Mountain',
      total_km: 110, paved_km: 40, dirt_km: 70,
      duration_minutes: 240, stop_count: 5, food_count: 3, overnight_count: 2,
      aimag_center_km: 95, sort_order: 4,
    },
  ]

  let routeCount = 0
  for (const r of routeData) {
    try {
      await pool.execute(
        `INSERT IGNORE INTO routes
         (title_mn, title_en, from_mn, from_en, to_mn, to_en,
          total_km, paved_km, dirt_km, duration_minutes,
          stop_count, food_count, overnight_count, aimag_center_km,
          status, sort_order)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'published',?)`,
        [
          r.title_mn, r.title_en, r.from_mn, r.from_en, r.to_mn, r.to_en,
          r.total_km, r.paved_km, r.dirt_km, r.duration_minutes,
          r.stop_count, r.food_count, r.overnight_count, r.aimag_center_km,
          r.sort_order,
        ]
      )
      routeCount++
    } catch (e: any) {
      console.error('  ⚠️  Route:', e.message)
    }
  }
  console.log(`  ✅ Routes: ${routeCount} нэмэгдлээ`)

  // ── Tours ───────────────────────────────────────────────────────────────────
  const tourData = [
    {
      slug: 'uvs-summer-tour-2025',
      title_mn: 'Увсын зуны аялал 2025',
      title_en: 'Uvs Summer Tour 2025',
      description_mn: '<p>Увс аймгийн гайхамшигт байгалийг 5 өдрийн турш судлах боломжтой. Үүрэг нуур, Хархираа уул, Алтайн нурууны хажуугийн тал нутгаар аялна.</p>',
      highlights_mn: 'Үүрэг нуурт загасчлах\nХархираа уулын суурь хүртэл явган аялал\nНүүдэлчдийн гэрт хонох\nМонгол хоол идэх',
      start_date: '2025-07-10', end_date: '2025-07-14',
      price: 450000, max_participants: 15,
      meeting_point_mn: 'Улаангом хот, Аймгийн төвийн талбай',
      payment_bank: 'Хаан банк', payment_account: '5001234567', payment_name: 'Увс Жуулчин ХХК',
    },
    {
      slug: 'mountain-trekking-2025',
      title_mn: 'Хархираа-Түргэн уулын аялал',
      title_en: 'Kharkhiraa-Turgen Mountain Trek',
      description_mn: '<p>Хархираа (4,037 м) болон Түргэн (3,965 м) уулын нуруугаар 3 өдрийн явган аялал. Мөсөн гол, цасан оройг ойроос харах боломжтой.</p>',
      highlights_mn: 'Монгол дахь хамгийн өндөр оргилуудын нэгийг авирах\nМөсөн голын дэргэд хоноглох\nЦасан орой дээрээс Увс нуурын сав харах\nПрофессиональ хөтөчтэй',
      start_date: '2025-08-01', end_date: '2025-08-03',
      price: 380000, max_participants: 8,
      meeting_point_mn: 'Улаангом хот, Зочид буудлын урд',
      payment_bank: 'Голомт банк', payment_account: '2009876543', payment_name: 'Түргэн Трэк ХХК',
    },
    {
      slug: 'bird-watching-tour',
      title_mn: 'Шувуу ажиглалтын аялал',
      title_en: 'Bird Watching Tour',
      description_mn: '<p>Үүрэг нуур нь 200 гаруй зүйлийн шувуутай. Туршлагатай мэргэжилтэнтэй хамт шувуу ажиглалт хийх боломжтой аялал.</p>',
      highlights_mn: 'Далавчит шувуу, нугас, гавилийн зүйлүүд\nОрнитологич мэргэжилтэн хамт явна\nМэргэжлийн дуран тоног төхөөрөмж\nАялалын гэрэл зураг авах',
      start_date: '2025-09-05', end_date: '2025-09-07',
      price: 0, max_participants: 10,
      meeting_point_mn: 'Үүрэг нуурын баруун эрэг, Рашаан кемп',
      payment_bank: '', payment_account: '', payment_name: '',
    },
  ]

  let tourCount = 0
  for (const t of tourData) {
    try {
      await pool.execute(
        `INSERT IGNORE INTO tours
         (slug, title_mn, title_en, description_mn, highlights_mn,
          start_date, end_date, price, max_participants,
          meeting_point_mn, payment_bank, payment_account, payment_name,
          status, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'published',?)`,
        [
          t.slug, t.title_mn, t.title_en, t.description_mn, t.highlights_mn,
          t.start_date, t.end_date, t.price, t.max_participants,
          t.meeting_point_mn, t.payment_bank, t.payment_account, t.payment_name,
          adminId,
        ]
      )
      tourCount++
    } catch (e: any) {
      console.error('  ⚠️  Tour:', e.message)
    }
  }
  console.log(`  ✅ Tours: ${tourCount} нэмэгдлээ`)

  // ── Articles ─────────────────────────────────────────────────────────────────
  const articleData = [
    {
      slug: 'uvs-lake-guide',
      title_mn: 'Үүрэг нуурын аялалын гарын авлага',
      title_en: 'Uvs Lake Travel Guide',
      excerpt_mn: 'ЮНЕСКО-гийн Дэлхийн өвд бүртгэгдсэн Үүрэг нуурт хэрхэн очих, юу хийх талаарх бүрэн гарын авлага.',
      content_mn: `<h2>Үүрэг нуур</h2>
<p>Үүрэг нуур нь Монгол улсын хамгийн том давстай нуур бөгөөд ЮНЕСКО-гийн Дэлхийн өвд 2003 онд бүртгэгдсэн. Нуурын талбай 3,350 км², гүн нь дундажаар 20 метр.</p>
<h3>Хэрхэн очих вэ?</h3>
<p>Улаангомоос 18 км зайтай. Машинаар 30–40 минут. Такси болон нийтийн тээвэр байна.</p>
<h3>Юу хийх вэ?</h3>
<ul>
<li>Загасчлах — Цурхай, Алгана элбэгтэй</li>
<li>Шувуу ажиглах — 200 гаруй зүйл</li>
<li>Кемп хийх — эрэг дагуу</li>
<li>Нарны жаргалт харах</li>
</ul>
<h3>Зөвлөгөө</h3>
<p>Зун 6–9-р сард очих тохиромжтой. Хүнсний хангамжаа өөрөө авч явна уу.</p>`,
    },
    {
      slug: 'nomadic-culture-uvs',
      title_mn: 'Увс аймгийн нүүдэлчдийн соёл',
      title_en: 'Nomadic Culture of Uvs Province',
      excerpt_mn: 'Увс аймгийн нүүдэлчдийн уламжлалт амьдралын хэв маяг, зан заншил, хоол хүнс.',
      content_mn: `<h2>Нүүдэлчдийн уламжлал</h2>
<p>Увс аймаг нь Монголын баруун хэсэгт оршдог бөгөөд нүүдэлчдийн уламжлал хэвээр хадгалагдаж ирсэн газар нутаг юм.</p>
<h3>Гэр буудал</h3>
<p>Монгол гэр нь нүүдэлчдийн уламжлалт байшин. Дугуй хэлбэртэй, хурдан угсрах, задлах боломжтой. Зуны улиралд хэд хэдэн гэр буудал ажилладаг.</p>
<h3>Уламжлалт хоол</h3>
<ul>
<li>Цуйван — гурилтай мах</li>
<li>Бууз — уурын хий дотор хийсэн хуушуур</li>
<li>Тараг — исгэсэн цагаан идээ</li>
<li>Айраг — гүүний исгэлэн сүү</li>
</ul>
<h3>Наадам</h3>
<p>7-р сарын 11–13-нд Монгол бүхэлдээ Наадам тэмцээн зохион байгуулдаг. Бөх, морин уралдаан, сур харваа — 3 эрийн наадам.</p>`,
    },
    {
      slug: 'best-season-to-visit',
      title_mn: 'Увс аймагт очих шилдэг улирал',
      title_en: 'Best Season to Visit Uvs Province',
      excerpt_mn: 'Увс аймагт аялахад хамгийн тохиромжтой цаг хугацаа, цаг агаарын онцлог.',
      content_mn: `<h2>Хэдэн сард очвол тохиромжтой вэ?</h2>
<h3>Зун (6–8-р сар) ⭐ Санал болгож буй</h3>
<p>Хамгийн тохиромжтой цаг. Агаарын температур +20–+35°C. Бүх газар нэвтрэх боломжтой.</p>
<h3>Хавар (4–5-р сар)</h3>
<p>Цэцэглэдэг тал нутаг. Температур +5–+20°C. Шороон зам зарим газар хүнд.</p>
<h3>Намар (9–10-р сар)</h3>
<p>Алтан өнгөт байгаль. Температур 0–+15°C. Загасчлалд тохиромжтой.</p>
<h3>Өвөл (11–3-р сар)</h3>
<p>Жуулчин цөөн. Температур -20–-40°C. Хүнд нөхцөл.</p>`,
    },
  ]

  let articleCount = 0
  for (const a of articleData) {
    try {
      await pool.execute(
        `INSERT IGNORE INTO articles
         (slug, title_mn, title_en, excerpt_mn, content_mn, status, author_id)
         VALUES (?,?,?,?,?,'published',?)`,
        [a.slug, a.title_mn, a.title_en, a.excerpt_mn, a.content_mn, adminId]
      )
      articleCount++
    } catch (e: any) {
      console.error('  ⚠️  Article:', e.message)
    }
  }
  console.log(`  ✅ Articles: ${articleCount} нэмэгдлээ`)

  console.log('\n✅ Seed бүрэн дууслаа!')
  console.log('   🔑 Нэвтрэх: admin@qruvs.mn / admin123')
  process.exit(0)
}

seed().catch(err => { console.error(err); process.exit(1) })
