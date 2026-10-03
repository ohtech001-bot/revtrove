export function uniqueColors(records=[]){
 const map=new Map()
 for(const c of records)if(c&&/^#[0-9a-f]{6}$/i.test(c.hex))map.set(c.hex.toLowerCase(),{...c,hex:c.hex.toLowerCase()})
 return [...map.values()]
}
export function detailColorChoices(field,productColors=[],catalog=null){
 const choices=uniqueColors(Array.isArray(field.allowed_colors)?field.allowed_colors:catalog||productColors)
 if(!Array.isArray(catalog))return choices
 const created=new Map(uniqueColors(catalog).map(c=>[c.hex,c]))
 return choices.filter(c=>created.has(c.hex)).map(c=>created.get(c.hex))
}
export const supportColor=(colors,color)=>uniqueColors([...colors,color])

export const colorNameKey=color=>String(color?.name_ar||color?.name_en||'').normalize('NFKC').toLowerCase().replace(/[\u064B-\u065F\u0670ـ]/g,'').replace(/[أإآ]/g,'ا').replace(/\s+/g,' ').trim()
export function visibleColors(records=[]){
 const unique=uniqueColors(records),seen=new Set(),result=[]
 // Saved/product definitions come after presets and take precedence.
 for(const color of unique.reverse()){const key=colorNameKey(color)||color.hex;if(!seen.has(key)){seen.add(key);result.push(color)}}
 return result.reverse()
}



export function sameCatalogColor(first,second){
 const a=String(first?.hex||'').toLowerCase(),b=String(second?.hex||'').toLowerCase()
 if(a&&a===b)return true
 const name=colorNameKey(first)
 return Boolean(name&&name===colorNameKey(second))
}
export function unassignedDetailColors(allowed=[],selected=[]){
 // Use the same name grouping as the Colors page, scoped to this detail only.
 return visibleColors(allowed).filter(color=>!selected.some(existing=>sameCatalogColor(color,existing)))
}

