import {useEffect,useState} from 'react'
import {askConfirmation} from './lib/site-dialogs'
import {requiresColor} from '../../shared/product-configuration.mjs'
import {detailColorChoices,supportColor,uniqueColors} from '../../shared/color-choices.mjs'
import {availableColors} from '../../shared/color-library.mjs'
import './details.css'
export default function ProductDetails({fields,options,setOptions,product,colors,setColors,token}){
 const [adding,setAdding]=useState(null),[catalog,setCatalog]=useState(availableColors()),[error,setError]=useState('')
 const palette=colors||product.colors||[]
 useEffect(()=>{let active=true;fetch('/api/admin/colors',{headers:{Authorization:'Bearer '+token}}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(items=>{if(active)setCatalog(items)}).catch(()=>{if(active)setError('تعذر تحميل مكتبة الألوان. الألوان المسموحة للتفصيل تبقى متاحة.')});return()=>{active=false}},[token])
 const assign=(field,color)=>{
  const allowed=detailColorChoices(field,palette,catalog),old=options[field.key]||{}
  const current=(old.colors||[]).filter(c=>allowed.some(x=>x.hex.toLowerCase()===c.hex.toLowerCase()))
  setOptions({...options,[field.key]:{...old,defaultColor:null,colors:uniqueColors([...current,color])}})
  setColors(current=>supportColor(current,color));setAdding(null)
 }
 return <section className="product-details-readonly"><h3>تفصيلات الفئة</h3>{!fields.length&&<small>لا توجد تفصيلات لهذه الفئة.</small>}{error&&<small>{error}</small>}{fields.map(field=>{
  const allowed=detailColorChoices(field,palette,catalog),selected=uniqueColors(options[field.key]?.colors||[]).filter(c=>allowed.some(x=>x.hex===c.hex))
  return <div className="product-detail-line" key={field.key}><strong>{field.label_ar}</strong>{requiresColor(field)&&<><div className="detail-color-tags">{selected.map(c=><button type="button" key={c.hex} title="إزالة اللون" onClick={async()=>{if(await askConfirmation('إزالة اللون من التفصيل؟ '+c.name_ar))setOptions({...options,[field.key]:{...options[field.key],defaultColor:null,colors:selected.filter(x=>x.hex!==c.hex)}})}}><i style={{background:c.hex}}/>{c.name_ar} ×</button>)}</div><button type="button" className="button outline" onClick={()=>setAdding(adding===field.key?null:field.key)}>إضافة لون</button>{adding===field.key&&<select aria-label={'إضافة لون — '+field.label_ar} value="" onChange={e=>{const color=allowed.find(c=>c.hex===e.target.value);if(color)assign(field,color)}}><option value="">اختر لونًا</option>{allowed.filter(c=>!selected.some(x=>x.hex===c.hex)).map(c=><option value={c.hex} key={c.hex}>{c.name_ar}</option>)}</select>}{adding===field.key&&!allowed.length&&<small>لم تحدد ألوانًا لهذا التفصيل بعد. أضف الألوان المسموحة من صفحة التفصيلات.</small>}</>}</div>
 })}<small>اختيار لون هنا يربطه بهذا المنتج عند الحفظ. الاسم والنوع يُعدّلان من صفحة التفصيلات فقط.</small></section>
}
