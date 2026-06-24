import pool from './database'
import dotenv from 'dotenv'
dotenv.config()

const tables = [
  `CREATE TABLE IF NOT EXISTS users (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    email      VARCHAR(150) NOT NULL UNIQUE,
    password   VARCHAR(255) DEFAULT NULL,
    avatar     VARCHAR(500) DEFAULT NULL,
    role       ENUM('superadmin','admin','user') NOT NULL DEFAULT 'user',
    provider   ENUM('local','google') NOT NULL DEFAULT 'local',
    google_id  VARCHAR(255) DEFAULT NULL,
    is_active  TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email     (email),
    INDEX idx_google_id (google_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS tags (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    key_name   VARCHAR(50) NOT NULL UNIQUE,
    label_mn   VARCHAR(100) NOT NULL,
    label_en   VARCHAR(100) NOT NULL,
    label_ru   VARCHAR(100) NOT NULL,
    icon       VARCHAR(50) NOT NULL DEFAULT 'ti-tag',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS places (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    slug             VARCHAR(200) NOT NULL UNIQUE,
    name_mn          VARCHAR(200) NOT NULL,
    name_en          VARCHAR(200) NOT NULL DEFAULT '',
    name_ru          VARCHAR(200) NOT NULL DEFAULT '',
    description_mn   LONGTEXT,
    description_en   LONGTEXT,
    description_ru   LONGTEXT,
    category         ENUM('lake','mountain','river','forest','steppe','historical','other') NOT NULL DEFAULT 'other',
    latitude         DECIMAL(10,7) NOT NULL DEFAULT 0,
    longitude        DECIMAL(10,7) NOT NULL DEFAULT 0,
    altitude         VARCHAR(50)  DEFAULT NULL,
    area             VARCHAR(100) DEFAULT NULL,
    depth            VARCHAR(50)  DEFAULT NULL,
    best_season_mn   VARCHAR(200) DEFAULT NULL,
    best_season_en   VARCHAR(200) DEFAULT NULL,
    best_season_ru   VARCHAR(200) DEFAULT NULL,
    entry_fee        DECIMAL(10,2) NOT NULL DEFAULT 0,
    open_hours_mn    VARCHAR(200) DEFAULT NULL,
    open_hours_en    VARCHAR(200) DEFAULT NULL,
    open_hours_ru    VARCHAR(200) DEFAULT NULL,
    phone            VARCHAR(50)  DEFAULT NULL,
    aimag_center_km  DECIMAL(8,1) DEFAULT NULL,
    status           ENUM('published','draft') NOT NULL DEFAULT 'draft',
    rating           DECIMAL(3,1) NOT NULL DEFAULT 0,
    review_count     INT NOT NULL DEFAULT 0,
    created_by       INT DEFAULT NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_slug     (slug),
    INDEX idx_status   (status),
    INDEX idx_category (category)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS place_tags (
    place_id INT NOT NULL,
    tag_id   INT NOT NULL,
    PRIMARY KEY (place_id, tag_id),
    FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id)   REFERENCES tags(id)   ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS place_images (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    place_id   INT NOT NULL,
    url        VARCHAR(500) NOT NULL,
    caption    VARCHAR(300) DEFAULT NULL,
    is_cover   TINYINT(1) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE,
    INDEX idx_place (place_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS banners (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    title_mn    VARCHAR(300) NOT NULL,
    title_en    VARCHAR(300) NOT NULL DEFAULT '',
    title_ru    VARCHAR(300) NOT NULL DEFAULT '',
    subtitle_mn VARCHAR(500) DEFAULT NULL,
    subtitle_en VARCHAR(500) DEFAULT NULL,
    subtitle_ru VARCHAR(500) DEFAULT NULL,
    image_url   VARCHAR(500) NOT NULL DEFAULT '',
    link_url    VARCHAR(500) DEFAULT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS articles (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    slug         VARCHAR(300) NOT NULL UNIQUE,
    title_mn     VARCHAR(300) NOT NULL,
    title_en     VARCHAR(300) NOT NULL DEFAULT '',
    title_ru     VARCHAR(300) NOT NULL DEFAULT '',
    content_mn   LONGTEXT,
    content_en   LONGTEXT,
    content_ru   LONGTEXT,
    excerpt_mn   TEXT DEFAULT NULL,
    excerpt_en   TEXT DEFAULT NULL,
    excerpt_ru   TEXT DEFAULT NULL,
    cover_image  VARCHAR(500) DEFAULT NULL,
    tags         JSON DEFAULT NULL,
    status       ENUM('published','draft') NOT NULL DEFAULT 'draft',
    author_id    INT DEFAULT NULL,
    published_at TIMESTAMP NULL DEFAULT NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_slug   (slug),
    INDEX idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS reviews (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    place_id   INT NOT NULL,
    user_id    INT NOT NULL,
    rating     TINYINT NOT NULL DEFAULT 5,
    comment    TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
    UNIQUE KEY uq_user_place (user_id, place_id),
    INDEX idx_place (place_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS tours (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    slug                 VARCHAR(200) NOT NULL UNIQUE,
    title_mn             VARCHAR(300) NOT NULL,
    title_en             VARCHAR(300) DEFAULT '',
    title_ru             VARCHAR(300) DEFAULT '',
    description_mn       LONGTEXT DEFAULT NULL,
    description_en       LONGTEXT DEFAULT NULL,
    description_ru       LONGTEXT DEFAULT NULL,
    highlights_mn        TEXT DEFAULT NULL,
    start_date           DATE DEFAULT NULL,
    end_date             DATE DEFAULT NULL,
    price                DECIMAL(10,2) DEFAULT 0,
    max_participants     INT DEFAULT 0,
    current_participants INT DEFAULT 0,
    meeting_point_mn     VARCHAR(300) DEFAULT NULL,
    payment_bank         VARCHAR(100) DEFAULT NULL,
    payment_account      VARCHAR(100) DEFAULT NULL,
    payment_name         VARCHAR(200) DEFAULT NULL,
    payment_qr           VARCHAR(500) DEFAULT NULL,
    cover_image          VARCHAR(500) DEFAULT NULL,
    status               ENUM('published','draft') NOT NULL DEFAULT 'draft',
    created_by           INT DEFAULT NULL,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_slug   (slug),
    INDEX idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS tour_registrations (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    tour_id           INT NOT NULL,
    name              VARCHAR(200) NOT NULL,
    email             VARCHAR(150) DEFAULT '',
    phone             VARCHAR(50) NOT NULL,
    participant_count INT DEFAULT 1,
    note              TEXT DEFAULT NULL,
    status            ENUM('pending','confirmed','cancelled') DEFAULT 'pending',
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE,
    INDEX idx_tour (tour_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS routes (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    title_mn         VARCHAR(255) NOT NULL DEFAULT '',
    title_en         VARCHAR(255) DEFAULT '',
    title_ru         VARCHAR(255) DEFAULT '',
    from_mn          VARCHAR(255) NOT NULL DEFAULT '',
    from_en          VARCHAR(255) DEFAULT '',
    from_ru          VARCHAR(255) DEFAULT '',
    to_mn            VARCHAR(255) NOT NULL DEFAULT '',
    to_en            VARCHAR(255) DEFAULT '',
    to_ru            VARCHAR(255) DEFAULT '',
    total_km         DECIMAL(8,1) NOT NULL DEFAULT 0,
    paved_km         DECIMAL(8,1) DEFAULT 0,
    dirt_km          DECIMAL(8,1) DEFAULT 0,
    duration_minutes INT DEFAULT 0,
    stop_count       INT DEFAULT 0,
    food_count       INT DEFAULT 0,
    overnight_count  INT DEFAULT 0,
    aimag_center_km  DECIMAL(8,1) DEFAULT 0,
    cover_image      VARCHAR(500) DEFAULT NULL,
    status           ENUM('published','draft') NOT NULL DEFAULT 'draft',
    sort_order       INT NOT NULL DEFAULT 0,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]

async function migrate() {
  console.log('🔄 Running migrations...')
  for (const sql of tables) {
    const name = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1]
    try {
      await pool.execute(sql)
      console.log(`  ✅  ${name}`)
    } catch (err: any) {
      console.error(`  ❌  ${name}:`, err.message)
      process.exit(1)
    }
  }
  console.log('✅ Migration complete')
  process.exit(0)
}

migrate()
