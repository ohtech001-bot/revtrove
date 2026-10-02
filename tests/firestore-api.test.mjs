import test from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import {Timestamp} from 'firebase-admin/firestore'
import {createApp} from '../server/src/index.js'
import {createProductRepository} from '../server/src/repositories/productRepository.js'
import {createOrderRepository} from '../server/src/repositories/orderRepository.js'
import {createAdminRepository} from '../server/src/repositories/adminRepository.js'
import {guarded,decimal} from '../server/src/repositories/common.js'
import {readFile} from 'node:fs/promises'
import {createStorageService,validateUpload,validHeader} from '../server/src/lib/storage-service.js'
import {receiptMarkup,printCss} from '../client/src/lib/order-print.js'
import {configuredBlob} from '../server/src/lib/blob-provider.js'
import {createCategoryRepository} from '../server/src/repositories/categoryRepository.js'

function memoryDb() {
  const records=new Map();let lock=Promise.resolve()
  const stamp=value=>Object.fromEntries(Object.entries(value).map(([k,v])=>[k,v?.constructor?.name==='ServerTimestampTransform'?Timestamp.now():v]))
  function doc(path) {
    const snapshot=()=>({id:path.split('/').at(-1),exists:records.has(path),data:()=>records.get(path),get:k=>records.get(path)?.[k]})
    return {path,id:path.split('/').at(-1),get:async()=>snapshot(),set:async data=>records.set(path,stamp(data)),create:async data=>{if(records.has(path))throw {code:6};records.set(path,stamp(data))},update:async data=>{if(!records.has(path))throw {code:5};records.set(path,{...records.get(path),...stamp(data)})},delete:async()=>records.delete(path)}
  }
  function collection(name,filters=[],sorts=[],size=Infinity,after=null) {
    const api={id:name,doc:id=>doc(name+'/'+id),where:(...f)=>collection(name,[...filters,f],sorts,size,after),orderBy:(key,direction='asc')=>collection(name,filters,[...sorts,[key,direction]],size,after),limit:n=>collection(name,filters,sorts,n,after),startAfter:(...v)=>collection(name,filters,sorts,size,v),
      async get() {
        let docs=[...records.keys()].filter(k=>k.startsWith(name+'/')).map(k=>({id:k.split('/').at(-1),ref:doc(k),data:()=>records.get(k),get:key=>records.get(k)?.[key]}))
        docs=docs.filter(d=>filters.every(([key,op,v])=>op==='=='?d.get(key)===v:op==='in'?v.includes(d.get(key)):op==='array-contains'?d.get(key)?.includes(v):false))
        const value=(d,k)=>k==='__name__'?d.id:d.get(k) instanceof Timestamp?d.get(k).toMillis():d.get(k)
        const compare=(a,b)=>{for(const [key,dir] of sorts){const x=value(a,key),y=value(b,key);if(x!==y)return (x<y?-1:1)*(dir==='desc'?-1:1)}return 0}
        docs.sort(compare)
        if(after){const cursor=after.length===1&&after[0]?.get?after[0]:{id:after.at(-1),get:key=>after[sorts.findIndex(([k])=>k===key)]};docs=docs.filter(d=>compare(d,cursor)>0)}
        docs=docs.slice(0,size)
        return {docs,empty:docs.length===0,size:docs.length}
      }}
    return api
  }
  return {records,collection,doc:path=>doc(path),runTransaction(action){const run=lock.then(async()=>{const writes=[];const result=await action({get:ref=>ref.get(),create:(ref,data)=>writes.push(()=>ref.create(data)),set:(ref,data)=>writes.push(()=>records.set(ref.path,stamp(data))),update:(ref,data)=>writes.push(()=>ref.update(data)),delete:ref=>writes.push(()=>ref.delete())});for(const write of writes)await write();return result});lock=run.catch(()=>{});return run}}
}
const product={id:7,slug:'fixture-wheel',name_ar:'عجل',name_en:'Fixture wheel',name_he:'גלגל',category:'wheel',price:'129.00',images:['/fixture.jpg'],model_parts:{},customizable_parts:['rim'],active:true,description_ar:null,description_en:null,description_he:null,created_at:Timestamp.fromMillis(1000),updated_at:Timestamp.fromMillis(1000)}
const fixture=()=>{const db=memoryDb();db.records.set('products/7',{...product,_migration:{source:'mysql'}});return db}
const customer={customerName:'Test only',phone:'0500000000',countryCode:'+972',country:'Test',deliveryAddress:'Test street 1',productId:7,quantity:1,parts:{rim:'#101114'}}

test('Inventory categories, complete product editing, authentication and password settings',async(t)=>{
  const db=fixture(),password='old-test-password',newPassword='new-test-password-123'
  db.records.set('products/8',{...product,id:8,slug:'inactive-fixture',active:false,category:'legacy-type'})
  db.records.set('adminUsers/1',{id:1,email:'admin@example.invalid',password_hash:await bcrypt.hash(password,4)})
  const oldSecret=process.env.JWT_SECRET;process.env.JWT_SECRET='test-only-inventory-secret-at-least-32-chars'
  const server=createApp({db,serverless:true}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
  t.after(async()=>{await new Promise(r=>server.close(r));if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret})
  const base='http://127.0.0.1:'+server.address().port;let token
  const request=async(path,method='GET',body)=>{const response=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()}}
  assert.equal((await request('/api/admin/products')).status,401)
  assert.equal((await request('/api/admin/categories','POST',{nameAr:'فئة',nameEn:'Category',nameHe:'קטגוריה'})).status,401)
  assert.equal((await request('/api/admin/change-password','POST',{currentPassword:password,newPassword})).status,401)
  assert.equal((await request('/api/admin/categories/shelves','DELETE')).status,401)
  assert.equal((await request('/api/admin/products/7','DELETE')).status,401)
  token=(await request('/api/admin/login','POST',{email:'admin@example.invalid',password})).body.token;assert.ok(token)
  const list=(await request('/api/admin/products')).body
  assert.ok(list.some(p=>p.id===8&&p.active===0));assert.ok(list.some(p=>p.slug==='audi-rs3-black'&&p.catalogOnly))
  const defaults=(await request('/api/categories')).body
  assert.ok(defaults.some(c=>c.id==='wheel'));assert.ok(defaults.some(c=>c.id==='legacy-type'));assert.ok(defaults.some(c=>c.id==='shelves'));assert.ok(defaults.some(c=>c.id==='keychains'))
  const names={nameAr:'رفوف جديدة',nameEn:'New shelves',nameHe:'מדפים חדשים'}
  const group=await request('/api/admin/categories','POST',names);assert.equal(group.status,201)
  assert.equal((await request('/api/admin/categories/'+group.body.id,'PATCH',{...names,nameEn:'Updated shelves'})).status,200)
  assert.equal((await createCategoryRepository(db).getById(group.body.id)).name_en,'Updated shelves')
  assert.equal((await request('/api/admin/categories/wheel','PATCH',{nameAr:'عجلات مخصصة',nameEn:'Custom wheels',nameHe:'גלגלים מותאמים'})).status,200)
  assert.equal(db.records.get('products/7').category,'wheel')
  assert.equal((await request('/api/admin/categories/missing','PATCH',names)).status,404)
  const palette=[{hex:'#123456',name_ar:'أزرق',name_en:'Blue',name_he:'כחול'}]
  const input={nameAr:'منتج جديد',nameEn:'Test shelf',nameHe:'מוצר חדש',category:group.body.id,price:null,images:['/test-only.png'],modelParts:{},customizableParts:['body'],dimensions:{length:12.5,width:8,height:null},colors:palette}
  const created=await request('/api/admin/products','POST',input);assert.equal(created.status,201);assert.ok(created.body.slug.match(/^test-shelf-/))
  const record=(await request('/api/admin/products/'+created.body.id)).body;assert.deepEqual(record.dimensions,input.dimensions);assert.deepEqual(record.colors,palette);assert.equal(record.price,null);assert.deepEqual(record.model_parts,{})
  const coloredOrder=await request('/api/orders','POST',{...customer,productId:created.body.id,parts:{body:'#123456'}});assert.equal(coloredOrder.status,201)
  assert.equal((await request('/api/orders','POST',{...customer,productId:created.body.id,parts:{body:'#ffffff'}})).status,400)
  const colorSnapshot=(await request('/api/admin/orders/'+coloredOrder.body.id)).body.details.parts[0];assert.deepEqual(colorSnapshot.colorNames,{ar:'أزرق',en:'Blue',he:'כחול'})
  assert.ok(receiptMarkup({public_id:'COLOR',details:{parts:[colorSnapshot]}},'ar').includes('أزرق'))
  assert.equal((await request('/api/admin/products/'+created.body.id,'PATCH',{category:'missing'})).status,400)
  assert.equal((await request('/api/admin/products/'+created.body.id,'PATCH',{dimensions:{length:-1,width:2,height:3}})).status,400)
  assert.equal((await request('/api/admin/products/'+created.body.id,'PATCH',{colors:[...palette,...palette]})).status,400)
  assert.equal((await request('/api/admin/products/'+created.body.id,'PATCH',{nameAr:'اسم معدل',price:19.5,category:'wheel',dimensions:{length:15,width:null,height:2},colors:[]})).status,200)
  assert.equal((await request('/api/products/'+created.body.slug)).body.price,'19.50')
  const catalogOnly=list.find(p=>p.catalogOnly)
  const imported=await request('/api/admin/products','POST',{slug:catalogOnly.slug,nameAr:catalogOnly.name_ar,nameEn:catalogOnly.name_en,nameHe:catalogOnly.name_he,category:catalogOnly.category,price:null,images:catalogOnly.images,modelParts:catalogOnly.model_parts,customizableParts:catalogOnly.customizable_parts})
  assert.equal(imported.status,201);assert.equal((await request('/api/admin/products')).body.filter(p=>p.slug===catalogOnly.slug).length,1)
  assert.equal((await request('/api/admin/change-password','POST',{currentPassword:'wrong-password',newPassword})).status,403)
  assert.equal((await request('/api/admin/change-password','POST',{currentPassword:password,newPassword:'short'})).status,400)
  assert.equal((await request('/api/admin/change-password','POST',{currentPassword:password,newPassword:password})).status,400)
  assert.equal((await request('/api/admin/change-password','POST',{currentPassword:password,newPassword})).status,200)
  assert.equal(await bcrypt.compare(newPassword,db.records.get('adminUsers/1').password_hash),true)
  assert.equal((await request('/api/admin/login','POST',{email:'admin@example.invalid',password})).status,401)
  assert.equal((await request('/api/admin/login','POST',{email:'admin@example.invalid',password:newPassword})).status,200)
  assert.equal((await request('/api/admin/categories/wheel','DELETE')).status,409)
  assert.equal((await request('/api/admin/categories/legacy-type','DELETE')).status,409)
  assert.equal((await request('/api/admin/categories/shelves','DELETE')).status,200)
  assert.ok(!(await request('/api/categories')).body.some(c=>c.id==='shelves'))
  assert.equal((await request('/api/admin/categories/shelves','DELETE')).status,404)
  assert.equal((await request('/api/admin/products','POST',{...input,category:'shelves'})).status,400)
  assert.equal((await request('/api/admin/categories/'+group.body.id,'DELETE')).status,200)
  assert.equal((await request('/api/admin/products/'+created.body.id,'DELETE')).status,200)
  assert.equal((await request('/api/products/'+created.body.slug)).status,404)
  assert.ok((await request('/api/catalog/exclusions')).body.includes(created.body.slug))
  assert.equal((await request('/api/admin/orders/'+coloredOrder.body.id)).status,200)
  assert.equal((await request('/api/admin/products/'+imported.body.id,'DELETE')).status,200)
  assert.ok(!(await request('/api/admin/products')).body.some(p=>p.slug===catalogOnly.slug))
  const localOnly=list.find(p=>p.catalogOnly&&p.slug!==catalogOnly.slug)
  assert.equal((await request('/api/admin/catalog-products/'+localOnly.slug,'DELETE')).status,200)
  assert.ok(!(await request('/api/admin/products')).body.some(p=>p.slug===localOnly.slug))
  assert.equal((await request('/api/admin/catalog-products/missing','DELETE')).status,404)
  assert.equal(db.records.get('products/7').price,'129.00')
})

function memoryBlob() {
  const objects=new Map(),policies=new Map();let generation=0
  const get=path=>{const value=objects.get(path);if(!value)throw Object.assign(new Error('not_found'),{code:'not_found'});return value}
  const blob={objects,policies,
    async uploadUrl(path,type,size,expires){blob.lastPolicy={path,type,size,expires,allowOverwrite:false};policies.set(path,blob.lastPolicy);return 'https://blob.vercel-storage.com/?signed=test-only'},
    async head(path){const data=get(path);return {size:data.buffer.length,contentType:data.contentType,pathname:path,etag:data.etag,url:'https://unit-test.private.blob.vercel-storage.com/'+path}},
    async header(path){return get(path).buffer.subarray(0,16)},
    async readUrl(path){get(path);return 'https://unit-test.private.blob.vercel-storage.com/'+path+'?signed=test-only'},
    async remove(path,etag){const data=get(path);if(data.etag!==etag)throw Object.assign(new Error('upload_conflict'),{code:'upload_conflict'});objects.delete(path)},
    upload(path,buffer,contentType){const policy=policies.get(path);if(objects.has(path))throw Object.assign(new Error('upload_conflict'),{code:'upload_conflict'});if(!policy||buffer.length>policy.size||contentType!==policy.type)throw Object.assign(new Error('invalid_upload'),{code:'invalid_upload'});objects.set(path,{buffer,contentType,etag:'etag-'+(++generation)})}
  }
  return blob
}
const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0])

test('Editing product files attaches new Blob claims without deleting shared originals',async(t)=>{
  const db=fixture(),blob=memoryBlob(),storage=createStorageService(db,{blobProvider:()=>blob})
  db.records.set('adminUsers/1',{id:1,email:'edit@example.invalid',password_hash:await bcrypt.hash('edit-test-password',4)})
  const oldSecret=process.env.JWT_SECRET;process.env.JWT_SECRET='test-only-edit-files-secret-at-least-32-chars'
  const server=createApp({db,storageService:storage,serverless:true}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
  t.after(async()=>{await new Promise(r=>server.close(r));if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret})
  const base='http://127.0.0.1:'+server.address().port
  const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'edit@example.invalid',password:'edit-test-password'})});const {token}=await login.json()
  const claim=await storage.start({kind:'productImage',name:'edit.png',contentType:'image/png',size:png.length},{adminId:1})
  const path=db.records.get('uploadAssets/'+claim.id).path;blob.upload(path,png,'image/png');await storage.finish(claim.id,claim.token,1)
  const patch=await fetch(base+'/api/admin/products/7',{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({imageUpload:{id:claim.id,token:claim.token}})})
  assert.equal(patch.status,200);assert.equal(db.records.get('uploadAssets/'+claim.id).attachedTo,'products/7');assert.deepEqual(db.records.get('products/7').images,['/api/files/'+claim.id,'/fixture.jpg'])
  await assert.rejects(storage.remove(claim.id,claim.token,1),e=>e.code==='upload_conflict')
  assert.ok(blob.objects.has(path));assert.equal(db.records.get('products/7').price,'129.00')
})

test('Blob project OIDC is SDK-managed without fixed secrets; presigned URLs are private, scoped and bounded',async(t)=>{
  const original=Object.fromEntries(['BLOB_READ_WRITE_TOKEN','BLOB_STORE_ID','VERCEL_OIDC_TOKEN'].map(key=>[key,process.env[key]]))
  t.after(()=>{for(const [key,value] of Object.entries(original)){if(value===undefined)delete process.env[key];else process.env[key]=value}})
  delete process.env.BLOB_READ_WRITE_TOKEN;delete process.env.BLOB_STORE_ID;delete process.env.VERCEL_OIDC_TOKEN
  assert.throws(()=>configuredBlob(),e=>e.code==='storage_configuration')
  process.env.BLOB_STORE_ID='store_test-only-project'
  process.env.VERCEL_OIDC_TOKEN='test-only-rotating-oidc-1'
  let issued,signed
  const observedOidc=[]
  const sdk={issueSignedToken:async options=>{issued=options;observedOidc.push(process.env.VERCEL_OIDC_TOKEN);return {clientSigningToken:'hidden-signing-key',delegationToken:'scoped',validUntil:options.validUntil}},presignUrl:async(_token,options)=>{signed=options;return {presignedUrl:'https://vercel.com/api/blob/?scoped=test-only'}},head:async(_path,options)=>{assert.deepEqual(options,{storeId:'store_test-only-project'});throw new Error('private-token-must-not-leak')}}
  const provider=configuredBlob({sdk}),path='assets/test/file.png',expires=Date.now()+60000
  const url=await provider.uploadUrl(path,'image/png',8,expires)
  assert.deepEqual(issued.operations,['put']);assert.equal(issued.pathname,path);assert.equal(issued.maximumSizeInBytes,8);assert.deepEqual(issued.allowedContentTypes,['image/png'])
  assert.equal(issued.storeId,process.env.BLOB_STORE_ID);assert.ok(!('token' in issued));assert.ok(!('oidcToken' in issued))
  assert.equal(signed.access,'private');assert.equal(signed.allowOverwrite,false);assert.equal(signed.addRandomSuffix,false)
  assert.ok(!url.includes(process.env.VERCEL_OIDC_TOKEN));assert.ok(!url.includes('hidden-signing-key'))
  process.env.VERCEL_OIDC_TOKEN='test-only-rotating-oidc-2'
  await provider.readUrl(path,expires);assert.deepEqual(issued.operations,['get']);assert.equal(signed.useCache,false)
  assert.deepEqual(observedOidc,['test-only-rotating-oidc-1','test-only-rotating-oidc-2'])
  await assert.rejects(provider.head(path),e=>e.code==='storage_unavailable'&&!e.message.includes('private-token'))
  const client=await readFile(new URL('../client/src/lib/uploads.js',import.meta.url),'utf8')
  assert.ok(!client.includes('BLOB_READ_WRITE_TOKEN'));assert.ok(!client.includes('VERCEL_OIDC_TOKEN'));assert.ok(!client.includes('BLOB_STORE_ID'));assert.ok(!client.includes('FormData'))
})

test('uploads enforce MIME, file size and GLB header validation',()=>{
  assert.throws(()=>validateUpload({kind:'reference',name:'x.svg',contentType:'image/svg+xml',size:20}),e=>e.code==='invalid_upload')
  assert.throws(()=>validateUpload({kind:'reference',name:'x.png',contentType:'image/png',size:9*1024*1024}),e=>e.code==='invalid_upload')
  assert.throws(()=>validateUpload({kind:'productModel',name:'x.exe',contentType:'application/octet-stream',size:20}),e=>e.code==='invalid_upload')
  assert.equal(validHeader(png,'image/png',png.length),true)
  assert.equal(validHeader(Buffer.from('fake'),'model/gltf-binary',4),false)
  const glb=Buffer.alloc(12);glb.write('glTF');glb.writeUInt32LE(2,4);glb.writeUInt32LE(12,8)
  assert.equal(validHeader(glb,'model/gltf-binary',12),true)
})

test('Storage upload: bounded Blob signed URL, immutable upload, read, reference update and owned cleanup',async()=>{
  const db=memoryDb(),bucket=memoryBlob(),service=createStorageService(db,{blobProvider:()=>bucket})
  const claim=await service.start({kind:'reference',name:'test.png',contentType:'image/png',size:png.length},{ip:'test-only'})
  assert.equal(bucket.lastPolicy.size,png.length);assert.equal(bucket.lastPolicy.type,'image/png');assert.equal(bucket.lastPolicy.allowOverwrite,false);assert.equal(claim.method,'PUT');assert.deepEqual(claim.headers,{'Content-Type':'image/png','x-vercel-blob-access':'private'})
  const initial=db.records.get('uploadAssets/'+claim.id);bucket.upload(initial.path,png,'image/png')
  await assert.rejects(service.finish(claim.id,'wrong-token'),e=>e.code==='upload_forbidden')
  const done=await service.finish(claim.id,claim.token)
  assert.equal(done.url,'/api/files/'+claim.id)
  const record=db.records.get('uploadAssets/'+claim.id)
  assert.ok(record.storagePath.startsWith('assets/'));assert.equal(record.path,record.storagePath);assert.match(record.blobUrl,/private\.blob\.vercel-storage\.com/)
  assert.ok((await service.preview(claim.id,claim.token)).url.includes('signed='))
  await assert.rejects(service.download(claim.id),e=>e.code==='upload_forbidden')
  // Replay cannot overwrite an existing Blob object.
  assert.throws(()=>bucket.upload(initial.path,Buffer.from('replacement'),'image/png'),e=>e.code==='upload_conflict')
  await service.finish(claim.id,claim.token)
  assert.ok(bucket.objects.get(record.storagePath).buffer.equals(png))
  await service.remove(claim.id,claim.token)
  assert.equal(bucket.objects.size,0);assert.ok(!db.records.has('uploadAssets/'+claim.id))
})

test('Storage attachments are atomic, private order reads require admin, and attached/shared files are never deleted',async()=>{
  const db=fixture(),bucket=memoryBlob(),service=createStorageService(db,{blobProvider:()=>bucket})
  const claim=await service.start({kind:'reference',name:'test.png',contentType:'image/png',size:png.length})
  bucket.upload(db.records.get('uploadAssets/'+claim.id).path,png,'image/png');await service.finish(claim.id,claim.token)
  await createOrderRepository(db).create({public_id:'CUSTOM-STORAGE',type:'custom',details:{},reference_image:'/api/files/'+claim.id},{prepare:(tx,target)=>service.attach(tx,[{...claim,kind:'reference'}],target)})
  assert.equal(db.records.get('uploadAssets/'+claim.id).attachedTo,'orders/CUSTOM-STORAGE')
  await assert.rejects(service.download(claim.id),e=>e.code==='upload_forbidden')
  assert.ok((await service.download(claim.id,1)).includes('signed='))
  await assert.rejects(service.remove(claim.id,claim.token),e=>e.code==='upload_conflict')
  assert.equal(bucket.objects.size,1)
  await assert.rejects(createOrderRepository(db).create({public_id:'SECOND',details:{}},{prepare:(tx,target)=>service.attach(tx,[{...claim,kind:'reference'}],target)}),e=>e.code==='upload_forbidden')
  assert.ok(!db.records.has('orders/SECOND'))
})

test('Storage configuration failure leaves no uploads metadata and product uploads require admin',async()=>{
  const db=memoryDb(),service=createStorageService(db,{blobProvider:()=>{throw Object.assign(new Error('missing'),{code:'storage_configuration'})}})
  await assert.rejects(service.start({kind:'reference',name:'test.png',contentType:'image/png',size:png.length}),e=>e.code==='storage_configuration')
  assert.equal(db.records.size,0)
  await assert.rejects(service.start({kind:'productImage',name:'test.png',contentType:'image/png',size:png.length}),e=>e.code==='upload_forbidden')
})

test('direct upload HTTP flow attaches a private custom-order image and a public product image safely',async(t)=>{
  const db=fixture(),bucket=memoryBlob(),storageService=createStorageService(db,{blobProvider:()=>bucket})
  const oldSecret=process.env.JWT_SECRET;process.env.JWT_SECRET='test-only-jwt-secret-at-least-32-characters'
  const password='test-only-password'
  db.records.set('adminUsers/1',{id:1,email:'test@example.invalid',password_hash:await bcrypt.hash(password,4)})
  const server=createApp({db,storageService,serverless:true}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve))
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret})
  const base='http://127.0.0.1:'+server.address().port
  const request=async(path,body,token,method=body?'POST':'GET')=>{const response=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()}}
  const token=(await request('/api/admin/login',{email:'test@example.invalid',password})).body.token
  const input={name:'test.png',contentType:'image/png',size:png.length}
  assert.equal((await request('/api/uploads',{...input,kind:'productImage'})).status,401)
  const upload=async(kind,owner)=>{
    const started=await request('/api/uploads',{...input,kind},owner);assert.equal(started.status,201)
    const claim={id:started.body.id,token:started.body.token}
    bucket.upload(db.records.get('uploadAssets/'+claim.id).path,png,'image/png')
    assert.equal((await request('/api/uploads/'+claim.id+'/complete',{token:claim.token},owner)).status,200)
    return claim
  }
  const reference=await upload('reference')
  const custom=await request('/api/custom-orders',{...customer,customName:'Custom design',partsDescription:'Synthetic custom design',referenceUpload:reference})
  assert.equal(custom.status,201)
  assert.equal((await request('/api/files/'+reference.id+'?format=json')).status,403)
  assert.equal((await request('/api/files/'+reference.id+'?format=json',undefined,token)).status,200)
  assert.equal((await request('/api/uploads/'+reference.id,{token:reference.token},undefined,'DELETE')).status,409)
  const image=await upload('productImage',token)
  assert.equal((await request('/api/admin/products',{slug:'storage-product',nameAr:'منتج',nameEn:'Test product',nameHe:'מוצר',price:12,imageUpload:image},token)).status,201)
  const product=await createProductRepository(db).getBySlug('storage-product')
  assert.deepEqual(product.images,['/api/files/'+image.id])
  assert.equal((await request('/api/files/'+image.id+'?format=json')).status,200)
  assert.equal((await request('/api/admin/products/'+product.id,undefined,token,'DELETE')).status,200)
  assert.equal((await request('/api/files/'+image.id+'?format=json')).status,404)
  assert.equal(bucket.objects.size,2) // Attached objects retained; product deletion cannot delete shared files.
  const spare=await upload('reference')
  assert.equal((await request('/api/uploads/'+spare.id,{token:spare.token},undefined,'DELETE')).status,200)
  assert.ok(!db.records.has('uploadAssets/'+spare.id));assert.equal(bucket.objects.size,2)
})

test('browser receipt is A4, RTL-safe, escaped, complete and does not call a print queue',async()=>{
  const order={public_id:'TEST',customer_name:'<script>alert(1)</script>',phone:'0500000000',country:'Test',delivery_address:'Test address',details:{productSlug:'test',quantity:1,parts:[{label:'disc',color:'#777c84'}]},notes:'Note'}
  const html=receiptMarkup(order,'ar',{defaults:{test:{base:'BASE DEFAULT',caliper:'CALIPER DEFAULT'}},colors:[{hex:'#777c84',ar:'رمادي',en:'Gray'}],labels:{disc:'قرص الفرامل'}})
  assert.match(html,/dir="rtl"/);assert.match(html,/BASE DEFAULT/);assert.match(html,/CALIPER DEFAULT/);assert.match(html,/رمادي/);assert.ok(!html.includes('<script>'))
  assert.match(printCss,/size:A4/);assert.match(printCss,/display:none!important/)
  const source=await readFile(new URL('../client/src/lib/order-print.js',import.meta.url),'utf8')
  assert.match(source,/window\.print\(\)/);assert.ok(!source.includes('fetch('))
  const config=JSON.parse(await readFile(new URL('../firebase.json',import.meta.url),'utf8'));assert.ok(!config.storage)
})

test('Firestore products: types, paging, create/update/delete and slug conflicts',async()=>{
  const db=fixture(),repo=createProductRepository(db)
  const found=await repo.getById(7)
  assert.equal(found.active,1);assert.equal(found.price,'129.00');assert.equal(found.description_ar,null)
  assert.equal(found.created_at,'1970-01-01T00:00:01.000Z');assert.ok(!('_migration' in found))
  const id=await repo.create({...product,id:undefined,slug:'new-wheel',price:10})
  assert.equal(id,8);assert.equal((await repo.getById(id)).price,'10.00')
  await assert.rejects(repo.create({...product,id:9,slug:'new-wheel'}),e=>e.code==='write_conflict')
  const first=await repo.listActive({limit:1}),second=await repo.listActive({limit:1,cursor:first.cursor})
  assert.equal(first.items.length,1);assert.notEqual(first.items[0].id,second.items[0].id)
  await repo.update(id,{price:null,active:false})
  assert.equal((await repo.getById(id)).price,null);assert.equal(await repo.getBySlug('new-wheel'),null)
  await repo.delete(id);assert.equal(await repo.getById(id),null)
  await assert.rejects(repo.update(999,{price:1}),e=>e.code==='not_found')
  assert.equal(db.records.get('products/7').slug,'fixture-wheel')
})

test('Firestore orders: numeric allocation, public IDs, nulls, search, status and chronological order',async()=>{
  const db=fixture(),repo=createOrderRepository(db)
  const base={type:'standard',customer_name:'Sample',phone:'0500000000',details:{parts:[],deliveryLocation:null},status:'ready'}
  await Promise.all([repo.create({...base,public_id:'REV-TEST-A'}),repo.create({...base,public_id:'REV-TEST-B'})])
  const a=await repo.getByPublicId('REV-TEST-A'),b=await repo.getByPublicId('REV-TEST-B')
  assert.notEqual(a.id,b.id);assert.equal(a.reference_image,null);assert.equal(a.quoted_price,null)
  await assert.rejects(repo.create({...base,public_id:'REV-TEST-A'}),e=>e.code==='write_conflict')
  await repo.update(a.public_id,{quoted_price:12.5,production_eta:'7',status:'archived'})
  assert.equal((await repo.getByPublicId(a.public_id)).quoted_price,'12.50')
  assert.equal((await repo.list()).items.length,1);assert.equal((await repo.list({status:'archived'})).items.length,1)
  assert.equal((await repo.list({search:'test-b'})).items[0].public_id,b.public_id)
  assert.equal((await repo.list({search:'not-matched'})).items.length,0)
  assert.equal((await repo.list({search:'%'})).items.length,1)
  assert.equal((await repo.list({search:'TEST_'})).items.length,1)
  assert.equal((await repo.list({status:'unknown'})).items.length,0)
  await assert.rejects(repo.update(a.public_id,{customer_name:'x'}),e=>e.code==='invalid_data')
  await assert.rejects(repo.update('missing',{status:'ready'}),e=>e.code==='not_found')
})

test('repository errors are sanitized and decimal validation is safe',async()=>{
  for(const [code,expected] of [[5,'not_found'],[6,'write_conflict'],[3,'invalid_data'],[7,'firestore_permission'],[9,'firestore_configuration'],[14,'firestore_unavailable']])await assert.rejects(guarded(()=>{throw {code,message:'SECRET'}}),e=>e.code===expected&&!e.message.includes('SECRET'))
  assert.throws(()=>decimal(NaN),e=>e.code==='invalid_data')
})

test('Firestore admin lookup retains bcrypt hash and never changes stored credentials',async()=>{
  const db=memoryDb(),repo=createAdminRepository(db)
  db.records.set('adminUsers/2',{id:2,email:'test@example.invalid',password_hash:'original-hash',created_at:Timestamp.fromMillis(1000)})
  const admin=await repo.findByEmail('TEST@EXAMPLE.INVALID')
  assert.equal(admin.password_hash,'original-hash');assert.equal(admin.id,2)
  assert.equal((await repo.getById(2)).created_at,'1970-01-01T00:00:01.000Z')
  assert.equal(await repo.getById(3),null)
  assert.equal(db.records.get('adminUsers/2').password_hash,'original-hash')
})

test('Vercel routing keeps API URLs, assets and SPA deep links separated',async()=>{
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'))
  assert.equal(config.framework,'vite');assert.equal(config.outputDirectory,'client/dist')
  assert.equal(config.installCommand,'npm ci');assert.equal(config.buildCommand,'npm run build')
  assert.ok(config.functions['api/index.js'].excludeFiles.includes('backups/**'))
  const destination=(path,existing=false)=>{for(const route of config.routes){if(route.handle==='filesystem'){if(existing)return path;continue}if(route.continue)continue;if(new RegExp('^'+route.src+'$').test(path))return route.dest}}
  for(const path of ['/api/health','/api/products','/api/admin/orders/REV-TEST?lang=he','/uploads/test.jpg'])assert.equal(destination(path),'/api/index')
  assert.equal(destination('/assets/image.jpg',true),'/assets/image.jpg')
  assert.equal(destination('/products/fixture-wheel'),'/index.html')
  assert.ok(config.routes[0].headers['Content-Security-Policy'].includes("default-src 'self'"))
  const entry=await readFile(new URL('../api/index.js',import.meta.url),'utf8')
  assert.match(entry,/export default app/);assert.ok(!entry.includes('.listen('));assert.match(entry,/serverless:true/)
})

test('serverless mode uses Firestore APIs without disk uploads or local printing',async(t)=>{
  const db=fixture(),oldSecret=process.env.JWT_SECRET
  process.env.JWT_SECRET='test-only-jwt-secret-at-least-32-characters'
  const password='test-only-password'
  db.records.set('adminUsers/1',{id:1,email:'test@example.invalid',password_hash:await bcrypt.hash(password,4)})
  let printed=false
  const server=createApp({db,serverless:true,printOrder:async()=>{printed=true;throw new Error('must_not_print')}}).listen(0,'127.0.0.1')
  await new Promise(resolve=>server.once('listening',resolve))
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret})
  const base='http://127.0.0.1:'+server.address().port
  let token=''
  const request=async(path,{method='GET',body,form}={})=>{const res=await fetch(base+path,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:form?{body:form}:{})});return {status:res.status,body:await res.json()}}
  assert.deepEqual((await request('/api/health')).body,{ok:true})
  assert.equal((await request('/api/products')).body.length,1)
  assert.equal((await request('/api/not-a-route')).status,404)
  token=(await request('/api/admin/login',{method:'POST',body:{email:'test@example.invalid',password}})).body.token
  const created=await request('/api/orders',{method:'POST',body:customer})
  assert.equal(created.status,201);assert.equal(printed,false)
  const order=(await request('/api/admin/orders/'+created.body.id)).body
  assert.ok(!('print_status' in order))
  const printResponse=await request('/api/admin/orders/'+created.body.id+'/print',{method:'POST'})
  assert.equal(printResponse.status,200);assert.equal(printResponse.body.clientSide,true);assert.equal(printResponse.body.queued,false)
  assert.deepEqual(await request('/uploads/file.jpg'),{status:410,body:{error:'legacy_upload_unavailable'}})
  const form=new FormData();form.set('referenceImage',new Blob(['test'],{type:'image/png'}),'test.png')
  assert.deepEqual(await request('/api/custom-orders',{method:'POST',form}),{status:400,body:{error:'direct_upload_required'}})
  assert.deepEqual(await request('/api/admin/products',{method:'POST',form}),{status:400,body:{error:'direct_upload_required'}})
  assert.equal((await request('/api/admin/products',{method:'POST',body:{slug:'json-only-product',nameAr:'منتج',nameEn:'Test product',nameHe:'מוצר',price:12}})).status,201)
  assert.equal(printed,false)
})

test('API contracts: Firestore login, products, standard/custom orders, quotes, archive, print and auth',async(t)=>{
  const db=fixture()
  const password='test-only-password'
  db.records.set('adminUsers/1',{id:1,email:'test@example.invalid',password_hash:await bcrypt.hash(password,4)})
  const oldSecret=process.env.JWT_SECRET
  process.env.JWT_SECRET='test-only-jwt-secret-at-least-32-characters'
  const printed=[]
  const server=createApp({db,printOrder:async(order,lang)=>printed.push({id:order.public_id,lang})}).listen(0,'127.0.0.1')
  await new Promise(resolve=>server.once('listening',resolve))
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret})
  const base='http://127.0.0.1:'+server.address().port
  let token=''
  const request=async(path,{method='GET',body}={})=>{const response=await fetch(base+'/api'+path,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()}}
  assert.equal((await request('/admin/orders')).status,401)
  const invalid=await request('/admin/login',{method:'POST',body:{email:'test@example.invalid',password:'wrong-password'}});assert.equal(invalid.status,401)
  const login=await request('/admin/login',{method:'POST',body:{email:'test@example.invalid',password}})
  assert.equal(login.status,200);token=login.body.token;assert.deepEqual(login.body.admin,{email:'test@example.invalid'})
  assert.deepEqual((await request('/admin/me')).body,{admin:{email:'test@example.invalid'}})
  const listing=await request('/products');assert.equal(listing.status,200);assert.equal(listing.body.length,1);assert.equal(listing.body[0].active,1)
  assert.equal((await request('/products/fixture-wheel')).body.id,7)
  assert.equal((await request('/admin/products/7')).body.id,7)
  assert.equal((await request('/products/missing')).status,404)
  assert.equal((await request('/orders',{method:'POST',body:{...customer,parts:{unknown:'#101114'}}})).status,400)
  assert.equal((await request('/orders',{method:'POST',body:{...customer,productId:999}})).status,404)
  const created=await request('/orders',{method:'POST',body:customer})
  assert.equal(created.status,201);assert.equal(created.body.status,'ready')
  const path='/admin/orders/'+created.body.id
  const order=(await request(path)).body
  assert.equal(order.type,'standard');assert.ok(!('print_status' in order));assert.equal(order.quoted_price,null);assert.equal(order.details.quantity,1)
  assert.equal((await request(path,{method:'PATCH',body:{status:'quoted',quotedPrice:10,productionEta:'7'}})).status,400)
  assert.equal((await request(path,{method:'PATCH',body:{status:'awaiting_pickup'}})).status,200)
  assert.equal((await request(path,{method:'PATCH',body:{status:'archived'}})).status,200)
  assert.equal((await request('/admin/orders')).body.length,0)
  assert.equal((await request('/admin/orders?status=archived')).body.length,1)
  assert.equal((await request('/admin/orders?status=archived&search=sample')).body.length,0)
  assert.equal((await request(path+'/print?lang=he',{method:'POST'})).status,200)
  assert.equal(printed.length,0)
  assert.equal((await request('/admin/orders/missing',{method:'PATCH',body:{status:'ready'}})).status,404)
  await createOrderRepository(db).create({public_id:'CUSTOM-TEST',type:'custom',customer_name:'Custom',phone:'0500000000',details:{},status:'new'})
  assert.equal((await request('/admin/orders/CUSTOM-TEST',{method:'PATCH',body:{status:'quoted'}})).status,400)
  assert.equal((await request('/admin/orders/CUSTOM-TEST',{method:'PATCH',body:{status:'quoted',quotedPrice:40,productionEta:'8'}})).status,200)
  const quote=(await request('/admin/orders/CUSTOM-TEST')).body;assert.equal(quote.quoted_price,'40.00');assert.equal(quote.production_eta,'8')
  await request('/admin/orders/CUSTOM-TEST',{method:'PATCH',body:{quotedPrice:null,productionEta:null}})
  assert.equal((await request('/admin/orders/CUSTOM-TEST')).body.quoted_price,'40.00')
  const newProduct=await request('/admin/products',{method:'POST',body:{slug:'test-product',nameAr:'منتج',nameEn:'Test product',nameHe:'מוצר',price:12}});assert.equal(newProduct.status,201)
  const newId=(await createProductRepository(db).getBySlug('test-product')).id
  assert.equal((await request('/admin/products/'+newId,{method:'PATCH',body:{price:14}})).status,200)
  assert.equal((await request('/admin/products/'+newId,{method:'DELETE'})).status,200)
  assert.equal(db.records.get('products/7').price,'129.00')
})

test('Custom orders: configured dimension limits, three private images, ordered labels and 60-day purge',async(t)=>{
 const db=fixture(),bucket=memoryBlob(),storageService=createStorageService(db,{blobProvider:()=>bucket})
 const oldSecret=process.env.JWT_SECRET;process.env.JWT_SECRET='test-only-custom-secret-at-least-32-characters'
 db.records.set('adminUsers/1',{id:1,email:'custom@example.invalid',password_hash:await bcrypt.hash('test-only-password',4)})
 const server=createApp({db,storageService,serverless:true}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
 t.after(async()=>{await new Promise(r=>server.close(r));if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret})
 const base='http://127.0.0.1:'+server.address().port
 const request=async(path,body,token,method=body?'POST':'GET')=>{const r=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}}
 const token=(await request('/api/admin/login',{email:'custom@example.invalid',password:'test-only-password'})).body.token
 const limits={maxDimensions:{length:30,width:20,height:10}}
 assert.equal((await request('/api/admin/settings/custom-orders',limits,undefined,'PATCH')).status,401)
 assert.equal((await request('/api/admin/settings/custom-orders',limits,token,'PATCH')).status,200)
 assert.deepEqual((await request('/api/settings/custom-orders')).body,limits)
 const claims=[]
 for(let i=0;i<3;i++){const start=await storageService.start({kind:'reference',name:'image.png',contentType:'image/png',size:png.length},{ip:'custom-test'});bucket.upload(db.records.get('uploadAssets/'+start.id).path,png,'image/png');await storageService.finish(start.id,start.token);claims.push({id:start.id,token:start.token})}
 const input={...customer,customName:'My custom product',partsDescription:'Follow the reference images',referenceUploads:claims,dimensions:{length:30,width:20,height:10}}
 assert.equal((await request('/api/custom-orders',{...input,dimensions:{length:31,width:20,height:10}})).status,400)
 assert.equal((await request('/api/custom-orders',{...input,referenceUploads:[...claims,claims[0]]})).status,400)
 assert.equal((await request('/api/custom-orders',{...input,referenceUploads:[claims[0],claims[0]]})).status,400)
 assert.equal([...db.records.keys()].filter(k=>k.startsWith('orders/')).length,0)
 const created=await request('/api/custom-orders',input);assert.equal(created.status,201)
 const order=(await request('/api/admin/orders/'+created.body.id,undefined,token)).body
 assert.equal(created.body.displayId,'ord1');assert.equal(order.reference_images.length,3);assert.equal(order.display_id,'ord1');assert.deepEqual(order.details.dimensions,input.dimensions)
 for(const path of order.reference_images){assert.equal((await request(path+'?format=json')).status,403);assert.equal((await request(path+'?format=json',undefined,token)).status,200)}
 const repo=createOrderRepository(db);await repo.update(order.public_id,{status:'archived'})
 assert.equal((await repo.purgeArchived({storageService,now:Date.now()+59*86400000})).removed,0)
 assert.equal(bucket.objects.size,3)
 assert.equal((await repo.purgeArchived({storageService,now:Date.now()+61*86400000})).removed,1)
 assert.equal(bucket.objects.size,0);assert.equal(await repo.getByPublicId(order.public_id),null)
 assert.equal([...db.records.keys()].filter(k=>k.startsWith('uploadAssets/')).length,0)
 assert.ok(db.records.has('products/7'));assert.ok(db.records.has('adminUsers/1'))
 assert.equal((await repo.purgeArchived({storageService,now:Date.now()+62*86400000})).removed,0)
 assert.equal((await request('/api/maintenance/archive')).status,401)
 const receipt=receiptMarkup({...order,type:'custom'},'ar');assert.ok(receipt.includes('ord1'));assert.ok(receipt.includes('30 cm'));assert.ok(!receipt.includes('النص على الكاليبر'))
})

test('Archive purge retries Blob failures without deleting the order prematurely',async()=>{
 const db=memoryDb(),repo=createOrderRepository(db)
 db.records.set('orders/legacy',{id:9,public_id:'legacy',status:'archived',updated_at:Timestamp.fromMillis(1000),customer_name:'Test'})
 let fail=true
 const storageService={purgeOrderFiles:async()=>{if(fail)throw Object.assign(Error('storage_unavailable'),{code:'storage_unavailable'})}}
 await assert.rejects(repo.purgeArchived({storageService}),/storage_unavailable/)
 assert.ok(db.records.has('orders/legacy'));assert.equal(db.records.get('orders/legacy').purging,true)
 await assert.rejects(repo.update('legacy',{status:'ready'}),e=>e.code==='write_conflict')
 fail=false;assert.equal((await repo.purgeArchived({storageService})).removed,1)
})

test('Archive cleanup retains shared reference images for the surviving order',async()=>{
 const db=memoryDb(),bucket=memoryBlob(),service=createStorageService(db,{blobProvider:()=>bucket}),repo=createOrderRepository(db)
 const claim=await service.start({kind:'reference',name:'shared.png',contentType:'image/png',size:png.length},{ip:'shared-test'})
 bucket.upload(db.records.get('uploadAssets/'+claim.id).path,png,'image/png');await service.finish(claim.id,claim.token)
 const url='/api/files/'+claim.id
 await repo.create({id:1,public_id:'old',status:'archived',reference_image:url},{prepare:(tx,target)=>service.attach(tx,[{...claim,kind:'reference'}],target)})
 db.records.get('orders/old').archived_at=Timestamp.fromMillis(1000)
 await repo.create({id:2,public_id:'survivor',status:'new',reference_images:[url]})
 assert.equal((await repo.purgeArchived({storageService:service})).removed,1)
 assert.equal(bucket.objects.size,1);assert.equal(db.records.get('uploadAssets/'+claim.id).attachedTo,'orders/survivor')
 assert.ok((await service.download(claim.id,'1')).includes('signed='))
})

test('Category-specific customization enforces complete explicit choices and stores stable localized snapshots',async(t)=>{
 const db=fixture(),old=process.env.JWT_SECRET;process.env.JWT_SECRET='test-only-configuration-secret-at-least-32-characters'
 const password='test-only-password';db.records.set('adminUsers/1',{id:1,email:'config@example.invalid',password_hash:await bcrypt.hash(password,4)})
 const server=createApp({db,serverless:true}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
 t.after(async()=>{await new Promise(r=>server.close(r));if(old===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=old})
 let token;const base='http://127.0.0.1:'+server.address().port
 const request=async(path,body,method=body?'POST':'GET')=>{const r=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}}
 token=(await request('/api/admin/login',{email:'config@example.invalid',password})).body.token
 const fields=[{key:'rim',label_ar:'لون الجنط',label_en:'Rim color',label_he:'צבע חישוק',textEnabled:false},{key:'stand',label_ar:'لون القاعدة',label_en:'Stand color',label_he:'צבע מעמד',textEnabled:true}]
 const category={nameAr:'جنوط جديدة',nameEn:'New wheels',nameHe:'גלגלים חדשים',customizationFields:fields}
 assert.equal((await request('/api/admin/categories/wheel',category,'PATCH')).status,200)
 assert.deepEqual((await request('/api/categories')).body.find(x=>x.id==='wheel').customization_fields,fields)
 assert.equal((await request('/api/admin/categories/wheel',{...category,customizationFields:[fields[0],fields[0]]},'PATCH')).status,400)
 const red={hex:'#df2029',name_ar:'أحمر',name_en:'Red',name_he:'אדום'},black={hex:'#101114',name_ar:'أسود',name_en:'Black',name_he:'שחור'}
 const fieldOptions={rim:{colors:[red],defaultColor:red.hex},stand:{colors:[black],defaultColor:black.hex,defaultText:'ORIGINAL'}}
 assert.equal((await request('/api/admin/products/7',{fieldOptions},'PATCH')).status,200)
 assert.deepEqual((await request('/api/products/fixture-wheel')).body.field_options,fieldOptions)
 const input={...customer,parts:{rim:red.hex,stand:black.hex},texts:{stand:'CUSTOM LOGO'}}
 assert.equal((await request('/api/orders',{...input,parts:{}})).body.error,'required_colors_missing')
 assert.equal((await request('/api/orders',{...input,parts:{rim:red.hex}})).body.error,'required_colors_missing')
 assert.equal((await request('/api/orders',{...input,texts:{}})).body.error,'required_text_missing')
 assert.equal((await request('/api/orders',{...input,texts:{stand:'  '}})).body.error,'required_text_missing')
 assert.equal((await request('/api/orders',{...input,parts:{rim:black.hex,stand:black.hex}})).body.error,'invalid_color')
 assert.equal((await request('/api/orders',{...input,texts:{stand:'TEXT',unrelated:'TEXT'}})).body.error,'invalid_text_field')
 assert.equal([...db.records.keys()].filter(k=>k.startsWith('orders/')).length,0)
 const created=await request('/api/orders',input);assert.equal(created.status,201)
 const order=(await request('/api/admin/orders/'+created.body.id)).body
 assert.deepEqual(order.details.texts,{stand:'CUSTOM LOGO'});assert.equal(order.details.baseText,'CUSTOM LOGO');assert.equal(order.details.caliperText,'')
 assert.equal(order.details.parts.length,2);assert.deepEqual(order.details.parts[0].labels,{ar:'لون الجنط',en:'Rim color',he:'צבע חישוק'});assert.equal(order.details.parts[0].colorNames.en,'Red')
 assert.equal((await request('/api/admin/categories/wheel',{...category,customizationFields:fields.map(f=>({...f,textEnabled:false,label_en:'Updated label'}))},'PATCH')).status,200)
 const unchanged=(await request('/api/admin/orders/'+created.body.id)).body;assert.equal(unchanged.details.parts[0].labels.en,'Rim color')
 assert.equal((await request('/api/orders',{...input,texts:{}})).status,201)
 const freeReceipt=receiptMarkup({id:99,type:'custom',details:{customName:'Print a logo',partsDescription:'As attached'}},'ar')
 assert.ok(!freeReceipt.includes('النص على القاعدة'));assert.ok(!freeReceipt.includes('النص على الكاليبر'))
 const rendered=receiptMarkup(order,'en');assert.ok(rendered.includes('Rim color'));assert.ok(rendered.includes('CUSTOM LOGO'))

 assert.equal((await request('/api/admin/categories/wheel',{...category,customizationFields:[fields[0],{...fields[1],colorEnabled:false,textEnabled:true,label_en:'Engraving'}]},'PATCH')).status,200)
 const textOnlyInput={...input,parts:{rim:red.hex},texts:{stand:'LOGO'}}
 assert.equal((await request('/api/orders',{...textOnlyInput,texts:{}})).body.error,'required_text_missing')
 assert.equal((await request('/api/orders',input)).body.error,'invalid_part')
 const textOnlyCreated=await request('/api/orders',textOnlyInput);assert.equal(textOnlyCreated.status,201)
 const textOnlyOrder=(await request('/api/admin/orders/'+textOnlyCreated.body.id)).body
 assert.equal(textOnlyOrder.details.parts.length,1);assert.equal(textOnlyOrder.details.textLabels.stand.en,'Engraving');assert.equal(textOnlyOrder.details.baseText,'LOGO')
 assert.ok(receiptMarkup(textOnlyOrder,'en').includes('Engraving'))

 const noText=receiptMarkup({id:2,details:{productSlug:'known',texts:{},baseText:'',caliperText:''}},'en',{defaults:{known:{base:'OLD STAND',caliper:'OLD CALIPER'}}});assert.ok(!noText.includes('OLD STAND'));assert.ok(!noText.includes('OLD CALIPER'))
})

test('Color library links several products atomically, hides pending colors and persists section assignments',async(t)=>{
 const db=fixture(),old=process.env.JWT_SECRET;process.env.JWT_SECRET='test-only-color-library-secret-at-least-32-characters'
 const password='test-only-password';db.records.set('adminUsers/1',{id:1,email:'color@example.invalid',password_hash:await bcrypt.hash(password,4)});db.records.set('products/8',{...product,id:8,slug:'second-wheel'})
 const server=createApp({db,serverless:true}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));if(old===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=old})
 let token;const base='http://127.0.0.1:'+server.address().port;const request=async(path,body,method=body?'POST':'GET')=>{const r=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}}
 const color={hex:'#123456',name_ar:'لون خاص',name_en:'Custom color',name_he:'צבע מותאם'}
 assert.equal((await request('/api/admin/colors')).status,401);assert.equal((await request('/api/admin/colors',{color,assignments:[]})).status,401)
 token=(await request('/api/admin/login',{email:'color@example.invalid',password})).body.token
 assert.equal((await request('/api/admin/colors',{color,assignments:[{productId:7,fields:['rim']},{productId:999,fields:[]}]})).status,404);assert.equal(db.records.get('products/7').colors,undefined);assert.equal(db.records.has('colorLibrary/123456'),false)
 assert.equal((await request('/api/admin/colors',{color,assignments:[{productId:7,fields:['rim']},{productId:8,fields:[]}]})).status,200)
 assert.equal((await request('/api/admin/colors')).body.length,1);assert.equal(db.records.get('products/7').field_options.rim.colors.filter(c=>c.hex===color.hex).length,1);assert.deepEqual(db.records.get('products/8').pending_color_assignments,[color.hex])
 assert.equal((await request('/api/orders',{...customer,productId:8,parts:{rim:color.hex}})).body.error,'invalid_color')
 const fieldOptions={rim:{colors:[color],defaultColor:color.hex}},fieldLabels={rim:{label_ar:'لون الشعار',label_en:'Logo color',label_he:'צבע לוגו'}}
 assert.equal((await request('/api/admin/products/8',{fieldOptions,enabledColorFields:['rim'],fieldLabels},'PATCH')).status,200);assert.deepEqual(db.records.get('products/8').pending_color_assignments,[])
 const created=await request('/api/orders',{...customer,productId:8,parts:{rim:color.hex}});assert.equal(created.status,201);const order=(await request('/api/admin/orders/'+created.body.id)).body;assert.equal(order.details.parts[0].labels.en,'Logo color')
 assert.equal((await request('/api/admin/colors',{color,assignments:[{productId:7,fields:['rim']}]})).status,200);assert.equal(db.records.get('products/7').colors.length,1)
 const missing=await request('/api/admin/colors',{color:{...color,name_ar:''},assignments:[]});assert.equal(missing.status,400);assert.equal(missing.body.issues[0].field,'color.name_ar')
})

test('Cart checkout validates all items, saves atomically and prevents duplicate retries',async(t)=>{
 const db=fixture();db.records.set('products/8',{...product,id:8,slug:'second-wheel',price:null})
 db.records.set('orders/ORIGINAL',{id:3,public_id:'ORIGINAL',status:'ready',details:{original:true}})
 const beforeProduct=JSON.stringify(db.records.get('products/7'))
 const server=createApp({db,serverless:true}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)))
 const base='http://127.0.0.1:'+server.address().port
 const request=async body=>{const response=await fetch(base+'/api/cart/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()}}
 const checkoutId='12345678-1234-4234-8234-123456789012'
 const item={productId:7,quantity:2,parts:{rim:'#101114'},texts:{}}
 const input={checkoutId,customer,items:[item,{...item,productId:8,quantity:3}]}
 assert.equal((await request({...input,items:[item,{...item,productId:999}]})).status,404)
 assert.equal((await request({...input,items:[item,{...item,parts:{}}]})).status,400)
 assert.equal([...db.records.keys()].filter(k=>k.startsWith('orders/')).length,1)
 const created=await request(input);assert.equal(created.status,201);assert.equal(created.body.orders.length,2)
 assert.deepEqual(created.body.orders.map(x=>x.displayId),['ord4','ord5'])
 assert.deepEqual(created.body.orders.map(x=>x.status),['ready','new'])
 const retry=await request(input);assert.equal(retry.status,201);assert.deepEqual(retry.body,created.body)
 assert.equal((await request({...input,items:[{...item,quantity:4}]})).status,409)
 const concurrentId='22345678-1234-4234-8234-123456789012'
 const concurrent=await Promise.all([request({...input,checkoutId:concurrentId}),request({...input,checkoutId:concurrentId})])
 assert.equal(concurrent[0].status,201);assert.equal(concurrent[1].status,201);assert.deepEqual(concurrent[0].body,concurrent[1].body)
 assert.equal([...db.records.keys()].filter(k=>k.startsWith('orders/')).length,5)
 const order=await createOrderRepository(db).getByPublicId(created.body.orders[0].id)
 assert.equal(order.details.quantity,2);assert.equal(order.details.parts[0].color,'#101114')
 assert.equal(order.customer_name,customer.customerName);assert.equal(order.checkout_id,checkoutId)
 const metadata=db.records.get('checkoutRequests/'+checkoutId);assert.equal(metadata.customer_name,undefined);assert.equal(metadata.phone,undefined)
 assert.equal(JSON.stringify(db.records.get('products/7')),beforeProduct);assert.deepEqual(db.records.get('orders/ORIGINAL').details,{original:true})
 assert.equal((await request({...input,items:Array(31).fill(item)})).status,400)
})


test('Shared detail library: localized fields, category references, automatic product inheritance and color restrictions',async(t)=>{
 const db=fixture(),password='detail-test-password';db.records.set('adminUsers/1',{id:1,email:'details@example.invalid',password_hash:await bcrypt.hash(password,4)})
 const oldSecret=process.env.JWT_SECRET;process.env.JWT_SECRET='test-only-details-secret-at-least-32-chars'
 const server=createApp({db,serverless:true}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
 t.after(async()=>{await new Promise(r=>server.close(r));if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret})
 const base='http://127.0.0.1:'+server.address().port;let token
 const request=async(path,method='GET',body)=>{const response=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()}}
 assert.equal((await request('/api/admin/details')).status,401)
 token=(await request('/api/admin/login','POST',{email:'details@example.invalid',password})).body.token
 const before=db.records.size;const seeded=await request('/api/admin/details');assert.equal(seeded.status,200);assert.ok(seeded.body.some(f=>f.key==='rim'));assert.equal(db.records.size,before)
 const blue={hex:'#123456',name_ar:'أزرق',name_en:'Blue',name_he:'כחול'},red={hex:'#654321',name_ar:'أحمر',name_en:'Red',name_he:'אדום'}
 for(const color of [blue,red])assert.equal((await request('/api/admin/colors','POST',{color,assignments:[]})).status,200)
 const colorDetail={label_ar:'لون الشعار',label_en:'Logo color',label_he:'צבע הלוגו',type:'color',colorHexes:[blue.hex]}
 const textDetail={label_ar:'النص المطلوب',label_en:'Requested text',label_he:'טקסט מבוקש',type:'text',placeholder_ar:'أدخل النص',placeholder_en:'Enter text',placeholder_he:'הזן טקסט'}
 const colorKey=(await request('/api/admin/details','POST',colorDetail)).body.key,textKey=(await request('/api/admin/details','POST',textDetail)).body.key
 assert.ok(colorKey);assert.ok(textKey)
 assert.equal((await request('/api/admin/details','POST',{...colorDetail,colorHexes:['#ffffff']})).status,400)
 const categoryInput={nameAr:'فئة شعار',nameEn:'Logo category',nameHe:'קטגוריית לוגו',detailKeys:[colorKey,textKey]}
 const category=(await request('/api/admin/categories','POST',categoryInput)).body.id;assert.ok(category)
 assert.equal((await request('/api/admin/categories','POST',{...categoryInput,detailKeys:['missing']})).status,400)
 const created=await request('/api/admin/products','POST',{nameAr:'شعار',nameEn:'Test logo',nameHe:'לוגו',category,price:20,images:['/test-only.jpg'],modelParts:{},customizableParts:[],colors:[blue,red]})
 assert.equal(created.status,201)
 const productId=created.body.id
 const groups=(await request('/api/categories')).body,group=groups.find(c=>c.id===category)
 assert.deepEqual(group.detail_keys,[colorKey,textKey]);assert.equal(group.customization_fields[0].label_he,colorDetail.label_he)
 // No per-product detail definitions are required; old overrides cannot hide or rename inherited fields.
 await request('/api/admin/products/'+productId,'PATCH',{enabledColorFields:[],fieldLabels:{[colorKey]:{label_ar:'خطأ',label_en:'Wrong',label_he:'שגוי'}}})
 const input={...customer,productId,parts:{[colorKey]:blue.hex},texts:{[textKey]:'MY LOGO'}}
 assert.equal((await request('/api/orders','POST',{...input,texts:{}})).status,400)
 assert.equal((await request('/api/orders','POST',{...input,parts:{[colorKey]:red.hex}})).status,400)
 const order=await request('/api/orders','POST',input);assert.equal(order.status,201)
 const saved=(await request('/api/admin/orders/'+order.body.id)).body;assert.equal(saved.details.parts[0].labels.ar,colorDetail.label_ar);assert.equal(saved.details.textLabels[textKey].en,textDetail.label_en)
 const productBefore=JSON.stringify(db.records.get('products/'+productId))
 assert.equal((await request('/api/admin/details/'+colorKey,'PATCH',{...colorDetail,label_ar:'لون جديد',colorHexes:[red.hex]})).status,200)
 const updated=(await request('/api/categories')).body.find(c=>c.id===category);assert.equal(updated.customization_fields[0].label_ar,'لون جديد')
 assert.equal(JSON.stringify(db.records.get('products/'+productId)),productBefore)
 assert.equal((await request('/api/orders','POST',input)).status,400)
 assert.equal((await request('/api/orders','POST',{...input,parts:{[colorKey]:red.hex}})).status,201)
 assert.equal((await request('/api/admin/orders/'+order.body.id)).body.details.parts[0].labels.ar,colorDetail.label_ar)
 assert.equal((await request('/api/admin/details/'+colorKey,'DELETE')).status,409)
 assert.equal((await request('/api/admin/details/'+colorKey,'PATCH',{...textDetail})).status,409)
 assert.equal((await request('/api/admin/categories/'+category,'PATCH',{...categoryInput,detailKeys:[]})).status,200)
 assert.equal((await request('/api/admin/details/'+colorKey,'DELETE')).status,200)
 assert.ok(!(await request('/api/admin/details')).body.some(f=>f.key===colorKey))
 assert.equal(db.records.get('products/7').slug,'fixture-wheel')
})

