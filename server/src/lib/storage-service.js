import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto'
import {configuredBlob} from './blob-provider.js'
import {Timestamp} from 'firebase-admin/firestore'

export const limits={reference:8*1024*1024,productImage:30*1024*1024,productModel:30*1024*1024}
const imageTypes={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}
const fail=code=>{throw Object.assign(new Error(code),{code})}
const digest=value=>createHash('sha256').update(String(value)).digest('hex')
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b))
export function validateUpload({kind,name,contentType,size}) {
  if(!limits[kind]||typeof name!=='string'||name.length>190||!Number.isInteger(size)||size<1||size>limits[kind])fail('invalid_upload')
  const extension=kind==='productModel'?'glb':imageTypes[contentType]
  if(!extension || (kind==='productModel' && (!/\.glb$/i.test(name)||!['model/gltf-binary','application/octet-stream'].includes(contentType))))fail('invalid_upload')
  return {kind,name,contentType:kind==='productModel'?'model/gltf-binary':contentType,size,extension}
}
export function validHeader(buffer,type,totalSize) {
  if(type==='image/png')return buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  if(type==='image/jpeg')return buffer[0]===255&&buffer[1]===216&&buffer[2]===255
  if(type==='image/webp')return buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP'
  return buffer.length>=12&&buffer.toString('ascii',0,4)==='glTF'&&buffer.readUInt32LE(4)===2&&buffer.readUInt32LE(8)===totalSize
}
export function createStorageService(db,{blobProvider=configuredBlob,now=()=>Date.now()}={}) {
  const assets=db.collection('uploadAssets')
  const ref=id=>{if(!/^[a-f0-9-]{36}$/.test(String(id)))fail('invalid_upload');return assets.doc(id)}
  async function owned(id,token,adminId) {
    const snap=await ref(id).get();if(!snap.exists)fail('not_found')
    const data=snap.data()
    if(!same(data.tokenHash,digest(token))||(data.adminId!=null&&String(adminId)!==data.adminId))fail('upload_forbidden')
    return data
  }
  function metadataMatches(metadata,data) {
    let url;try{url=new URL(metadata.url)}catch{fail('storage_configuration')}
    if(url.protocol!=='https:'||!url.hostname.endsWith('.private.blob.vercel-storage.com'))fail('storage_configuration')
    if(metadata.pathname!==data.path||metadata.size!==data.size||metadata.contentType!==data.contentType||!metadata.etag)fail('invalid_upload')
  }
  function providerFor(data) {if(data.provider!=='vercel-blob')fail('storage_configuration');return blobProvider()}
  return {
    async purgeOrderFiles(target) {
      if(!/^orders\/[^/]+$/.test(target))fail('upload_conflict')
      const snap=await assets.where('attachedTo','==',target).get()
      for(const doc of snap.docs){const data=doc.data();if(data.kind!=='reference'||data.path!=='assets/'+doc.id+'/file.'+data.extension||data.storagePath!==data.path)fail('upload_conflict')
        const url='/api/files/'+doc.id
        const [primary,additional,products]=await Promise.all([db.collection('orders').where('reference_image','==',url).get(),db.collection('orders').where('reference_images','array-contains',url).get(),db.collection('products').where('images','array-contains',url).limit(1).get()])
        const shared=[...primary.docs,...additional.docs].find(x=>x.ref.path!==target)
        if(shared){await doc.ref.update({attachedTo:shared.ref.path,status:'attached'});continue}
        if(!products.empty)continue
        await db.runTransaction(async tx=>{const current=await tx.get(doc.ref),order=await tx.get(db.doc(target));if(current.get('attachedTo')!==target||order.get('status')!=='archived')fail('upload_conflict');tx.update(doc.ref,{status:'deleting'})})
        const blob=providerFor(data);try{const metadata=await blob.head(data.path);if(metadata.pathname!==data.path||metadata.etag!==data.etag)fail('upload_conflict');await blob.remove(data.path,metadata.etag)}catch(error){if(error.code!=='not_found')throw error};await doc.ref.delete()
      }
    },
    async start(input,{adminId,ip='unknown'}={}) {
      const data=validateUpload(input)
      if(data.kind!=='reference'&&!adminId)fail('upload_forbidden')
      const blob=blobProvider() // Fail before metadata writes if no server-only credential.
      const id=randomUUID(),token=randomBytes(32).toString('hex'),path='assets/'+id+'/file.'+data.extension
      const expires=now()+10*60*1000
      const url=await blob.uploadUrl(path,data.contentType,data.size,expires)
      // A durable per-caller hourly quota supplements process-local Express rate limits.
      const quota=db.collection('uploadQuotas').doc(digest((process.env.JWT_SECRET||'')+ip+Math.floor(now()/3600000)))
      await db.runTransaction(async tx=>{
        const existing=await tx.get(quota),count=existing.data()?.count||0
        if(count>=30)fail('upload_rate_limited')
        tx.set(quota,{count:count+1,expiresAt:Timestamp.fromMillis(now()+7200000)})
        tx.create(ref(id),{...data,path,provider:'vercel-blob',access:'private',tokenHash:digest(token),adminId:adminId?String(adminId):null,status:'pending',createdAt:Timestamp.fromMillis(now()),expiresAt:Timestamp.fromMillis(expires),attachedTo:null})
      })
      return {id,token,url,method:'PUT',headers:{'Content-Type':data.contentType,'x-vercel-blob-access':'private'},expiresAt:new Date(expires).toISOString()}
    },
    async finish(id,token,adminId) {
      const data=await owned(id,token,adminId)
      if(['ready','attached'].includes(data.status))return {id,url:'/api/files/'+id}
      if(data.status!=='pending'||data.expiresAt.toMillis()<now())fail('upload_conflict')
      const blob=providerFor(data),metadata=await blob.head(data.path)
      metadataMatches(metadata,data)
      const header=await blob.header(data.path)
      if(!validHeader(header,data.contentType,data.size))fail('invalid_upload')
      // Blob upload URLs forbid overwrites; no copy or server-side file buffering needed.
      await db.runTransaction(async tx=>{
        const latest=await tx.get(ref(id))
        if(['ready','attached'].includes(latest.get('status'))&&latest.get('etag')===metadata.etag)return
        if(latest.data()?.status!=='pending')fail('upload_conflict')
        tx.update(ref(id),{status:'ready',storagePath:metadata.pathname,blobUrl:metadata.url,etag:metadata.etag,readyAt:Timestamp.fromMillis(now())})
      })
      return {id,url:'/api/files/'+id}
    },
    async attach(tx,files,target,adminId) {
      const snapshots=[]
      for(const file of files) {
        const snap=await tx.get(ref(file.id));const data=snap.data()
        if(!snap.exists||data.status!=='ready'||data.kind!==file.kind||!same(data.tokenHash,digest(file.token))||(data.adminId!=null&&String(adminId)!==data.adminId))fail('upload_forbidden')
        snapshots.push(snap)
      }
      for(const snap of snapshots)tx.update(ref(snap.id),{status:'attached',attachedTo:target})
    },
    async download(id,adminId) {
      const snap=await ref(id).get();if(!snap.exists)fail('not_found')
      const data=snap.data();if(data.status!=='attached')fail('upload_forbidden')
      if(data.kind==='reference'&&!adminId)fail('upload_forbidden')
      const target=await db.doc(data.attachedTo).get();if(!target.exists)fail('not_found')
      if(data.kind!=='reference'&&!target.get('active'))fail('not_found')
      const url='/api/files/'+id,record=target.data()
      if(!(record.reference_image===url||record.reference_images?.includes(url)||record.images?.includes(url)||Object.values(record.model_parts||{}).includes(url)))fail('not_found')
      return providerFor(data).readUrl(data.storagePath,now()+5*60*1000)
    },
    async preview(id,token,adminId) {
      const data=await owned(id,token,adminId)
      if(!['ready','attached'].includes(data.status))fail('upload_conflict')
      const url=await providerFor(data).readUrl(data.storagePath,now()+5*60*1000)
      return {url}
    },
    async remove(id,token,adminId) {
      const data=await owned(id,token,adminId)
      // Attached objects are retained, even when a product is removed: never delete shared files.
      if(data.attachedTo||!['pending','ready','deleting'].includes(data.status))fail('upload_conflict')
      const blob=providerFor(data)
      await db.runTransaction(async tx=>{const snap=await tx.get(ref(id));if(snap.get('attachedTo')||!['pending','ready','deleting'].includes(snap.get('status')))fail('upload_conflict');tx.update(ref(id),{status:'deleting'})})
      // Only a server-generated asset path is eligible; no arbitrary URL is accepted.
      if(data.path!=='assets/'+id+'/file.'+data.extension||data.storagePath&&data.storagePath!==data.path)fail('upload_conflict')
      try{const metadata=await blob.head(data.path);if(metadata.pathname!==data.path||data.etag&&metadata.etag!==data.etag)fail('upload_conflict');await blob.remove(data.path,metadata.etag)}catch(error){if(error.code!=='not_found')throw error}
      await ref(id).delete()
      return {ok:true}
    },
  }
}
