import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {getApps,deleteApp} from 'firebase-admin/app'
import {getAdminDb} from '../src/lib/firebase-admin.js'
import {configuredBlob} from '../src/lib/blob-provider.js'
import {createApp} from '../src/index.js'
import {checksum} from '../src/repositories/migrationSchema.js'
import {Timestamp} from 'firebase-admin/firestore'
import {signAdmin} from '../src/auth.js'
import {blobEnvironment,safeBlobError} from '../src/lib/blob-diagnostics.js'

if(!process.argv.includes('--apply')||process.argv[process.argv.indexOf('--project')+1]!=='revtrove-web')throw new Error('Use --project revtrove-web --apply to authorize temporary Storage writes')
const db=getAdminDb(),marker='storage-smoke-'+randomUUID()
const octets=marker.replaceAll('-','').slice(-4).match(/../g).map(value=>parseInt(value,16))
const testIp='198.18.'+octets.join('.') // Reserved benchmark range; no customer IP is used.
const normalize=value=>value instanceof Timestamp?value.toMillis():Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v)])):value
const baseline={},report={storageTest:'failed',testDataRemaining:false,environment:blobEnvironment()}
process.env.BLOB_DIAGNOSTICS='1' // Safe original SDK diagnostics in this opt-in test process only.
let operation='auth'
let server,claim,quotaId,request,blobProvider
try {
  assert.equal(db.projectId,'revtrove-web');assert.ok(!process.env.FIRESTORE_EMULATOR_HOST)
  if(!process.env.BLOB_STORE_ID)throw Object.assign(new Error(),{safeCode:'BLOB_STORE_ID_missing'})
  if(!process.env.VERCEL_OIDC_TOKEN)throw Object.assign(new Error(),{safeCode:'local_OIDC_missing_use_vercel_env_pull'})
  blobProvider=configuredBlob()
  for(const name of ['products','orders','adminUsers']) {const snap=await db.collection(name).get();baseline[name]=new Map(snap.docs.map(doc=>[doc.id,checksum(normalize(doc.data()))]))}
  assert.deepEqual(Object.fromEntries(Object.entries(baseline).map(([k,v])=>[k,v.size])),{products:4,orders:1,adminUsers:1})
  const admin=(await db.collection('adminUsers').doc([...baseline.adminUsers.keys()][0]).get()).data(),token=signAdmin(admin)
  const testHour=Math.floor(Date.now()/3600000)
  assert.ok(Date.now()%3600000<3550000) // Avoid quota cleanup crossing an hourly boundary.
  quotaId=createHash('sha256').update((process.env.JWT_SECRET||'')+testIp+testHour).digest('hex')
  assert.equal((await db.collection('uploadQuotas').doc(quotaId).get()).exists,false)
  server=createApp({db,serverless:true}).listen(0,'127.0.0.1')
  await new Promise(resolve=>server.once('listening',resolve))
  const base='http://127.0.0.1:'+server.address().port
  request=async(path,body,method='POST')=>{const response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Forwarded-For':testIp},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'API request failed'),{safeCode:data.error||'http_'+response.status,httpStatus:response.status});return data}
  const file=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+tmXkAAAAASUVORK5CYII=','base64')
  operation='upload'
  claim=await request('/api/uploads',{kind:'productImage',name:'test.png',size:file.length,contentType:'image/png'})
  const upload=await fetch(claim.url,{method:claim.method,headers:claim.headers,body:file});if(!upload.ok)throw Object.assign(new Error('Direct Blob PUT failed'),{httpStatus:upload.status})
  const done=await request('/api/uploads/'+claim.id+'/complete',{token:claim.token});assert.equal(done.url,'/api/files/'+claim.id)
  const stored=(await db.collection('uploadAssets').doc(claim.id).get()).data();assert.ok(stored.storagePath.startsWith('assets/'+claim.id+'/'))
  const unauthenticated=await fetch(stored.blobUrl);assert.ok([401,403,404].includes(unauthenticated.status));report.privateReadProtection='passed'
  operation='download'
  const preview=await request('/api/uploads/'+claim.id+'/preview',{token:claim.token})
  const response=await fetch(preview.url);if(!response.ok)throw Object.assign(new Error('Signed Blob GET failed'),{httpStatus:response.status});assert.ok(Buffer.from(await response.arrayBuffer()).equals(file))
  report.upload='passed';report.read='passed';report.referenceUpdated='passed';report.storageTest='passed'
}catch(error){report.error=error.safeCode||(['storage_configuration','storage_unavailable'].includes(error.code)?error.code:'storage_test_failed');report.diagnostic=error.storageDiagnostic||safeBlobError(error,operation);process.exitCode=1}
finally {
  try {
    if(claim){await request('/api/uploads/'+claim.id,{token:claim.token},'DELETE');assert.equal((await db.collection('uploadAssets').doc(claim.id).get()).exists,false);await assert.rejects(blobProvider.head('assets/'+claim.id+'/file.png'),error=>error.code==='not_found');report.delete='passed'}
    if(quotaId){const quota=db.collection('uploadQuotas').doc(quotaId);if((await quota.get()).exists)await quota.delete()}
  }catch(error){report.testDataRemaining=true;report.cleanup='failed';report.cleanupDiagnostic=error.storageDiagnostic||safeBlobError(error,'delete');process.exitCode=1}
  if(server)await new Promise(resolve=>server.close(resolve))
  if(Object.keys(baseline).length===3){let unchanged=true;report.counts={};for(const name of Object.keys(baseline)){const snap=await db.collection(name).get();report.counts[name]=snap.size;if(snap.size!==baseline[name].size)unchanged=false;for(const doc of snap.docs)if(baseline[name].get(doc.id)!==checksum(normalize(doc.data())))unchanged=false}report.originalDataUnchanged=unchanged;if(!unchanged)process.exitCode=1}
  await db.terminate();await Promise.all(getApps().map(deleteApp))
  console.log(JSON.stringify(report,null,2))
}
