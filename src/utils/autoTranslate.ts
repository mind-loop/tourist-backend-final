import translate from 'translate-google'

const TARGET_LANGS = ['en', 'ru'] as const
type TargetLang = typeof TARGET_LANGS[number]

async function translateText(text: string, to: TargetLang): Promise<string> {
  try {
    const result = await translate(text, { from: 'mn', to })
    return typeof result === 'string' ? result : ''
  } catch (err: any) {
    console.error(`autoTranslate (${to}) алдаа:`, err?.message || err)
    return ''
  }
}

// body дотор `${field}_mn` утга бий, харин `${field}_en`/`${field}_ru` хоосон бол
// Google Translate ашиглан автоматаар орчуулж бөглөнө (mutates body in place)
export async function autoTranslateFields(body: Record<string, any>, fields: string[]): Promise<void> {
  for (const field of fields) {
    const mnValue = body[`${field}_mn`]
    if (typeof mnValue !== 'string' || !mnValue.trim()) continue

    for (const lang of TARGET_LANGS) {
      const key = `${field}_${lang}`
      if (typeof body[key] !== 'string' || !body[key].trim()) {
        body[key] = await translateText(mnValue, lang)
      }
    }
  }
}
