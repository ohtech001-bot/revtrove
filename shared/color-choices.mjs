export function uniqueColors(records=[]){
 const map=new Map()
 for(const c of records)if(c&&/^#[0-9a-f]{6}$/i.test(c.hex))map.set(c.hex.toLowerCase(),{...c,hex:c.hex.toLowerCase()})
 return [...map.values()]
}
export function detailColorChoices(field,productColors=[],catalog=[]){
 return uniqueColors(Array.isArray(field.allowed_colors)?field.allowed_colors:[...productColors,...catalog])
}
export const supportColor=(colors,color)=>uniqueColors([...colors,color])

export const colorNameKey=color=>String(color?.name_ar||color?.name_en||'').normalize('NFKC').toLowerCase().replace(/[\u064B-\u065F\u0670ـ]/g,'').replace(/[أإآ]/g,'ا').replace(/\s+/g,' ').trim()
export function visibleColors(records=[]){
 const unique=uniqueColors(records),seen=new Set(),result=[]
 // Saved/product definitions come after presets and take precedence.
 for(const color of unique.reverse()){const key=colorNameKey(color)||color.hex;if(!seen.has(key)){seen.add(key);result.push(color)}}
 return result.reverse()
}

