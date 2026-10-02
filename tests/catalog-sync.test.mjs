import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {startCatalogSync} from '../client/src/lib/catalog-sync.mjs'

const settle=()=>new Promise(resolve=>setImmediate(resolve))
function browser(){
 const win=new EventTarget(),doc=new EventTarget(),markers=[]
 doc.hidden=false;win.crypto={randomUUID:()=>String(markers.length+1)}
 win.localStorage={setItem:(key,value)=>markers.push({key,value})}
 let timer;win.setInterval=fn=>{timer=fn;return 1};win.clearInterval=()=>{timer=null}
 return {win,doc,markers,tick:()=>timer?.(),storage(){const event=new Event('storage');event.key='revtrove-catalog-changed';win.dispatchEvent(event)}}
}
test('Saving refreshes the catalog and invalidates other tabs without sharing data or loops',async()=>{
 const b=browser();let reads=0
 const sync=startCatalogSync({...b,refresh:async()=>{reads++}})
 await settle();assert.equal(reads,1);assert.equal(b.markers.length,0)
 await sync.refresh();assert.equal(reads,2);assert.equal(b.markers.length,1)
 b.storage();await settle();assert.equal(reads,3);assert.equal(b.markers.length,1)
 sync.stop();b.storage();b.win.dispatchEvent(new Event('focus'));b.tick();await settle();assert.equal(reads,3)
})
test('Visible catalog polls and refetches on focus; hidden tabs do not poll',async()=>{
 const b=browser();let reads=0
 const sync=startCatalogSync({...b,refresh:async()=>{reads++}})
 await settle();b.doc.hidden=true;b.tick();await settle();assert.equal(reads,1)
 b.doc.hidden=false;b.doc.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal(reads,2)
 b.win.dispatchEvent(new Event('focus'));await settle();assert.equal(reads,3)
 b.tick();await settle();assert.equal(reads,4);assert.equal(b.markers.length,0);sync.stop()
})
test('Concurrent invalidations are serialized and a save awaits the newer refresh',async()=>{
 const b=browser();let release,reads=0,active=0,max=0
 const sync=startCatalogSync({...b,refresh:async()=>{reads++;max=Math.max(max,++active);if(reads===1)await new Promise(resolve=>{release=resolve});active--}})
 await settle();const saved=sync.refresh();b.storage();release();await saved
 assert.equal(reads,2);assert.equal(max,1);assert.equal(b.markers.length,1);sync.stop()
})
test('Failed refresh is retryable and does not announce a successful save',async()=>{
 const b=browser();let fail=false
 const sync=startCatalogSync({...b,refresh:async()=>{if(fail)throw Error('offline')}})
 await settle();fail=true;await assert.rejects(sync.refresh(),/offline/);assert.equal(b.markers.length,0)
 fail=false;await sync.refresh();assert.equal(b.markers.length,1);sync.stop()
})
test('App wires catalog invalidation to saved admin edits and bypasses stale GET cache',async()=>{
 const app=await readFile(new URL('../client/src/App.jsx',import.meta.url),'utf8')
 const inventory=await readFile(new URL('../client/src/AdminInventory.jsx',import.meta.url),'utf8')
 assert.ok(app.includes('startCatalogSync({refresh:fetchCatalog})'))
 for(const path of ['/api/products','/api/categories','/api/catalog/exclusions'])assert.ok(app.includes("api('"+path+"',{cache:'no-store'})"))
 assert.ok(inventory.includes('Promise.all([load(),refreshCatalog()])'))
})
