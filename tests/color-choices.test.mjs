import test from 'node:test'
import assert from 'node:assert/strict'
import {uniqueColors,detailColorChoices,supportColor} from '../shared/color-choices.mjs'
import {readFile} from 'node:fs/promises'
test('Color shades deduplicate case-insensitively while retaining different shades',()=>{
 const blue={hex:'#AABBCC',name_ar:'أزرق'},saved={hex:'#aabbcc',name_ar:'اسم محفوظ'},other={hex:'#aabbcd',name_ar:'درجة أخرى'}
 assert.deepEqual(uniqueColors([blue,saved,other]),[saved,other])
})
test('Detail colors are selectable before the product supports them; choosing adds only that shade',()=>{
 const blue={hex:'#123456',name_ar:'أزرق'},red={hex:'#654321',name_ar:'أحمر'}
 assert.deepEqual(detailColorChoices({allowed_colors:[blue,red]},[]),[blue,red])
 assert.deepEqual(supportColor([],blue),[blue])
 assert.deepEqual(supportColor([blue],{...blue,hex:'#123456'}),[blue])
 assert.deepEqual(detailColorChoices({allowed_colors:[]},[blue],[red]),[])
})
test('Color page manages colors only; product palette remains wired to save',async()=>{
 const page=await readFile(new URL('../client/src/AdminColors.jsx',import.meta.url),'utf8')
 const product=await readFile(new URL('../client/src/ProductDetails.jsx',import.meta.url),'utf8')
 const inventory=await readFile(new URL('../client/src/AdminInventory.jsx',import.meta.url),'utf8')
 const active=page.slice(page.indexOf('export function AdminColors'),page.indexOf('export function ProductColorAssignments'));assert.ok(active.includes('createOnly:true'));assert.ok(!active.includes('color-product-dropdown'))
 assert.ok(!active.includes('/api/admin/products'));assert.ok(!active.includes('onSubmit={save}'));assert.ok(active.includes('visibleColors('))
 assert.ok(page.includes('await askConfirmation(message)'));assert.ok(page.includes("method:'DELETE'"))
 assert.ok(product.includes('setColors(current=>chosen.reduce((list,color)=>supportColor(list,color),current))'))
 assert.ok(inventory.includes('colors={palette} setColors={setPalette} token={token}'))
})


