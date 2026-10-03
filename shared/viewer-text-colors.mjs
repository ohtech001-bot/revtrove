// Details have database-generated keys. Bind by their multilingual meaning,
// not a particular document ID, and also accept saved order label snapshots.
const normalize = value => String(value || '').normalize('NFKC').toLowerCase()
  .replace(/[\u064B-\u065F\u0670ـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim()

export function textColorTarget(field = {}) {
  if (field.type === 'text' || field.colorEnabled === false) return null
  const key = normalize(field.key || field.label).replace(/\s/g, '')
  if (['standtextcolor', 'basetextcolor'].includes(key)) return 'stand'
  if (key === 'calipertextcolor') return 'caliper'
  const labels = [field.label_ar, field.label_en, field.label_he, ...Object.values(field.labels || {})].map(normalize)
  for (const label of labels) {
    const isTextColor = /لون\s+(?:النص|الكتابة)|(?:text|lettering)\s+colou?r|colou?r\s+(?:of\s+)?(?:the\s+)?(?:text|lettering)|צבע\s+(?:הטקסט|הכתיבה)/.test(label)
    if (!isTextColor) continue
    if (/القاعدة|\b(?:base|stand)\b|הבסיס|המעמד/.test(label)) return 'stand'
    if (/الكاليبر|الكليبر|\b(?:caliper|kaleper)\b|הקליפר|הכליבר/.test(label)) return 'caliper'
  }
  return null
}

export function viewerTextColors(fields = [], selections = {}) {
  const result = { stand: '#f4f4ef', caliper: '#f4f4ef' }
  for (const field of fields) {
    const target = textColorTarget(field)
    const color = selections[field.key || field.label]
    if (target && /^#[0-9a-f]{6}$/i.test(String(color || ''))) result[target] = color
  }
  return result
}
