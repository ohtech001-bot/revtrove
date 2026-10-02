import {availableColors} from '../../../shared/color-library.mjs'
import {visibleColors} from '../../../shared/color-choices.mjs'
export async function readColorCatalog(db){
 const [saved,products]=await Promise.all([db.collection('colorLibrary').limit(501).get(),db.collection('products').limit(501).get()])
 const blocked=new Set(saved.docs.filter(d=>d.get('deleted')).map(d=>d.id.toLowerCase()))
 const all=availableColors([...products.docs.flatMap(d=>d.get('colors')||[]),...saved.docs.filter(d=>!d.get('deleted')).map(d=>d.get('color'))]).filter(c=>!blocked.has(c.hex.slice(1)))
 return {all,colors:visibleColors(all),blocked}
}
