import test from 'node:test'
import assert from 'node:assert/strict'
import {lockPageScroll} from '../client/src/lib/scroll-lock.mjs'
import {readFile} from 'node:fs/promises'
import postcss from 'postcss'

test('Editor closing before its confirmation dialog cannot leave the page scroll locked',()=>{
 const body={style:{overflow:''}},closeEditor=lockPageScroll(body),closeMessage=lockPageScroll(body)
 assert.equal(body.style.overflow,'hidden');closeEditor();assert.equal(body.style.overflow,'hidden')
 closeMessage();assert.equal(body.style.overflow,'');closeMessage();assert.equal(body.style.overflow,'')
})
test('Scroll owners can close in reverse order and a new page lock works afterwards',()=>{
 const body={style:{overflow:'auto'}},first=lockPageScroll(body),second=lockPageScroll(body)
 second();assert.equal(body.style.overflow,'hidden');first();assert.equal(body.style.overflow,'auto')
 const third=lockPageScroll(body);third();assert.equal(body.style.overflow,'auto')
})
test('Long dialogs, navigation and palettes have their own screen-only vertical scrolling',async()=>{
 const src=await readFile(new URL('../client/src/scrolling.css',import.meta.url),'utf8')
 const root=postcss.parse(src);root.each(node=>{if(node.type!=='comment')assert.equal(node.name,'media')})
 assert.ok(src.includes('overflow-y:auto'));assert.ok(src.includes('100dvh - 32px'))
 assert.ok(src.includes('.header>.nav'));assert.ok(src.includes('.bulk-color-options'))
 assert.ok(src.includes('overflow-x:clip;overflow-y:visible'))
 const inventory=await readFile(new URL('../client/src/AdminInventory.jsx',import.meta.url),'utf8')
 const messages=await readFile(new URL('../client/src/lib/site-dialogs.js',import.meta.url),'utf8')
 assert.ok(inventory.includes('const unlock=lockPageScroll()'));assert.ok(messages.includes('unlock=lockPageScroll()'))
 assert.ok(!messages.includes('document.body.style.overflow=scroll'))
})
