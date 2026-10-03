import {getAdminApp,getAdminDb} from '../src/lib/firebase-admin.js'
import {createCategoryRepository} from '../src/repositories/categoryRepository.js'
import {listDetails} from '../src/lib/detail-library.js'
import {legacyProducts,legacyDefaultText} from './legacy-catalog.js'
import {categoryId} from '../../shared/catalog-categories.mjs'
import {FieldValue} from 'firebase-admin/firestore'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'

const args=process.argv.slice(2),project=args[args.indexOf('--project')+1],apply=args.includes('--apply')
if(!args.includes('--project')||project!==getAdminApp().options.projectId)throw Error('project_mismatch')
const db=getAdminDb(),names=['products','categories','detailLibrary','colorLibrary','catalogExclusions']
const snapshots=await Promise.all(names.map(n=>db.collection(n).get()))
const backup=Object.fromEntries(snapshots.map((snap,i)=>[names[i],snap.docs.map(d=>({documentId:d.id,data:d.data()}))]))
const hash=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex')
async function protectedHash(){const rows=[];for(const n of ['orders','adminUsers']){const snap=await db.collection(n).get();rows.push([n,snap.docs.map(d=>[d.id,d.data()])])}return hash(rows)}
const protectedBefore=await protectedHash()
const categories=await createCategoryRepository(db).list(),details=await listDetails(db)
const writes=[],existingProducts=backup.products.map(r=>r.data),excluded=new Set(backup.catalogExclusions.map(r=>r.documentId))
const existingDetails=new Set(backup.detailLibrary.map(r=>r.documentId)),existingCategories=new Set(backup.categories.map(r=>r.documentId))
for(const field of details)if(!existingDetails.has(field.key))writes.push({kind:'create',collection:'detailLibrary',id:field.key,data:{...field,deleted:false}})
for(const category of categories)if(!existingCategories.has(category.id)){
 const keys=details.filter(f=>existingProducts.filter(p=>categoryId(p.category)===category.id).some(p=>p.customizable_parts?.includes(f.key)||p.customizable_parts?.some(key=>f.key===key+'Text'))).map(f=>f.key)
 writes.push({kind:'create',collection:'categories',id:category.id,data:{id:category.id,name_ar:category.name_ar,name_en:category.name_en,name_he:category.name_he,detail_keys:keys,customization_fields:[],deleted:false}})
}
let nextId=Math.max(0,...existingProducts.map(p=>Number(p.id)))+1
for(const legacy of legacyProducts){
 const existing=existingProducts.find(p=>p.slug===legacy.slug)
 if(!existing){if(excluded.has(legacy.slug))continue;const id=nextId++;writes.push({kind:'create',collection:'products',id:String(id),data:{...legacy,id,category:categoryId(legacy.category),active:true,default_texts:legacyDefaultText[legacy.slug]||{},colors:[],field_options:{}}});continue}
 // Materialize the assets previously merged by the browser, without changing owner edits.
 const patch={},images=[...new Set([...(existing.images||[]),...(legacy.images||[])])],model_parts={...(legacy.model_parts||{}),...(existing.model_parts||{})}
 if(JSON.stringify(images)!==JSON.stringify(existing.images||[]))patch.images=images
 if(!isDeepStrictEqual(model_parts,existing.model_parts||{}))patch.model_parts=model_parts
 if(!existing.default_texts)patch.default_texts=legacyDefaultText[legacy.slug]||{}
 if(Object.keys(patch).length)writes.push({kind:'update',collection:'products',id:String(existing.id),data:patch,previousHash:hash(existing)})
}
let backupPath=null
if(apply&&writes.length){
 const directory=resolve('backups');await mkdir(directory,{recursive:true});backupPath=resolve(directory,'catalog-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');await writeFile(backupPath,JSON.stringify({project,createdAt:new Date().toISOString(),collections:backup},null,2),{flag:'wx'})
 await db.runTransaction(async tx=>{
  for(const write of writes){const ref=db.collection(write.collection).doc(write.id),snap=await tx.get(ref);if(write.kind==='create'&&snap.exists)throw Error('catalog_write_conflict:'+ref.path);if(write.kind==='update'&&(!snap.exists||hash(snap.data())!==write.previousHash))throw Error('catalog_write_conflict:'+ref.path);write.ref=ref}
  for(const write of writes){const data={...write.data,updated_at:FieldValue.serverTimestamp()};if(write.kind==='create')tx.create(write.ref,{...data,created_at:FieldValue.serverTimestamp()});else tx.update(write.ref,data)}
 })
}
const protectedUnchanged=protectedBefore===await protectedHash()
console.log(JSON.stringify({project,apply,backupPath,protectedUnchanged,changes:writes.map(w=>({operation:w.kind,collection:w.collection,id:w.id,slug:w.data.slug,fields:Object.keys(w.data)}))}))
if(!protectedUnchanged)process.exitCode=1
