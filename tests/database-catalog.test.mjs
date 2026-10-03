import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createCategoryRepository} from '../server/src/repositories/categoryRepository.js'
import {listDetails} from '../server/src/lib/detail-library.js'
import {configurationFields} from '../shared/product-configuration.mjs'

function database(){
 const rows={categories:new Map(),detailLibrary:new Map(),products:new Map()}
 const snapshot=(id,data)=>({id,exists:!!data,data:()=>data,get:key=>data?.[key]})
 const collection=name=>({limit:()=>collection(name),get:async()=>({docs:[...rows[name]].map(([id,data])=>snapshot(id,data))}),doc:id=>({get:async()=>snapshot(id,rows[name].get(id))})})
 return {rows,collection}
}
test('Empty database returns no synthetic categories, details or customization parts',async()=>{
 const db=database()
 assert.deepEqual(await createCategoryRepository(db).list(),[])
 assert.deepEqual(await listDetails(db),[])
 assert.deepEqual(configurationFields(null,{customizable_parts:['rim','stand']}),[])
})
test('Category details always resolve current database definitions; removed definitions do not reappear from snapshots',async()=>{
 const db=database(),repository=createCategoryRepository(db)
 db.rows.detailLibrary.set('rim',{key:'rim',label_ar:'لون قديم',colorEnabled:true,textEnabled:false})
 db.rows.categories.set('wheel',{name_ar:'فئة حقيقية',detail_keys:['rim'],customization_fields:[{key:'rim',label_ar:'نسخة قديمة'}]})
 assert.equal((await repository.list())[0].customization_fields[0].label_ar,'لون قديم')
 db.rows.detailLibrary.set('rim',{key:'rim',label_ar:'لون جديد',colorEnabled:true,textEnabled:false})
 assert.equal((await repository.getById('wheel')).customization_fields[0].label_ar,'لون جديد')
 assert.equal((await listDetails(db))[0].label_ar,'لون جديد')
 db.rows.detailLibrary.set('rim',{key:'rim',deleted:true})
 assert.deepEqual((await repository.list())[0].customization_fields,[])
 assert.deepEqual(await listDetails(db),[])
 db.rows.categories.set('wheel',{deleted:true});assert.deepEqual(await repository.list(),[])
})
test('Live client and API never append built-in catalog data or generate definitions from product parts',async()=>{
 const app=await readFile(new URL('../client/src/App.jsx',import.meta.url),'utf8')
 const server=await readFile(new URL('../server/src/index.js',import.meta.url),'utf8')
 const categories=await readFile(new URL('../server/src/repositories/categoryRepository.js',import.meta.url),'utf8')
 const details=await readFile(new URL('../server/src/lib/detail-library.js',import.meta.url),'utf8')
 for(const text of [app,server,categories,details])for(const key of ['fallbackProducts','catalogAdditions','defaultCategories','addedTextDefaults'])assert.ok(!text.includes(key))
 assert.ok(app.includes('setProducts(items);setCategories(groups);setColorCatalog(palette)'))
 assert.ok(app.includes('useState([])'));assert.ok(app.includes('catalogError'))
 assert.ok(server.includes('res.json(items.map(mapProduct))'))
 assert.ok(!details.slice(details.indexOf('export async function listDetails'),details.indexOf('export async function categoryDetailFields')).includes("collection('products')"))
})
