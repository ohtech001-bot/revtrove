import {useEffect,useState} from 'react'
import {ChevronDown} from 'lucide-react'
import {askConfirmation} from './lib/site-dialogs'
import {requiresColor} from '../../shared/product-configuration.mjs'
import {detailColorChoices,supportColor,uniqueColors} from '../../shared/color-choices.mjs'
import {availableColors} from '../../shared/color-library.mjs'
import './details.css'
import './bulk-colors.css'
import './product-detail-folds.css'
export default function ProductDetails({fields,options,setOptions,product,colors,setColors,token}){
 const [adding,setAdding]=useState(null),[draft,setDraft]=useState([]),[catalog,setCatalog]=useState(availableColors()),[error,setError]=useState('')
 const palette=colors||product.colors||[]
 useEffect(()=>{let active=true;fetch('/api/admin/colors',{headers:{Authorization:'Bearer '+token}}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(items=>{if(active)setCatalog(items)}).catch(()=>{if(active)setError('تعذر تحميل مكتبة الألوان. الألوان المسموحة للتفصيل تبقى متاحة.')});return()=>{active=false}},[token])
 const assign=(field)=>{
  const allowed=detailColorChoices(field,palette,catalog),old=options[field.key]||{}
  const current=(old.colors||[]).filter(c=>allowed.some(x=>x.hex.toLowerCase()===c.hex.toLowerCase()))
  const chosen=allowed.filter(c=>draft.includes(c.hex))
  if(!chosen.length)return
  setOptions({...options,[field.key]:{...old,defaultColor:null,colors:uniqueColors([...current,...chosen])}})
  setColors(current=>chosen.reduce((list,color)=>supportColor(list,color),current));setAdding(null);setDraft([])
 }
 return <section className="product-details-readonly">
  <h3>تفصيلات الفئة</h3>
  {!fields.length&&<small>لا توجد تفصيلات لهذه الفئة.</small>}
  {error&&<small>{error}</small>}
  {fields.map(field=>{
   const allowed=detailColorChoices(field,palette,catalog),selected=uniqueColors(options[field.key]?.colors||[]).filter(c=>allowed.some(x=>x.hex===c.hex)),available=allowed.filter(c=>!selected.some(x=>x.hex===c.hex))
   return <div className="product-detail-line" key={field.key}>
    {requiresColor(field)?<details className="product-detail-fold" onToggle={e=>{if(!e.currentTarget.open&&adding===field.key){setAdding(null);setDraft([])}}}>
     <summary><strong>{field.label_ar}</strong><span>{selected.length} ألوان مختارة<ChevronDown size={18}/></span></summary>
     <div className="product-detail-content">
      <div className="detail-color-tags">{selected.map(c=><button type="button" key={c.hex} title="إزالة اللون" onClick={async()=>{if(await askConfirmation('إزالة اللون من التفصيل؟ '+c.name_ar))setOptions({...options,[field.key]:{...options[field.key],defaultColor:null,colors:selected.filter(x=>x.hex!==c.hex)}})}}><i style={{background:c.hex}}/>{c.name_ar} ×</button>)}</div>
      {!selected.length&&<small>لم تُختر ألوان لهذا التفصيل في المنتج بعد.</small>}
      <button type="button" className="button outline" aria-expanded={adding===field.key} onClick={()=>{setAdding(adding===field.key?null:field.key);setDraft([])}}>{adding===field.key?'إغلاق قائمة الألوان':'إضافة ألوان'}</button>
      {adding===field.key&&<div className="bulk-color-picker">
       <div className="bulk-color-toolbar"><b>اختر أكثر من لون</b><button type="button" className="button outline" disabled={!available.length} onClick={()=>setDraft(available.map(c=>c.hex))}>تحديد الكل</button></div>
       <div className="bulk-color-options">{available.map(c=><label key={c.hex} className={draft.includes(c.hex)?'selected':''}><input type="checkbox" checked={draft.includes(c.hex)} onChange={e=>setDraft(ids=>e.target.checked?[...new Set([...ids,c.hex])]:ids.filter(h=>h!==c.hex))}/><i style={{background:c.hex}}/>{c.name_ar}</label>)}</div>
       {!available.length&&<small>{allowed.length?'كل الألوان المسموحة مضافة بالفعل.':'لم تحدد ألوانًا لهذا التفصيل بعد. أضف الألوان المسموحة من صفحة التفصيلات.'}</small>}
       <div className="bulk-color-actions"><button type="button" className="button primary" disabled={!draft.length} onClick={()=>assign(field)}>إضافة الألوان المختارة ({draft.length})</button><button type="button" className="button outline" onClick={()=>{setAdding(null);setDraft([])}}>إلغاء</button></div>
      </div>}
     </div>
    </details>:<strong>{field.label_ar}</strong>}
   </div>
  })}
  <small>افتح تفصيل اللون لعرض ألوانه أو إضافة عدة ألوان دفعة واحدة؛ تُحفظ عند حفظ المنتج. الاسم والنوع يُعدّلان من صفحة التفصيلات فقط.</small>
 </section>
}
