import { Request, Response } from 'express'
import pool from '../config/database'

// GET /tags
export async function getTags(_req: Request, res: Response) {
  try {
    const [rows]: any = await pool.execute('SELECT * FROM tags ORDER BY label_mn ASC')
    res.json({ success: true, data: rows })
  } catch (err: any) {
    console.error('getTags:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// POST /tags (admin)
export async function createTag(req: Request, res: Response) {
  try {
    const { key_name, label_mn, label_en, label_ru, icon } = req.body
    if (!key_name || !label_mn) return res.status(400).json({ success: false, message: 'key_name болон label_mn заавал шаардлагатай' })

    const [result]: any = await pool.execute(
      'INSERT INTO tags (key_name, label_mn, label_en, label_ru, icon) VALUES (?,?,?,?,?)',
      [key_name.trim(), label_mn, label_en || '', label_ru || '', icon || 'ti-tag']
    )
    res.status(201).json({ success: true, data: { id: result.insertId } })
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Энэ key_name аль хэдийн байна' })
    console.error('createTag:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}

// DELETE /tags/:id (admin)
export async function deleteTag(req: Request, res: Response) {
  try {
    await pool.execute('DELETE FROM tags WHERE id = ?', [req.params.id])
    res.json({ success: true, message: 'Tag устгагдлаа' })
  } catch (err: any) {
    console.error('deleteTag:', err)
    res.status(500).json({ success: false, message: 'Серверийн алдаа' })
  }
}
