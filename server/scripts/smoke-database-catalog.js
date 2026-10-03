import assert from 'node:assert/strict'
import {createApp} from '../src/index.js'
import {getAdminDb,getAdminApp} from '../src/lib/firebase-admin.js'
import {signAdmin} from '../src/auth.js'
import {createHash} from 'node:crypto'

if(getAdminApp().options.projectId!=='revtrove-web')throw Error('project_mismatch')
const db=getAdminDb(),names=['products','categories','detailLibrary','colorLibrary','orders','adminUsers']
async function fingerprint(){const rows=[];for(const name of names){const snap=await db.collection(name).get();rows.push([name,snap.docs.map(d=>[d.id,d.data()])])}return createHash('sha256').update(JSON.stringify(rows)).digest('hex')}
const before=await fingerprint(),account=await db.collection('adminUsers').limit(1).get()
assert.ok(!account.empty)
const admin=account.docs[0],token=signAdmin({id:admin.get('id')||admin.id,email:admin.get('email')})
const server=createApp({db,serverless:true}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve))
try{
 const base='http://127.0.0.1:'+server.address().port,results={}
 const read=async(path,authenticated=false)=>{const res=await fetch(base+path,{headers:authenticated?{Authorization:'Bearer '+token}:{}});assert.equal(res.status,200,path);const data=await res.json();results[path]=Array.isArray(data)?data.length:'passed';return data}
 await read('/api/health');const products=await read('/api/products'),adminProducts=await read('/api/admin/products',true)
 assert.deepEqual(products.map(p=>p.slug).sort(),adminProducts.filter(p=>p.active).map(p=>p.slug).sort())
 assert.ok(adminProducts.every(p=>p.id&&!p.catalogOnly))
 for(const p of products){const found=await read('/api/products/'+encodeURIComponent(p.slug));assert.equal(found.id,p.id);assert.deepEqual(found.images,p.images)}
 const categories=await read('/api/categories'),details=await read('/api/admin/details',true),colors=await read('/api/colors'),adminColors=await read('/api/admin/colors',true)
 assert.deepEqual(colors,adminColors)
 const keys=new Set(details.map(d=>d.key))
 for(const c of categories)for(const key of c.detail_keys||[])assert.ok(keys.has(key),'missing detail '+key)
 assert.equal(await fingerprint(),before)
 console.log(JSON.stringify({project:getAdminApp().options.projectId,readOnlySmoke:'passed',dataUnchanged:true,results}))
}finally{await new Promise(resolve=>server.close(resolve))}
