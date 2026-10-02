import {safeId,pageSize,toApi,guarded,FieldValue,nextId,decimal,repositoryError} from './common.js'
const statuses=['new','contacted','quoted','in_production','ready','awaiting_pickup','archived','completed','cancelled']
function searchPattern(search) {
  // Preserve the previous parameterized SQL LIKE %term% wildcard semantics.
  const pattern=[{wildcard:'%'}]
  for(let i=0;i<search.length;i++) {
    const char=search[i]
    if(char==='\\' && i+1<search.length)pattern.push({literal:search[++i].toLocaleLowerCase()})
    else pattern.push(char==='%'||char==='_'?{wildcard:char}:{literal:char.toLocaleLowerCase()})
  }
  pattern.push({wildcard:'%'})
  // Dynamic programming avoids regex backtracking for untrusted wildcard inputs.
  return {test(value) {
    const text=Array.from(value.toLocaleLowerCase())
    let previous=Array(text.length+1).fill(false);previous[0]=true
    for(const token of pattern) {
      const current=Array(text.length+1).fill(false)
      if(token.wildcard==='%')current[0]=previous[0]
      for(let i=1;i<=text.length;i++)current[i]=token.wildcard==='%'?(previous[i]||current[i-1]):previous[i-1]&&(token.wildcard==='_'||token.literal===text[i-1])
      previous=current
    }
    return previous[text.length]
  }}
}
export function createOrderRepository(db) {
  const orders=db.collection('orders')
  return {
    getByPublicId(id) {return guarded(async()=>{const snap=await orders.doc(safeId(id)).get();return snap.exists?toApi(snap.data()):null})},
    list({status,limit=500,search}={}) {return guarded(async()=>{
      const size=pageSize(limit)
      if(status && status!=='all' && !statuses.includes(status))return {items:[]}
      let q=status && status!=='all'?orders.where('status','==',status):orders.where('status','in',statuses.filter(s=>s!=='archived'))
      q=q.orderBy('created_at','desc').orderBy('__name__').limit(size)
      const items=[];let cursor
      // Firestore has no LIKE: filter bounded status-specific pages before applying the 500-match limit.
      const term=search?searchPattern(search):null
      do {
        const snap=await (cursor?q.startAfter(cursor):q).get()
        for(const doc of snap.docs){const item=toApi(doc.data());if(!term||[item.public_id,item.customer_name,item.phone].some(v=>term.test(String(v))))items.push(item);if(items.length===size)break}
        cursor=snap.docs.at(-1)
        if(!term||snap.size<size)break
      }while(cursor && items.length<size)
      return {items}
    })},
    create(record,{prepare,includeDisplayId=false}={}) {return guarded(()=>db.runTransaction(async tx=>{
      const ref=orders.doc(safeId(record.public_id))
      if((await tx.get(ref)).exists)throw repositoryError('write_conflict')
      const sequence=record.id==null?await nextId(tx,orders,db):null
      const id=record.id ?? sequence.id
      if(prepare)await prepare(tx,ref.path)
      if(sequence)tx.set(sequence.ref,{value:id})
      tx.create(ref,{reference_image:null,production_eta:null,status:'new',...record,id,quoted_price:decimal(record.quoted_price),created_at:FieldValue.serverTimestamp(),updated_at:FieldValue.serverTimestamp()})
      return includeDisplayId?{id:ref.id,displayId:'ord'+id}:ref.id
    }))},
    async purgeArchived({storageService,now=Date.now()}={}) {
      const cutoff=now-60*86400000;let removed=0,cursor
      do{let q=orders.where('status','==','archived').orderBy('__name__').limit(100);if(cursor)q=q.startAfter(cursor);const snap=await q.get();for(const doc of snap.docs){
        const locked=await db.runTransaction(async tx=>{const current=await tx.get(doc.ref),data=current.data();if(!data||data.status!=='archived')return false;const date=data.archived_at||data.updated_at,time=date?.toMillis?date.toMillis():Date.parse(date);if(!Number.isFinite(time)||time>cutoff)return false;tx.update(doc.ref,{purging:true});return true});if(!locked)continue
        await storageService.purgeOrderFiles(doc.ref.path);await doc.ref.delete();removed++
      }cursor=snap.docs.at(-1);if(snap.size<100)break}while(cursor);return {removed}
    },
    update(id,changes) {return guarded(async()=>{
      const allowed=['status','quoted_price','production_eta']
      if(Object.keys(changes).some(key=>!allowed.includes(key)) || (changes.status && !statuses.includes(changes.status)))throw repositoryError('invalid_data')
      const ref=orders.doc(safeId(id));await db.runTransaction(async tx=>{const current=await tx.get(ref);if(!current.exists)throw repositoryError('not_found');if(current.get('purging'))throw repositoryError('write_conflict');tx.update(ref,{...changes,...('quoted_price' in changes?{quoted_price:decimal(changes.quoted_price)}:{}),...(changes.status==='archived'&&current.get('status')!=='archived'?{archived_at:FieldValue.serverTimestamp()}:changes.status&&changes.status!=='archived'?{archived_at:null}:{}),updated_at:FieldValue.serverTimestamp()})})
    })},
  }
}
