import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char])

export async function queueOrderPrint(order) {
  const outputDir = path.resolve('print-queue')
  await mkdir(outputDir, { recursive: true })
  const details = typeof order.details === 'string' ? JSON.parse(order.details) : order.details
  const parts = (details.parts || []).map((part) => `<tr><td>${escapeHtml(part.label)}</td><td>${escapeHtml(part.colorLabel || part.color)}</td></tr>`).join('')
  const location = details.deliveryLocation
  const locationUrl = location ? `https://www.google.com/maps?q=${Number(location.lat)},${Number(location.lng)}` : ''
  const html = `<!doctype html><html dir="rtl"><meta charset="utf-8"><title>${escapeHtml(order.public_id)}</title><style>body{font-family:Arial,sans-serif;max-width:720px;margin:auto;color:#111}h1{border-bottom:3px solid #111;padding-bottom:12px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:9px;text-align:right}.muted{color:#666}.section{margin:22px 0}</style><body><h1>REVTROVE — ${escapeHtml(order.public_id)}</h1><div class="section"><b>اسم الزبون:</b> ${escapeHtml(order.customer_name)}<br><b>رقم الهاتف:</b> ${escapeHtml(order.country_code)} ${escapeHtml(order.phone)}<br><b>البلد:</b> ${escapeHtml(order.country)}<br><b>مكان التوصيل:</b> ${escapeHtml(order.delivery_address)}${locationUrl ? `<br><b>الموقع الدقيق:</b> <a href="${escapeHtml(locationUrl)}">${escapeHtml(locationUrl)}</a>` : ''}</div><div class="section"><h2>تفاصيل الطلب</h2><b>اسم المنتج:</b> ${escapeHtml(details.productName || details.customName)}<table><thead><tr><th>القطعة</th><th>اللون</th></tr></thead><tbody>${parts}</tbody></table><p><b>نص القاعدة:</b> ${escapeHtml(details.baseText)}</p><p><b>نص الكاليبر:</b> ${escapeHtml(details.caliperText)}</p><p><b>الكمية:</b> ${escapeHtml(details.quantity || 1)}</p></div><div class="section"><b>ملاحظات:</b> ${escapeHtml(order.notes || '—')}</div><p class="muted">${new Date().toLocaleString('ar')}</p></body></html>`
  const ticketPath = path.join(outputDir, `${order.public_id}.html`)
  await writeFile(ticketPath, html, 'utf8')

  if (process.env.AUTO_PRINT_ENABLED === 'true' && process.env.PRINT_COMMAND) {
    const command = JSON.parse(process.env.PRINT_COMMAND)
    if (!Array.isArray(command) || !command.length) throw new Error('PRINT_COMMAND must be a JSON array')
    const child = spawn(command[0], [...command.slice(1), ticketPath], { detached: true, stdio: 'ignore', shell: false })
    child.unref()
  }
  return ticketPath
}
