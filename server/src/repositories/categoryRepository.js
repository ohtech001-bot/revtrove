import {safeId,guarded,toApi,FieldValue,repositoryError} from './common.js'
import {defaultCategories,categoryId} from '../../../shared/catalog-categories.mjs'
import {catalogAdditions} from '../../../shared/catalog-additions.mjs'
export function createCategoryRepository(db) {
  const categories=db.collection('categories')
  async function list() {
    const [saved,products]=await Promise.all([categories.limit(500).get(),db.collection('products').orderBy('id').limit(500).get()])
    const items=new Map(defaultCategories.map(item=>[item.id,{...item}]))
    for(const doc of products.docs){const id=categoryId(doc.get('category'));if(!items.has(id))items.set(id,{id,name_ar:id,name_en:id,name_he:id})}
    for(const doc of saved.docs){if(doc.get('deleted'))items.delete(doc.id);else items.set(doc.id,{...toApi(doc.data()),id:doc.id})}
    return [...items.values()]
  }
  return {
    list:()=>guarded(list),
    getById:id=>guarded(async()=>(await list()).find(c=>c.id===categoryId(id))||null),
    create:record=>guarded(async()=>{if((await list()).some(c=>c.id===record.id))throw repositoryError('write_conflict');await categories.doc(safeId(record.id)).create({...record,created_at:FieldValue.serverTimestamp(),updated_at:FieldValue.serverTimestamp()});return record.id}),
    delete:id=>guarded(async()=>{
      id=categoryId(id);if(!(await list()).some(c=>c.id===id))throw repositoryError('not_found')
      return db.runTransaction(async tx=>{const ref=categories.doc(safeId(id)),current=await tx.get(ref);if(current.get('deleted'))throw repositoryError('not_found');const linked=await tx.get(db.collection('products').where('category','in',id==='wheel'?['wheel','wheels']: [id]).limit(1));const exclusions=await tx.get(db.collection('catalogExclusions').limit(500));const excluded=new Set(exclusions.docs.map(d=>d.id));if(!linked.empty||catalogAdditions.some(p=>categoryId(p.category)===id&&!excluded.has(p.slug)))throw repositoryError('write_conflict');tx.set(ref,{...(current.data()||{}),id,deleted:true,updated_at:FieldValue.serverTimestamp()})})
    }),
    update:(id,record)=>guarded(async()=>{id=categoryId(id);if(!(await list()).some(c=>c.id===id))throw repositoryError('not_found');await db.runTransaction(async tx=>{const ref=categories.doc(safeId(id)),snap=await tx.get(ref);const fields={...record,id,updated_at:FieldValue.serverTimestamp()};if(snap.exists)tx.update(ref,fields);else tx.create(ref,{...fields,created_at:FieldValue.serverTimestamp()})})}),
  }
}
