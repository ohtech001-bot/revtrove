const escape=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))
const copy={
  ar:{customer:'تفاصيل الزبون',name:'الاسم',phone:'رقم الهاتف',country:'البلد',address:'مكان التوصيل',order:'تفاصيل الطلب',product:'المنتج',part:'القطعة',color:'اللون',base:'النص على القاعدة',caliper:'النص على الكاليبر',quantity:'الكمية',notes:'ملاحظات',price:'السعر المتفق عليه',days:'مدة التجهيز',day:'يوم',thanks:'شكراً لشرائكم من REVTROVE',custom:'لون مخصص'},
  en:{customer:'Customer details',name:'Name',phone:'Phone',country:'Country',address:'Delivery address',order:'Order details',product:'Product',part:'Part',color:'Color',base:'Text on stand',caliper:'Text on caliper',quantity:'Quantity',notes:'Notes',price:'Quoted price',days:'Production time',day:'days',thanks:'Thank you for shopping with REVTROVE',custom:'Custom color'},
  he:{customer:'פרטי לקוח',name:'שם',phone:'טלפון',country:'מדינה',address:'כתובת למשלוח',order:'פרטי הזמנה',product:'מוצר',part:'חלק',color:'צבע',base:'טקסט על המעמד',caliper:'טקסט על הקליפר',quantity:'כמות',notes:'הערות',price:'מחיר מוסכם',days:'זמן הכנה',day:'ימים',thanks:'תודה שקניתם ב-REVTROVE',custom:'צבע מותאם'},
}
export function receiptMarkup(order,language,{defaults={},colors=[],labels={}}={}) {
  const lang=copy[language]?language:'ar',t=copy[lang],details=order.details||{},original=details.texts?{}:(defaults[details.productSlug]||{})
  const colorName=hex=>{
    const rgb=value=>/^#[0-9a-f]{6}$/i.test(value)?[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)):null
    const target=rgb(hex);if(!target)return t.custom
    const match=colors.reduce((best,item)=>{const channels=rgb(item.hex);if(!channels)return best;const distance=channels.reduce((sum,v,i)=>sum+(v-target[i])**2,0);return !best||distance<best.distance?{item,distance}:best},null)
    return match?.item?.[lang]||match?.item?.en||t.custom
  }
  const row=(label,value)=>'<div class="receipt-row"><b>'+escape(label)+'</b><span>'+escape(value||'—')+'</span></div>'
  return '<article class="receipt" dir="'+(lang==='en'?'ltr':'rtl')+'" lang="'+lang+'"><header><img src="/logos/revtrove-print.png" alt="REVTROVE"/><p>052-253-8264 · Rev.trove.911@gmail.com</p></header><h2 class="receipt-id">'+escape(order.display_id||('ord'+order.id))+'</h2><section><h2>'+t.customer+'</h2>'+row(t.name,order.customer_name)+row(t.phone,order.phone)+row(t.country,order.country)+row(t.address,order.delivery_address)+'</section><section><h2>'+t.order+'</h2>'+row(t.product,details.productName||details.customName)+(details.partsDescription?row(t.order,details.partsDescription):'')+row(t.quantity,details.quantity||1)+(details.parts?.length?'<table><thead><tr><th>'+t.part+'</th><th>'+t.color+'</th></tr></thead><tbody>'+details.parts.map(part=>'<tr><td>'+escape(part.labels?.[lang]||labels[part.label]||(part.label==='body'?t.product:part.label))+'</td><td>'+escape(part.colorLabel||part.colorNames?.[lang]||colorName(part.color))+'</td></tr>').join('')+'</tbody></table>':'')+(!details.productSlug?Object.entries(details.dimensions||{}).filter(([,v])=>v!=null).map(([k,v])=>row(({ar:{length:'الطول',width:'العرض',height:'الارتفاع'},en:{length:'Length',width:'Width',height:'Height'},he:{length:'אורך',width:'רוחב',height:'גובה'}})[lang][k],v+' cm')).join(''):((details.baseText||original.base)?row(details.textLabels?.standText?.[lang]||details.textLabels?.stand?.[lang]||t.base,details.baseText||original.base):'')+((details.caliperText||original.caliper)?row(details.textLabels?.caliperText?.[lang]||details.textLabels?.caliper?.[lang]||t.caliper,details.caliperText||original.caliper):'')+Object.entries(details.texts||{}).filter(([k])=>!['stand','caliper','standText','caliperText'].includes(k)).map(([k,v])=>row(details.textLabels?.[k]?.[lang]||details.parts?.find(p=>p.label===k)?.labels?.[lang]||k,v)).join(''))+(order.quoted_price!=null?row(t.price,'₪'+order.quoted_price):'')+(order.production_eta?row(t.days,order.production_eta+' '+t.day):'')+row(t.notes,order.notes)+'</section><footer>'+t.thanks+'</footer></article>'
}
export const printCss=`
#print-order{display:none}
@media print {
  @page{size:A4;margin:16mm}
  html,body{margin:0!important;background:white!important;color:black!important;overflow:visible!important;height:auto!important}
  body.printing-order>*:not(#print-order){display:none!important}
  body.printing-order #print-order{display:block!important;position:static!important;width:100%!important;color:black!important;background:white!important;font-family:Arial,Tahoma,sans-serif;font-size:12pt;line-height:1.5}
  #print-order button,#print-order nav,#print-order .no-print{display:none!important}
  #print-order header{text-align:center;border-bottom:2px solid black;padding-bottom:8mm}
  #print-order header img{max-width:65mm;max-height:22mm;object-fit:contain}
  #print-order h1{font-size:24pt;margin:3mm 0}#print-order h2{font-size:16pt;margin:4mm 0}
  #print-order section{border-bottom:1px solid black;padding-bottom:5mm}
  #print-order .receipt-row{display:grid;grid-template-columns:45mm 1fr;gap:5mm;margin:2mm 0;overflow-wrap:anywhere}
  #print-order table{width:100%;border-collapse:collapse;margin:5mm 0}
  #print-order th,#print-order td{padding:3mm;border:1px solid black;text-align:inherit}
  #print-order tr,#print-order .receipt-row{break-inside:avoid}
  #print-order thead{display:table-header-group}#print-order footer{text-align:center;font-weight:bold;margin-top:10mm}
  #print-order [dir=rtl]{text-align:right}#print-order [dir=ltr]{text-align:left}
}`
export async function printOrder(order,language,options) {
  const previous=document.getElementById('print-order');previous?.remove()
  const root=document.createElement('div');root.id='print-order'
  const style=document.createElement('style');style.textContent=printCss;root.append(style)
  const content=document.createElement('div');content.innerHTML=receiptMarkup(order,language,options);root.append(content);document.body.append(root)
  const cleanup=()=>{document.body.classList.remove('printing-order');root.remove();window.removeEventListener('afterprint',cleanup)}
  window.addEventListener('afterprint',cleanup,{once:true})
  try {
    await Promise.all([...root.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})))
    if(document.fonts?.ready)await document.fonts.ready
    document.body.classList.add('printing-order')
    window.print()
  }catch(error){cleanup();throw error}
}
