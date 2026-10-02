import {safeId,pageSize,toApi,guarded,FieldValue,nextId,decimal,repositoryError} from './common.js'
export function createProductRepository(db) {
  const products=db.collection('products')
  return {
    getById(id) {return guarded(async()=>{const snap=await products.doc(safeId(id)).get();return snap.exists ? toApi(snap.data()) : null})},
    getBySlug(slug) {return guarded(async()=>{const snap=await products.where('slug','==',slug).where('active','==',true).limit(1).get();return snap.empty ? null : toApi(snap.docs[0].data())})},
    listActive({limit=100,cursor}={}) {return guarded(async()=>{
      let q=products.where('active','==',true).orderBy('created_at','desc').orderBy('__name__').limit(pageSize(limit))
      if(cursor)q=q.startAfter(cursor.created_at,cursor.id)
      const snap=await q.get(),last=snap.docs.at(-1)
      return {items:snap.docs.map(d=>toApi(d.data())),cursor:last?{created_at:last.get('created_at'),id:last.id}:null}
    })},
    create(record,{prepare}={}) {return guarded(()=>db.runTransaction(async tx=>{
      const duplicate=await tx.get(products.where('slug','==',record.slug).limit(1))
      if(!duplicate.empty)throw repositoryError('write_conflict')
      const sequence=record.id==null?await nextId(tx,products,db):null
      const id=record.id ?? sequence.id,ref=products.doc(safeId(id))
      if((await tx.get(ref)).exists)throw repositoryError('write_conflict')
      if(prepare)await prepare(tx,ref.path)
      if(sequence)tx.set(sequence.ref,{value:id})
      tx.create(ref,{description_ar:null,description_en:null,description_he:null,active:true,...record,id,price:decimal(record.price),created_at:FieldValue.serverTimestamp(),updated_at:FieldValue.serverTimestamp()})
      return id
    }))},
    update(id,changes) {return guarded(()=>db.runTransaction(async tx=>{
      const allowed=['slug','name_ar','name_en','name_he','description_ar','description_en','description_he','category','price','images','model_parts','customizable_parts','active']
      if(Object.keys(changes).some(k=>!allowed.includes(k)))throw repositoryError('invalid_data')
      const ref=products.doc(safeId(id)),snap=await tx.get(ref)
      if(!snap.exists)throw repositoryError('not_found')
      if(changes.slug){const duplicates=await tx.get(products.where('slug','==',changes.slug).limit(2));if(duplicates.docs.some(d=>d.id!==ref.id))throw repositoryError('write_conflict')}
      tx.update(ref,{...changes,...('price' in changes?{price:decimal(changes.price)}:{}),updated_at:FieldValue.serverTimestamp()})
    }))},
    delete(id) {return guarded(()=>db.runTransaction(async tx=>{const ref=products.doc(safeId(id));if(!(await tx.get(ref)).exists)throw repositoryError('not_found');tx.delete(ref)}))},
  }
}
