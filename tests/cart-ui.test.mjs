import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {cartPayload,readCart,cartCopy} from '../client/src/lib/cart.js'
test('Cart restoration rejects invalid local data and stores product choices only',()=>{
 const item={id:'line',slug:'wheel',productId:7,quantity:2,parts:{rim:'#123456'},texts:{standText:'TEST'}}
 globalThis.localStorage={getItem:()=>JSON.stringify([item,{...item,quantity:0},null,{...item,parts:[]}])}
 assert.deepEqual(readCart(),[item]);assert.deepEqual(cartPayload(item),{productId:7,quantity:2,parts:item.parts,texts:item.texts})
 globalThis.localStorage={getItem:()=>'{broken'};assert.deepEqual(readCart(),[]);delete globalThis.localStorage
 assert.equal(cartCopy('ar').checkout,'إتمام الطلب');assert.ok(cartCopy('en').confirm);assert.ok(cartCopy('he').confirm)
})
test('Categories are separate and explicit removals require central confirmation',async()=>{
 const app=await readFile(new URL('../client/src/App.jsx',import.meta.url),'utf8')
 const inventory=await readFile(new URL('../client/src/AdminInventory.jsx',import.meta.url),'utf8')
 const fields=await readFile(new URL('../client/src/CategoryConfiguration.jsx',import.meta.url),'utf8')
 const colors=await readFile(new URL('../client/src/AdminColors.jsx',import.meta.url),'utf8')
 assert.ok(app.includes('path="/cart"'));assert.ok(app.includes('<AdminCategories'))
 assert.ok(app.includes('askConfirmation(c.confirm)'))
 assert.ok(inventory.includes("askConfirmation(c.remove+' — '+c.image"))
 assert.ok(fields.includes('await askConfirmation(c.remove'))
 assert.ok(!colors.includes('{c.original}<select'));assert.ok(!fields.includes('{c.default}<select'))
 const toolbar=inventory.slice(inventory.indexOf('export function AdminInventory'),inventory.indexOf('function ProductEditor'))
 assert.ok(!toolbar.includes('className="inventory-categories"'));assert.ok(!toolbar.includes('>{c.addCategory}</button>'))
})
