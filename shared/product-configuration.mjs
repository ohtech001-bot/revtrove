export const defaultPalette = [
  { id:'light-gray', hex:'#b9bcc2', ar:'رمادي فاتح', en:'Light gray', he:'אפור בהיר' }, { id:'dark-gray', hex:'#4b4f56', ar:'رمادي غامق', en:'Dark gray', he:'אפור כהה' },
  { id:'light-blue', hex:'#42a5e8', ar:'ازرق فاتح', en:'Light blue', he:'כחול בהיר' }, { id:'dark-blue', hex:'#174db8', ar:'ازرق غامق', en:'Dark blue', he:'כחול כהה' },
  { id:'red', hex:'#df2029', ar:'احمر', en:'Red', he:'אדום' }, { id:'yellow', hex:'#f6bd00', ar:'اصفر', en:'Yellow', he:'צהוב' },
  { id:'black', hex:'#101114', ar:'اسود', en:'Black', he:'שחור' }, { id:'white', hex:'#f4f4ef', ar:'ابيض', en:'White', he:'לבן' },
  { id:'orange', hex:'#f36f21', ar:'برتقالي', en:'Orange', he:'כתום' }, { id:'light-green', hex:'#78c850', ar:'اخضر فاتح', en:'Light green', he:'ירוק בהיר' },
]
const labels={rim:['لون الجنط','Rim color','צבע חישוק'],disc:['لون قرص الفرامل','Brake disc color','צבע דיסק'],caliper:['لون الكاليبر','Caliper color','צבע קליפר'],stand:['لون القاعدة','Stand color','צבע מעמד'],hub:['لون المركز','Hub color','צבע מרכז'],airFilter:['لون الفلتر','Filter color','צבע מסנן'],turboBody:['لون التيربو','Turbo color','צבע טורבו'],fan:['لون المروحة','Fan color','צבע מאוורר'],body:['لون المنتج','Product color','צבע מוצר']}
export function isAvailableDetail(field){
 if(field?.colorEnabled===false)return true
 const key=String(field?.key||'').toLowerCase().replace(/[-_\s]/g,'')
 const label=String(field?.label_ar||'').replace(/[\sـ]/g,'')
 return !['hub','hubcolor','center','centercolor','centre','centrecolor'].includes(key)&&label!=='لونالمركز'
}
export function configurationFields(category,product={}){
 const fields=Array.isArray(category?.customization_fields)?category.customization_fields:(product.customizable_parts||[]).map(key=>({key,label_ar:labels[key]?.[0]||key,label_en:labels[key]?.[1]||key,label_he:labels[key]?.[2]||key,textEnabled:['stand','caliper'].includes(key)}))
 if(Array.isArray(category?.detail_keys))return fields.filter(isAvailableDetail).map(f=>({...f}))
 const library=new Map((category?.library_fields||[]).map(f=>[f.key,f]))
 const inherited=library.size?splitConfigurationFields(fields).map(f=>library.has(f.key)?{...library.get(f.key),library_managed:true}:f):fields
 return inherited.filter(isAvailableDetail).filter(f=>f.library_managed||f.colorEnabled===false||!Array.isArray(product.enabled_color_fields)||product.enabled_color_fields.includes(f.key)).map(f=>f.library_managed?{...f}:{...f,...(product.field_labels?.[f.key]||{})})
}
export function fieldPalette(product,key,field){
 // Detail colors are candidates, not product assignments. Never infer support.
 const configured=product.field_options?.[key]?.colors
 if(!Array.isArray(configured))return []
 const allowed=Array.isArray(field?.allowed_colors)?field.allowed_colors:null
 return configured.filter(c=>!allowed||allowed.some(x=>x.hex.toLowerCase()===c.hex.toLowerCase()))
}
export const fieldName=(field,language)=>field?.['label_'+language]||field?.label_en||field?.key


export const requiresColor=field=>field.colorEnabled!==false
export function applyColorsToFields(fields,options,colors){
 const next={...options}
 for(const field of fields.filter(requiresColor)){const old=options[field.key]||{};next[field.key]={...old,colors:colors.map(c=>({...c})),defaultColor:colors.some(c=>c.hex===old.defaultColor)?old.defaultColor:null}}
 return next
}


export function splitConfigurationFields(fields){
 const keys=new Set(fields.map(f=>f.key))
 return fields.flatMap(field=>{
 if(!requiresColor(field)||!field.textEnabled)return [{...field,colorEnabled:requiresColor(field)}]
 const stem=field.key.slice(0,32);let key=stem+'Text',index=1;while(keys.has(key))key=stem+'Text'+index++;keys.add(key)
 const titles=field.key==='caliper'?['النص على الكاليبر','Text on caliper','טקסט על הקליפר']:field.key==='stand'?['النص على القاعدة','Text on stand','טקסט על המעמד']:[field.label_ar,field.label_en,field.label_he]
 return [{...field,colorEnabled:true,textEnabled:false},{key,label_ar:titles[0],label_en:titles[1],label_he:titles[2],colorEnabled:false,textEnabled:true,placeholder_ar:'أدخل النص المطلوب',placeholder_en:'Enter your text',placeholder_he:'הזן טקסט'}]
 })
}


