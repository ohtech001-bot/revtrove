import {useEffect,useState} from 'react'
const axes=['length','width','height']
const text={
 ar:{title:'قياسات الطلب الخاص — سم',length:'الطول',width:'العرض',height:'الارتفاع',max:'الحد الأقصى',unset:'غير محدد',save:'حفظ الحدود',error:'تعذر الحفظ أو قراءة الحدود',saved:'تم الحفظ',notice:'سيتم التعامل مع طلبك حسب الصور المرفقة والألوان الظاهرة فيها. سنتواصل معك عبر واتساب لتأكيد التفاصيل والسعر قبل التجهيز. مدة التجهيز من أسبوع إلى أسبوعين. التبديل أو الإرجاع فقط عند العطل أو الكسر أو عدم مطابقة المواصفات المتفق عليها.'},
 en:{title:'Custom dimensions — cm',length:'Length',width:'Width',height:'Height',max:'Maximum',unset:'Not set',save:'Save limits',error:'Could not save or load limits',saved:'Saved',notice:'Your request will be based on your attached images and their colors. We will confirm details and price via WhatsApp before production. Preparation takes 1–2 weeks. Returns or exchanges apply only to defects, damage or failure to match agreed specifications.'},
 he:{title:'מידות להזמנה מיוחדת — ס״מ',length:'אורך',width:'רוחב',height:'גובה',max:'מקסימום',unset:'לא הוגדר',save:'שמירת מגבלות',error:'לא ניתן לשמור או לטעון',saved:'נשמר',notice:'ההזמנה תתבסס על התמונות שצורפו והצבעים שבהן. נאשר פרטים ומחיר ב-WhatsApp לפני הייצור. ההכנה אורכת שבוע עד שבועיים. החלפה או החזרה רק במקרה של פגם, שבר או אי התאמה למפרט שהוסכם.'}
}
const lang=()=>document.documentElement.lang||'ar'
export function CustomImageInput(){
 const [error,setError]=useState('')
 const changed=e=>{const files=[...e.target.files],invalid=files.length>3||files.some(f=>f.size>8*1024*1024||!['image/jpeg','image/png','image/webp'].includes(f.type)),message=invalid?(lang()==='ar'?'اختر حتى 3 صور JPEG/PNG/WebP، بحد أقصى 8 MiB لكل صورة.':lang()==='he'?'עד 3 תמונות JPEG/PNG/WebP, עד 8 MiB לכל תמונה.':'Select up to 3 JPEG/PNG/WebP images, maximum 8 MiB each.') : '';e.target.setCustomValidity(message);setError(message)}
 return <><input type="file" name="referenceImage" multiple accept="image/jpeg,image/png,image/webp" required onChange={changed}/>{error&&<small className="form-error" role="alert">{error}</small>}</>
}
export function CustomMeasurements(){
 const [limits,setLimits]=useState(null),[failed,setFailed]=useState(false),c=text[lang()]||text.ar
 useEffect(()=>{fetch('/api/settings/custom-orders').then(r=>{if(!r.ok)throw Error();return r.json()}).then(x=>setLimits(x.maxDimensions)).catch(()=>setFailed(true))},[])
 return <fieldset className="custom-measurements"><legend>{c.title}</legend>{failed&&<p role="alert">{c.error}</p>}{axes.map(k=><label key={k}>{c[k]}<small>{c.max}: {limits?.[k]??c.unset} {limits?.[k]!=null?'cm':''}</small><input type="number" name={k} min="0.01" max={limits?.[k]??10000} step="0.01" disabled={!limits}/></label>)}</fieldset>
}
export function CustomOrderNotice(){const c=text[lang()]||text.ar;return <aside className="product-terms-notice"><p>{c.notice}</p></aside>}
export function MeasurementSettings({token,language}){
 const c=text[language]||text.ar,[limits,setLimits]=useState(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{fetch('/api/settings/custom-orders').then(r=>{if(!r.ok)throw Error();return r.json()}).then(x=>setLimits(x.maxDimensions)).catch(()=>setMessage(c.error))},[])
 const save=async e=>{e.preventDefault();setBusy(true);setMessage('');try{const data=new FormData(e.currentTarget),maxDimensions=Object.fromEntries(axes.map(k=>[k,data.get(k)===''?null:Number(data.get(k))]));const r=await fetch('/api/admin/settings/custom-orders',{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({maxDimensions})});if(!r.ok)throw Error();setLimits(maxDimensions);setMessage(c.saved)}catch{setMessage(c.error)}finally{setBusy(false)}}
 return <section className="inventory-settings"><h2>{c.title} — {c.max}</h2>{limits&&<form onSubmit={save}><fieldset disabled={busy}>{axes.map(k=><label key={k}>{c[k]}<input name={k} type="number" min="0.01" max="10000" step="0.01" defaultValue={limits[k]??''} placeholder={c.unset}/></label>)}<button className="button primary">{c.save}</button></fieldset></form>}<p role="status">{message}</p></section>
}
export async function printReferenceImages(order,token){
 const paths=order.reference_images||[order.reference_image].filter(Boolean);if(!paths.length)return
 const root=document.createElement('div');root.id='print-order'
 const style=document.createElement('style');style.textContent='#print-order{display:none}@media print{@page{size:A4;margin:12mm}body>*:not(#print-order){display:none!important}#print-order{display:block!important}#print-order img{display:block;max-width:100%;max-height:250mm;object-fit:contain;break-after:page}#print-order img:last-child{break-after:auto}}';root.append(style)
 const cleanup=()=>{root.remove();window.removeEventListener('afterprint',cleanup)}
 try{for(const path of paths){const r=await fetch(path+'?format=json',{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw Error('image_unavailable');const {url}=await r.json();const img=document.createElement('img');img.src=url;root.append(img)}document.body.append(root);await Promise.all([...root.querySelectorAll('img')].map(x=>x.decode()));window.addEventListener('afterprint',cleanup,{once:true});window.print()}catch(e){cleanup();window.alert((text[lang()]||text.ar).error)}
}
