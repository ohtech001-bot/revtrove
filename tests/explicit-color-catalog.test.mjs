import test from 'node:test'
import assert from 'node:assert/strict'
import {readColorCatalog} from '../server/src/lib/color-catalog.js'
import {detailColorChoices} from '../shared/color-choices.mjs'
import {readFile} from 'node:fs/promises'

test('Only created active colors appear in the admin library; legacy records are not changed',async()=>{
 const legacy={hex:'#123456',name_ar:'قديم'},created={hex:'#abcdef',name_ar:'محفوظ'},deleted={hex:'#654321',name_ar:'محذوف'}
 const data={products:[{colors:[legacy]}],colorLibrary:[{color:created},{color:deleted,deleted:true}]}
 const before=JSON.stringify(data)
 const db={collection:name=>({limit:()=>({get:async()=>({size:data[name].length,docs:data[name].map(record=>({id:record.color?.hex.slice(1)||'7',get:key=>record[key]}))})})})}
 const result=await readColorCatalog(db)
 assert.deepEqual(result.colors,[created]);assert.ok(!result.all.some(c=>c.hex===legacy.hex))
 assert.ok(!result.all.some(c=>c.hex===deleted.hex));assert.equal(JSON.stringify(data),before)
 data.products=[];data.colorLibrary=[];assert.deepEqual((await readColorCatalog(db)).colors,[])
})
test('Product picker cannot offer unsaved palettes, deleted shades or implicit defaults',()=>{
 const created={hex:'#123456'},uncreated={hex:'#654321'}
 assert.deepEqual(detailColorChoices({allowed_colors:[created,uncreated]},[uncreated],[created]),[created])
 assert.deepEqual(detailColorChoices({},[uncreated],[created]),[created])
 assert.deepEqual(detailColorChoices({allowed_colors:[created]},[created],[]),[])
})
test('Product color library begins empty, not with preset swatches',async()=>{
 const src=await readFile(new URL('../client/src/ProductDetails.jsx',import.meta.url),'utf8')
 assert.ok(src.includes('[catalog,setCatalog]=useState([])'));assert.ok(!src.includes('availableColors()'))
})

