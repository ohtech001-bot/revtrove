import {getAdminApp,getAdminDb} from '../src/lib/firebase-admin.js'
import {restoreColorLibrary} from '../src/lib/restore-color-library.js'
import {createHash} from 'node:crypto'

const args=process.argv.slice(2),project=args[args.indexOf('--project')+1]
if(!args.includes('--project')||project!==getAdminApp().options.projectId)throw Error('project_mismatch')
const db=getAdminDb(),apply=args.includes('--apply')
const protectedNames=['products','orders','adminUsers','detailLibrary','categories']
async function fingerprints(){
 const result={}
 for(const name of protectedNames){const snap=await db.collection(name).get();result[name]={count:snap.size,hash:createHash('sha256').update(JSON.stringify(snap.docs.map(d=>[d.id,d.data()]).sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex')}}
 return result
}
const before=await fingerprints(),result=await restoreColorLibrary(db,{apply}),after=await fingerprints()
const unchanged=JSON.stringify(before)===JSON.stringify(after)
console.log(JSON.stringify({project,apply,...result,originalDocumentsUnchanged:unchanged,counts:Object.fromEntries(Object.entries(after).map(([k,v])=>[k,v.count]))}))
if(!unchanged)process.exitCode=1
