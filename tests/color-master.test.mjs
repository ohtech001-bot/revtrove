import test from 'node:test'
import assert from 'node:assert/strict'
import {restorationPlan,restoreColorLibrary} from '../server/src/lib/restore-color-library.js'
import {readColorCatalog} from '../server/src/lib/color-catalog.js'
const blue={hex:'#123456',name_ar:'أزرق',name_en:'Blue',name_he:'כחול'}
const red={hex:'#654321',name_ar:'أحمر',name_en:'Red',name_he:'אדום'}

test('Restoration gathers stored product, field and category colors once, never recreates tombstones',()=>{
 const plan=restorationPlan({products:[{colors:[blue],field_options:{rim:{colors:[blue,red]}}}],details:[{allowed_colors:[red]}],categories:[{customization_fields:[{allowed_colors:[blue]}]}],library:[{id:'654321',deleted:true}]})
 assert.deepEqual(plan.create,[blue]);assert.equal(plan.skipped,1)
 assert.deepEqual(restorationPlan({products:[{colors:[blue]}],library:[{id:'123456',color:{...blue,name_ar:'اسم معدل'}}]}).create,[])
 assert.throws(()=>restorationPlan({products:[{colors:[{hex:'#abcdef'}]}]}),/color_labels_missing/)
})
test('Color restoration persists references create-only, reruns safely and catalog reads only database entries',async()=>{
 const data={products:new Map([['7',{colors:[blue],field_options:{rim:{colors:[red]}}}]]),detailLibrary:new Map(),categories:new Map(),colorLibrary:new Map()}
 const before=JSON.stringify([...data.products]);const snap=(id,record)=>({id,exists:!!record,data:()=>record,get:k=>record?.[k]})
 const collection=name=>({doc:id=>({name,id,get:async()=>snap(id,data[name].get(id))}),limit:()=>collection(name),get:async()=>({size:data[name].size,docs:[...data[name]].map(([id,record])=>snap(id,record))})})
 const db={collection,runTransaction:async fn=>{const writes=[];const result=await fn({get:ref=>ref.get(),create:(ref,record)=>writes.push(()=>{assert.ok(!data[ref.name].has(ref.id));data[ref.name].set(ref.id,record)})});writes.forEach(fn=>fn());return result}}
 const dry=await restoreColorLibrary(db);assert.equal(dry.planned,2);assert.equal(data.colorLibrary.size,0)
 assert.equal((await readColorCatalog(db)).colors.length,0)
 const applied=await restoreColorLibrary(db,{apply:true});assert.equal(applied.created,2)
 assert.equal((await readColorCatalog(db)).colors.length,2)
 const record=data.colorLibrary.get('123456');assert.equal(record.deleted,false)
 assert.equal((await restoreColorLibrary(db,{apply:true})).created,0);assert.equal(data.colorLibrary.get('123456'),record)
 assert.equal(JSON.stringify([...data.products]),before)
})

test('Existing shade references are retained in the database even when names are grouped in the color page',async()=>{
 const alias={...blue,hex:'#234567'}
 const records=[{id:'123456',color:blue},{id:'234567',color:alias}]
 const db={collection:()=>({limit:()=>({get:async()=>({size:2,docs:records.map(record=>({id:record.id,get:k=>record[k]}))})})})}
 const catalog=await readColorCatalog(db)
 assert.equal(catalog.all.length,2);assert.equal(catalog.colors.length,1)
 assert.deepEqual(restorationPlan({products:[{colors:[blue,alias]}],library:records}).create,[])
})

