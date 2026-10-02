import {safeId,pageSize,toApi,guarded,FieldValue,nextId,decimal,repositoryError} from './common.js'
export function createProductRepository(db) {
  const products=db.collection('products')
  return {
    listAll({limit=500,cursor}={}) {return guarded(async()=>{let q=products.orderBy('id').limit(pageSize(limit));if(cursor!=null)q=q.startAfter(cursor);const snap=await q.get();return {items:snap.docs.map(d=>toApi(d.data())),cursor:snap.docs.at(-1)?.get('id')}})},
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
      const category=await tx.get(db.collection('categories').doc(safeId(record.category==='wheels'?'wheel':record.category||'wheel')))
      if(category.get('deleted'))throw repositoryError('invalid_data')
      if(prepare)await prepare(tx,ref.path)
      if(sequence)tx.set(sequence.ref,{value:id})
      tx.delete(db.collection('catalogExclusions').doc(safeId(record.slug)))
      tx.create(ref,{description_ar:null,description_en:null,description_he:null,active:true,...record,id,price:decimal(record.price),created_at:FieldValue.serverTimestamp(),updated_at:FieldValue.serverTimestamp()})
      return id
    }))},
    update(id,changes,{prepare}={}) {return guarded(()=>db.runTransaction(async tx=>{
      const allowed=['slug','name_ar','name_en','name_he','description_ar','description_en','description_he','category','price','images','model_parts','customizable_parts','active','dimensions','colors']
      if(Object.keys(changes).some(k=>!allowed.includes(k)))throw repositoryError('invalid_data')
      const ref=products.doc(safeId(id)),snap=await tx.get(ref)
      if(!snap.exists)throw repositoryError('not_found')
      if(changes.slug){const duplicates=await tx.get(products.where('slug','==',changes.slug).limit(2));if(duplicates.docs.some(d=>d.id!==ref.id))throw repositoryError('write_conflict')}
      if(changes.category){const category=await tx.get(db.collection('categories').doc(safeId(changes.category)));if(category.get('deleted'))throw repositoryError('invalid_data')}
      if(prepare)await prepare(tx,ref.path,snap.data())
      tx.update(ref,{...changes,...('price' in changes?{price:decimal(changes.price)}:{}),updated_at:FieldValue.serverTimestamp()})
    }))},
    delete(id) {return guarded(()=>db.runTransaction(async tx=>{const ref=products.doc(safeId(id)),snap=await tx.get(ref);if(!snap.exists)throw repositoryError('not_found');tx.set(db.collection('catalogExclusions').doc(safeId(snap.get('slug'))),{slug:snap.get('slug'),deleted_at:FieldValue.serverTimestamp()});tx.delete(ref)}))},
  }
}
