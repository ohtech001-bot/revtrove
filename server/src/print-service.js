import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..')

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char])

const copy={
  ar:{dir:'rtl',locale:'ar',customer:'تفاصيل الزبون',name:'الاسم',phone:'رقم الهاتف',country:'البلد',address:'مكان التوصيل',order:'تفاصيل الطلب',product:'اسم المنتج',part:'القطعة',color:'اللون',base:'النص على القاعدة',caliper:'النص على الكاليبر',quantity:'الكمية',notes:'ملاحظات',custom:'تفاصيل التصميم الخاص',price:'السعر المتفق عليه',days:'مدة التجهيز',day:'يوم',thanks:'شكراً لشرائكم من REVTROVE'},
  en:{dir:'ltr',locale:'en',customer:'Customer details',name:'Name',phone:'Phone',country:'Country',address:'Delivery address',order:'Order details',product:'Product',part:'Part',color:'Color',base:'Text on stand',caliper:'Text on caliper',quantity:'Quantity',notes:'Notes',custom:'Custom design details',price:'Quoted price',days:'Production time',day:'days',thanks:'Thank you for shopping with REVTROVE'},
  he:{dir:'rtl',locale:'he',customer:'פרטי לקוח',name:'שם',phone:'טלפון',country:'מדינה',address:'כתובת למשלוח',order:'פרטי הזמנה',product:'מוצר',part:'חלק',color:'צבע',base:'טקסט על המעמד',caliper:'טקסט על הקליפר',quantity:'כמות',notes:'הערות',custom:'פרטי עיצוב מיוחד',price:'מחיר מוצע',days:'זמן הכנה',day:'ימים',thanks:'תודה שקניתם ב-REVTROVE'},
}
const parts={
  ar:{rim:'الجنط',disc:'قرص الفرامل',caliper:'الكاليبر',stand:'القاعدة',hub:'القطعة الوسطية',airFilter:'الفلتر',turboBody:'جسم التيربو',fan:'المروحة'},
  en:{rim:'Wheel',disc:'Brake disc',caliper:'Caliper',stand:'Stand',hub:'Center hub',airFilter:'Filter',turboBody:'Turbo body',fan:'Fan'},
  he:{rim:'גלגל',disc:'דיסק בלם',caliper:'קליפר',stand:'מעמד',hub:'מרכז',airFilter:'פילטר',turboBody:'גוף טורבו',fan:'מאוורר'},
}
const colors={
  '#b9bcc2':{ar:'رمادي فاتح',en:'Light gray',he:'אפור בהיר'},'#4b4f56':{ar:'رمادي غامق',en:'Dark gray',he:'אפור כהה'},
  '#42a5e8':{ar:'أزرق فاتح',en:'Light blue',he:'כחול בהיר'},'#174db8':{ar:'أزرق غامق',en:'Dark blue',he:'כחול כהה'},
  '#df2029':{ar:'أحمر',en:'Red',he:'אדום'},'#f6bd00':{ar:'أصفر',en:'Yellow',he:'צהוב'},'#101114':{ar:'أسود',en:'Black',he:'שחור'},
  '#f4f4ef':{ar:'أبيض',en:'White',he:'לבן'},'#f36f21':{ar:'برتقالي',en:'Orange',he:'כתום'},'#78c850':{ar:'أخضر فاتح',en:'Light green',he:'ירוק בהיר'},
}
const colorName=(value,lang) => {
  const hex=String(value || '').toLowerCase()
  if(colors[hex]) return colors[hex][lang]
  const match=/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if(!match) return value || '—'
  const rgb=match.slice(1).map((part)=>parseInt(part,16))
  const nearest=Object.entries(colors).reduce((best,[candidate,labels])=>{
    const candidateRgb=[candidate.slice(1,3),candidate.slice(3,5),candidate.slice(5,7)].map((part)=>parseInt(part,16))
    const distance=candidateRgb.reduce((sum,channel,index)=>sum+((channel-rgb[index])**2),0)
    return !best || distance < best.distance ? {labels,distance} : best
  },null)
  return nearest?.labels?.[lang] || value || '—'
}
const defaults={
  'bmw-m3-cs':{base:'BMW M3 CS',caliper:'BREMBO'},'dodge-srt':{base:'SRT',caliper:'BREMBO'},
  'porsche-gt3rs':{base:'PORSCHE GT3 RS',caliper:'PORSCHE'},'bmw-m-turbo':{base:'BMW M',caliper:''},
}

export async function queueOrderPrint(order,language='ar') {
  const lang=copy[language] ? language : 'ar'
  const text=copy[lang]
  const outputDir=path.join(projectRoot,'print-queue')
  await mkdir(outputDir,{recursive:true})
  const details=typeof order.details === 'string' ? JSON.parse(order.details) : (order.details || {})
  const original=defaults[details.productSlug] || {base:'',caliper:''}
  const localizedParts=(details.parts || []).map((item)=>({label:parts[lang][item.label] || item.label,value:item.colorLabel || colorName(item.color,lang)}))
  const colorRows=(details.parts || []).map((item) => {
    const color=item.colorLabel || colorName(item.color,lang)
    return `<tr><td>${escapeHtml(parts[lang][item.label] || item.label)}</td><td><b>${escapeHtml(color)}</b></td></tr>`
  }).join('')
  const customDetails=details.partsDescription ? `<div class="row"><b>${escapeHtml(text.custom)}</b><span>${escapeHtml(details.partsDescription)}</span></div>` : ''
  const quote=order.type === 'custom' && order.quoted_price ? `<div class="quote"><div><b>${escapeHtml(text.price)}</b><span>₪${escapeHtml(order.quoted_price)}</span></div>${order.production_eta ? `<div><b>${escapeHtml(text.days)}</b><span>${escapeHtml(order.production_eta)} ${escapeHtml(text.day)}</span></div>` : ''}</div>` : ''
  const html=`<!doctype html><html lang="${lang}" dir="${text.dir}"><head><meta charset="utf-8"><title>${escapeHtml(order.public_id)}</title><style>
  @page{size:80mm auto;margin:3mm}*{box-sizing:border-box}html,body{width:74mm;margin:0;padding:0;background:#fff;color:#000}body{font-family:Arial,Tahoma,sans-serif;font-size:11px;line-height:1.45}.receipt{width:72mm;margin:auto}.brand{text-align:center;border-bottom:2px solid #000;padding-bottom:3mm}.brand img{display:block;max-width:43mm;max-height:15mm;object-fit:contain;margin:0 auto 1.5mm}.brand h1{font-size:18px;letter-spacing:2px;margin:0}.brand p{margin:1mm 0 0;font-size:9px}.order-id{text-align:center;font-weight:900;font-size:13px;padding:2.5mm 0;border-bottom:1px dashed #000}.section{padding:2.5mm 0;border-bottom:1px dashed #000}.section h2{font-size:13px;margin:0 0 2mm}.row{display:grid;grid-template-columns:25mm 1fr;gap:2mm;margin:1mm 0;align-items:start}.row b{font-size:10px}.row span{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;margin:2mm 0}th,td{border:1px solid #000;padding:1.6mm;text-align:${text.dir==='rtl'?'right':'left'};font-size:10px}th{background:#eee}.quote{border:2px solid #000;padding:2mm;margin-top:2mm}.quote>div{display:flex;justify-content:space-between;gap:3mm;margin:1mm 0}.quote span{font-size:13px;font-weight:900}.thanks{text-align:center;font-weight:900;font-size:12px;padding:4mm 1mm 2mm}.date{text-align:center;font-size:8px;color:#444}.no-print{display:none}@media print{html,body,.receipt{width:72mm}.receipt{break-inside:avoid}}
  </style></head><body><main class="receipt"><header class="brand"><img src="/logos/revtrove.jpg" alt="REVTROVE"><h1>REVTROVE</h1><p>052-253-8264</p><p>Rev.trove.911@gmail.com</p></header><div class="order-id">${escapeHtml(order.public_id)}</div><section class="section"><h2>${escapeHtml(text.customer)}</h2><div class="row"><b>${escapeHtml(text.name)}</b><span>${escapeHtml(order.customer_name)}</span></div><div class="row"><b>${escapeHtml(text.phone)}</b><span>${escapeHtml(order.phone)}</span></div><div class="row"><b>${escapeHtml(text.country)}</b><span>${escapeHtml(order.country)}</span></div><div class="row"><b>${escapeHtml(text.address)}</b><span>${escapeHtml(order.delivery_address)}</span></div></section><section class="section"><h2>${escapeHtml(text.order)}</h2><div class="row"><b>${escapeHtml(text.product)}</b><span>${escapeHtml(details.productName || details.customName)}</span></div>${customDetails}${colorRows ? `<table><thead><tr><th>${escapeHtml(text.part)}</th><th>${escapeHtml(text.color)}</th></tr></thead><tbody>${colorRows}</tbody></table>` : ''}${order.type === 'standard' ? `<div class="row"><b>${escapeHtml(text.base)}</b><span>${escapeHtml(details.baseText || original.base || '—')}</span></div><div class="row"><b>${escapeHtml(text.caliper)}</b><span>${escapeHtml(details.caliperText || original.caliper || '—')}</span></div><div class="row"><b>${escapeHtml(text.quantity)}</b><span>${escapeHtml(details.quantity || 1)}</span></div>` : ''}${quote}<div class="row"><b>${escapeHtml(text.notes)}</b><span>${escapeHtml(order.notes || '—')}</span></div></section><div class="thanks">${escapeHtml(text.thanks)}</div><div class="date">${escapeHtml(new Date().toLocaleString(text.locale))}</div></main></body></html>`
  const ticketPath=path.join(outputDir,`${order.public_id}-${lang}.html`)
  await writeFile(ticketPath,html,'utf8')
  const printPayload={direction:text.dir,logoPath:path.join(projectRoot,'client','public','logos','revtrove.jpg'),store:{name:'REVTROVE',phone:'052-253-8264',email:'Rev.trove.911@gmail.com'},orderId:order.public_id,sections:[{title:text.customer,rows:[{label:text.name,value:order.customer_name},{label:text.phone,value:order.phone},{label:text.country,value:order.country},{label:text.address,value:order.delivery_address}]},{title:text.order,rows:[{label:text.product,value:details.productName || details.customName},...(details.partsDescription ? [{label:text.custom,value:details.partsDescription}] : []),...localizedParts,...(order.type === 'standard' ? [{label:text.base,value:details.baseText || original.base || '—'},{label:text.caliper,value:details.caliperText || original.caliper || '—'},{label:text.quantity,value:String(details.quantity || 1)}] : []),...(order.type === 'custom' && order.quoted_price ? [{label:text.price,value:`₪${order.quoted_price}`},...(order.production_eta ? [{label:text.days,value:`${order.production_eta} ${text.day}`}] : [])] : []),{label:text.notes,value:order.notes || '—'}]}],thanks:text.thanks,printedAt:new Date().toLocaleString(text.locale)}
  await writeFile(ticketPath.replace(/\.html$/i,'.json'),JSON.stringify(printPayload),'utf8')
  if(process.env.AUTO_PRINT_ENABLED === 'true' && process.env.PRINT_COMMAND){
    const command=JSON.parse(process.env.PRINT_COMMAND)
    if(!Array.isArray(command)||!command.length) throw new Error('PRINT_COMMAND must be a JSON array')
    await new Promise((resolve,reject)=>{
      const child=spawn(command[0],[...command.slice(1),ticketPath],{detached:false,windowsHide:true,stdio:['ignore','ignore','pipe'],shell:false})
      let errorOutput=''
      child.stderr.on('data',(chunk)=>{errorOutput+=chunk.toString()})
      child.on('error',reject)
      child.on('close',(code)=>code===0?resolve():reject(new Error(`print_command_failed_${code}: ${errorOutput.slice(-1000)}`)))
    })
  }
  return ticketPath
}
