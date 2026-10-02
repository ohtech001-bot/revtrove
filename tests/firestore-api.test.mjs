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

function memoryDb() {
  const records=new Map();let lock=Promise.resolve()
  const stamp=value=>Object.fromEntries(Object.entries(value).map(([k,v])=>[k,v?.constructor?.name==='ServerTimestampTransform'?Timestamp.now():v]))
  function doc(path) {
    const snapshot=()=>({id:path.split('/').at(-1),exists:records.has(path),data:()=>records.get(path),get:k=>records.get(path)?.[k]})
    return {path,id:path.split('/').at(-1),get:async()=>snapshot(),create:async data=>{if(records.has(path))throw {code:6};records.set(path,stamp(data))},update:async data=>{if(!records.has(path))throw {code:5};records.set(path,{...records.get(path),...stamp(data)})},delete:async()=>records.delete(path)}
  }
  function collection(name,filters=[],sorts=[],size=Infinity,after=null) {
    const api={id:name,doc:id=>doc(name+'/'+id),where:(...f)=>collection(name,[...filters,f],sorts,size,after),orderBy:(key,direction='asc')=>collection(name,filters,[...sorts,[key,direction]],size,after),limit:n=>collection(name,filters,sorts,n,after),startAfter:(...v)=>collection(name,filters,sorts,size,v),
      async get() {
        let docs=[...records.keys()].filter(k=>k.startsWith(name+'/')).map(k=>({id:k.split('/').at(-1),data:()=>records.get(k),get:key=>records.get(k)?.[key]}))
        docs=docs.filter(d=>filters.every(([key,op,v])=>op==='=='?d.get(key)===v:op==='in'?v.includes(d.get(key)):false))
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
