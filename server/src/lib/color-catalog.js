import {availableColors} from '../../../shared/color-library.mjs'
import {visibleColors} from '../../../shared/color-choices.mjs'

export async function readColorCatalog(db){
 // One persistent source of truth. Product and detail references never invent catalog entries.
 const saved=await db.collection('colorLibrary').limit(501).get()
 if(saved.size>500)throw Object.assign(Error('color_catalog_limit'),{code:'invalid_data'})
 const blocked=new Set(saved.docs.filter(d=>d.get('deleted')).map(d=>d.id.toLowerCase()))
 const all=availableColors(saved.docs.filter(d=>!d.get('deleted')).map(d=>d.get('color')))
 return {all,colors:visibleColors(all),blocked}
}
