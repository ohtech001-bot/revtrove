export const defaultPalette = [
  { id:'light-gray', hex:'#b9bcc2', ar:'رمادي فاتح', en:'Light gray', he:'אפור בהיר' }, { id:'dark-gray', hex:'#4b4f56', ar:'رمادي غامق', en:'Dark gray', he:'אפור כהה' },
  { id:'light-blue', hex:'#42a5e8', ar:'ازرق فاتح', en:'Light blue', he:'כחול בהיר' }, { id:'dark-blue', hex:'#174db8', ar:'ازرق غامق', en:'Dark blue', he:'כחול כהה' },
  { id:'red', hex:'#df2029', ar:'احمر', en:'Red', he:'אדום' }, { id:'yellow', hex:'#f6bd00', ar:'اصفر', en:'Yellow', he:'צהוב' },
  { id:'black', hex:'#101114', ar:'اسود', en:'Black', he:'שחור' }, { id:'white', hex:'#f4f4ef', ar:'ابيض', en:'White', he:'לבן' },
  { id:'orange', hex:'#f36f21', ar:'برتقالي', en:'Orange', he:'כתום' }, { id:'light-green', hex:'#78c850', ar:'اخضر فاتح', en:'Light green', he:'ירוק בהיר' },
]
const labels={rim:['لون الجنط','Rim color','צבע חישוק'],disc:['لون قرص الفرامل','Brake disc color','צבע דיסק'],caliper:['لون الكاليبر','Caliper color','צבע קליפר'],stand:['لون القاعدة','Stand color','צבע מעמד'],hub:['لون المركز','Hub color','צבע מרכז'],airFilter:['لون الفلتر','Filter color','צבע מסנן'],turboBody:['لون التيربو','Turbo color','צבע טורבו'],fan:['لون المروحة','Fan color','צבע מאוורר'],body:['لون المنتج','Product color','צבע מוצר']}
export function configurationFields(category,product={}){
 if(Array.isArray(category?.customization_fields))return category.customization_fields
 return (product.customizable_parts||[]).map(key=>({key,label_ar:labels[key]?.[0]||key,label_en:labels[key]?.[1]||key,label_he:labels[key]?.[2]||key,textEnabled:['stand','caliper'].includes(key)}))
}
export function fieldPalette(product,key){
 const configured=product.field_options?.[key]?.colors
 if(configured?.length)return configured
 if(product.colors?.length)return product.colors
 return defaultPalette.map(c=>({hex:c.hex,name_ar:c.ar,name_en:c.en,name_he:c.he}))
}
export const fieldName=(field,language)=>field?.['label_'+language]||field?.label_en||field?.key


export const requiresColor=field=>field.colorEnabled!==false
export function applyColorsToFields(fields,options,colors){
 const next={...options}
 for(const field of fields.filter(requiresColor)){const old=options[field.key]||{};next[field.key]={...old,colors:colors.map(c=>({...c})),defaultColor:colors.some(c=>c.hex===old.defaultColor)?old.defaultColor:null}}
 return next
}

