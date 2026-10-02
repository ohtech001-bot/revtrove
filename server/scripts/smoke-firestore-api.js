import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {getApps,deleteApp} from 'firebase-admin/app'
import {Timestamp} from 'firebase-admin/firestore'
import {getAdminDb} from '../src/lib/firebase-admin.js'
import {createApp} from '../src/index.js'
import {signAdmin} from '../src/auth.js'
import {checksum} from '../src/repositories/migrationSchema.js'

const expectedProject=process.argv[process.argv.indexOf('--project')+1]
if(!process.argv.includes('--apply') || !process.argv.includes('--project'))throw new Error('Explicit --project and --apply are required for temporary API writes')
const db=getAdminDb(),marker='smoke-'+randomUUID(),slug=marker
const normalize=value=>value instanceof Timestamp?value.toMillis():Array.isArray(value)?value.map(normalize):value && typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v)])):value
let server,baseline
const report={smoke:'failed',originalDataUnchanged:false,testDataRemaining:true}
try {
  assert.equal(db.projectId,expectedProject)
  assert.ok(!process.env.FIRESTORE_EMULATOR_HOST)
  baseline={}
  for(const name of ['products','orders','adminUsers']) {
    const snap=await db.collection(name).get()
    baseline[name]=new Map(snap.docs.map(doc=>[doc.id,checksum(normalize(doc.data()))]))
  }
  assert.deepEqual(Object.fromEntries(Object.entries(baseline).map(([k,v])=>[k,v.size])),{products:4,orders:1,adminUsers:1})
  const admin=(await db.collection('adminUsers').doc([...baseline.adminUsers.keys()][0]).get()).data()
  let token=signAdmin(admin)
  // Real Firestore + real Express HTTP. Printing is entirely browser-side now.
  server=createApp({db}).listen(0,'127.0.0.1')
  await new Promise(resolve=>server.once('listening',resolve))
  const base='http://127.0.0.1:'+server.address().port+'/api'
  async function request(path,method='GET',body,expected=200) {
    const res=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
    const data=await res.json()
    if(res.status!==expected)throw Object.assign(new Error('api_smoke_failed'),{safeCode:data.error||'http_'+res.status})
    return data
  }
  const products=await request('/products');assert.equal(products.length,4)
  if(process.env.ADMIN_PASSWORD) {
    const login=await request('/admin/login','POST',{email:admin.email,password:process.env.ADMIN_PASSWORD})
    token=login.token;assert.ok(token);report.adminLogin='passed'
  } else {report.adminLogin='covered by isolated API tests; no local password provided'}
  const product=products[0]
  assert.equal((await request('/products/'+product.slug)).id,product.id)
  assert.equal((await request('/admin/products/'+product.id)).id,product.id)
  assert.ok((await request('/admin/me')).admin.email)
  // Ensure both list/index shapes work before creating anything.
  await request('/admin/orders')
  await request('/admin/orders?status=archived')
  const created=await request('/orders','POST',{customerName:'API smoke test',phone:'0500000000',countryCode:'+972',country:'Test',deliveryAddress:'Synthetic test address only',notes:marker,productId:product.id,quantity:1,parts:{}},201)
  const orderPath='/admin/orders/'+created.id
  const order=await request(orderPath);assert.equal(order.notes,marker)
  assert.equal(typeof order.id,'number');assert.ok(!('print_status' in order))
  await request(orderPath,'PATCH',{status:'awaiting_pickup'})
  assert.equal((await request(orderPath)).status,'awaiting_pickup')
  await request(orderPath,'PATCH',{status:'archived'})
  assert.equal((await request(orderPath)).status,'archived')
  const searched=await request('/admin/orders?status=archived&search='+encodeURIComponent(created.id))
  assert.equal(searched.length,1);assert.equal(searched[0].public_id,created.id)
  await request('/admin/products','POST',{slug,nameAr:'اختبار مؤقت',nameEn:'Temporary smoke product',nameHe:'בדיקה זמנית',price:12},201)
  const testProduct=await request('/products/'+slug)
  await request('/admin/products/'+testProduct.id,'PATCH',{price:14})
  assert.equal((await request('/products/'+slug)).price,'14.00')
  await request('/admin/products/'+testProduct.id,'DELETE')
  report.smoke='passed'
}catch(error){
  report.error=error.safeCode || (error.code==='ERR_ASSERTION'?'integrity_assertion_failed':'smoke_failed')
  process.exitCode=1
}finally {
  if(server)await new Promise(resolve=>server.close(resolve))
  try {
    if(!baseline)throw new Error('target_was_not_validated')
    // Only delete documents owned by this unique run. Never touch original IDs.
    for(const [name,key,value] of [['orders','notes',marker],['products','slug',slug]]) {
      const snap=await db.collection(name).where(key,'==',value).get()
      for(const doc of snap.docs) {
        assert.ok(!baseline?.[name]?.has(doc.id))
        await db.runTransaction(async tx=>{const latest=await tx.get(doc.ref);if(latest.exists && latest.get(key)===value)tx.delete(doc.ref)})
      }
    }
    const counts={};let unchanged=Boolean(baseline)
    for(const name of ['products','orders','adminUsers']) {
      const snap=await db.collection(name).get();counts[name]=snap.size
      if(snap.size!==baseline?.[name]?.size)unchanged=false
      for(const doc of snap.docs)if(baseline?.[name]?.get(doc.id)!==checksum(normalize(doc.data())))unchanged=false
    }
    report.counts=counts;report.originalDataUnchanged=unchanged
    report.testDataRemaining=false
    // Numeric sequences are operational metadata, not customer test records.
    // Keep them monotonic: rolling them back risks ID reuse during concurrent requests.
    if(!unchanged)process.exitCode=1
  }catch {report.cleanup='failed';process.exitCode=1}
  await db.terminate();await Promise.all(getApps().map(deleteApp))
  console.log(JSON.stringify(report,null,2))
}
