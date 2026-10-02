export function uniqueColors(records=[]){
 const map=new Map()
 for(const c of records)if(c&&/^#[0-9a-f]{6}$/i.test(c.hex))map.set(c.hex.toLowerCase(),{...c,hex:c.hex.toLowerCase()})
 return [...map.values()]
}
export function detailColorChoices(field,productColors=[],catalog=[]){
 return uniqueColors(Array.isArray(field.allowed_colors)?field.allowed_colors:[...productColors,...catalog])
}
export const supportColor=(colors,color)=>uniqueColors([...colors,color])
