import {uniqueColors} from '../../../shared/color-choices.mjs'
import {FieldValue} from 'firebase-admin/firestore'

export function restorationPlan({products=[],details=[],categories=[],library=[]}){
 const stored=new Map(library.map(d=>[d.id,d]))
 const candidates=uniqueColors([
  ...products.flatMap(p=>[...(p.colors||[]),...Object.values(p.field_options||{}).flatMap(f=>f.colors||[])]),
  ...categories.flatMap(c=>(c.customization_fields||[]).flatMap(f=>f.allowed_colors||[])),
  ...details.flatMap(f=>f.allowed_colors||[])
 ])
 const missing=candidates.filter(c=>!stored.has(c.hex.slice(1)))
 const invalid=missing.filter(c=>['name_ar','name_en','name_he'].some(k=>!c[k]?.trim()))
 if(invalid.length)throw Error('color_labels_missing:'+invalid.map(c=>c.hex).join(','))
 return {create:missing,skipped:candidates.length-missing.length}
}

export async function restoreColorLibrary(db,{apply=false}={}){
 const names=['products','detailLibrary','categories','colorLibrary']
 const snapshots=await Promise.all(names.map(name=>db.collection(name).get()))
 const rows=snap=>snap.docs.map(d=>({...d.data(),id:d.id}))
 const plan=restorationPlan({products:rows(snapshots[0]),details:rows(snapshots[1]),categories:rows(snapshots[2]),library:rows(snapshots[3])})
 let created=0
 if(apply){
  // Read all target documents before any write; create-only protects concurrent edits.
  for(let i=0;i<plan.create.length;i+=200){
   const batch=plan.create.slice(i,i+200)
   created+=await db.runTransaction(async tx=>{
    const entries=[]
    for(const color of batch){const ref=db.collection('colorLibrary').doc(color.hex.slice(1)),snap=await tx.get(ref);if(!snap.exists)entries.push({ref,color})}
    for(const {ref,color} of entries)tx.create(ref,{color,deleted:false,restored_from:'existing_color_references',created_at:FieldValue.serverTimestamp(),updated_at:FieldValue.serverTimestamp()})
    return entries.length
   })
  }
 }
 return {planned:plan.create.length,created,skipped:plan.skipped,colors:plan.create}
}
