import test from 'node:test'
import assert from 'node:assert/strict'
import {sameCatalogColor,unassignedDetailColors} from '../shared/color-choices.mjs'
import {readFile} from 'node:fs/promises'

test('Add colors excludes stored white/black aliases just as the Colors page groups their names',()=>{
 const black={hex:'#101114',name_ar:'اسود'},blackAlias={hex:'#000000',name_ar:'أسود'}
 const white={hex:'#f4f4ef',name_ar:'ابيض'},whiteAlias={hex:'#f5f5f5',name_ar:'أَبْيَض'}
 const blue={hex:'#003cf0',name_ar:'ازرق'},light={hex:'#42a5e8',name_ar:'ازرق فاتح'},dark={hex:'#174db8',name_ar:'ازرق غامق'}
 const chosen=[black,white,light,dark],before=JSON.stringify(chosen)
 assert.deepEqual(unassignedDetailColors([...chosen,blackAlias,whiteAlias,blue],chosen),[blue])
 assert.equal(JSON.stringify(chosen),before)
 assert.equal(sameCatalogColor(black,blackAlias),true)
 assert.equal(sameCatalogColor(blue,dark),false)
})
test('Hexes compare case-insensitively; differently named shades remain selectable and assignments stay per detail',()=>{
 const first={hex:'#ABCDEF',name_ar:'لون'},sameHex={hex:'#abcdef',name_ar:'اسم قديم'},another={hex:'#654321',name_ar:'لون مختلف'}
 assert.deepEqual(unassignedDetailColors([sameHex,another],[first]),[another])
 assert.deepEqual(unassignedDetailColors([first],[]),[{...first,hex:'#abcdef'}])
 assert.equal(sameCatalogColor({hex:'#123456'},{hex:'#654321'}),false)
})
test('A saved color or alias is also excluded when applying a stale multi-select draft',()=>{
 const saved={hex:'#000000',name_ar:'أسود'},alias={hex:'#101114',name_ar:'اسود'},newColor={hex:'#123456',name_ar:'جديد'}
 const draft=[alias.hex,newColor.hex]
 const chosen=unassignedDetailColors([saved,alias,newColor],[saved]).filter(c=>draft.includes(c.hex))
 assert.deepEqual(chosen,[newColor])
})
test('Product picker and apply use the same unassigned-detail comparison',async()=>{
 const src=await readFile(new URL('../client/src/ProductDetails.jsx',import.meta.url),'utf8')
 assert.ok(src.includes('available=unassignedDetailColors(allowed,selected)'))
 assert.ok(src.includes('unassignedDetailColors(allowed,current).filter(c=>draft.includes(c.hex))'))
 assert.ok(src.includes('...current,...chosen'))
})
