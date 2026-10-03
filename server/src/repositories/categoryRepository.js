import {safeId,guarded,toApi,FieldValue,repositoryError} from './common.js'
import {categoryId} from '../../../shared/catalog-categories.mjs'
export function createCategoryRepository(db){
 const categories=db.collection('categories')
 async function resolve(records){
  if(!records.length)return []
  const snap=await db.collection('detailLibrary').limit(500).get()
  const details=new Map(snap.docs.filter(d=>!d.get('deleted')).map(d=>[d.id,toApi(d.data())]))
  return records.map(category=>Array.isArray(category.detail_keys)?{...category,customization_fields:category.detail_keys.filter(key=>details.has(key)).map(key=>({...details.get(key),key,library_managed:true}))}:category)
 }
 async function list(){const snap=await categories.limit(500).get();return resolve(snap.docs.filter(d=>!d.get('deleted')).map(d=>({...toApi(d.data()),id:d.id})))}
 return {
  list:()=>guarded(list),
  getById:id=>guarded(async()=>{const snap=await categories.doc(safeId(categoryId(id))).get();return snap.exists&&!snap.get('deleted')?(await resolve([{...toApi(snap.data()),id:snap.id}]))[0]:null}),
  create:record=>guarded(async()=>{const ref=categories.doc(safeId(record.id));await db.runTransaction(async tx=>{if((await tx.get(ref)).exists)throw repositoryError('write_conflict');tx.create(ref,{...record,created_at:FieldValue.serverTimestamp(),updated_at:FieldValue.serverTimestamp()})});return record.id}),
  update:(id,record)=>guarded(async()=>{const ref=categories.doc(safeId(categoryId(id)));await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists||snap.get('deleted'))throw repositoryError('not_found');tx.update(ref,{...record,id:ref.id,updated_at:FieldValue.serverTimestamp()})})}),
  delete:id=>guarded(async()=>{id=categoryId(id);await db.runTransaction(async tx=>{const ref=categories.doc(safeId(id)),snap=await tx.get(ref);if(!snap.exists||snap.get('deleted'))throw repositoryError('not_found');const linked=await tx.get(db.collection('products').where('category','in',id==='wheel'?['wheel','wheels']:[id]).limit(1));if(!linked.empty)throw repositoryError('write_conflict');tx.update(ref,{deleted:true,updated_at:FieldValue.serverTimestamp()})})})
 }
}
