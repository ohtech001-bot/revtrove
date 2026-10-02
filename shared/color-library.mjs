import {defaultPalette} from './product-configuration.mjs'
// Reference swatches are templates only; never inject them into the live catalog.
export const catalogColors=defaultPalette.map(c=>({hex:c.hex,name_ar:c.ar,name_en:c.en,name_he:c.he}))
export function availableColors(saved=[]){
 const colors=new Map()
 for(const color of saved)if(color&&typeof color.hex==='string')colors.set(color.hex.toLowerCase(),{...color,hex:color.hex.toLowerCase()})
 return [...colors.values()]
}

