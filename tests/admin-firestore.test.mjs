import test from 'node:test'
import assert from 'node:assert/strict'
import {generateKeyPairSync} from 'node:crypto'
import {readAdminConfig} from '../server/src/lib/admin-config.js'
import {schema,checksum,normalizeRow,validateBackup,firestoreData} from '../server/src/repositories/migrationSchema.js'
import {createMigrationRepository} from '../server/src/repositories/migrationRepository.js'
import {createProductRepository} from '../server/src/repositories/productRepository.js'

test('Admin never falls back to VITE credentials',()=>{
  const result=readAdminConfig({VITE_FIREBASE_PROJECT_ID:'test-only'})
  assert.equal(result.configured,false)
  assert.equal(result.missing.length,3)
})
test('private key handles escaped and real line breaks without logging it',()=>{
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}})
  const env={FIREBASE_PROJECT_ID:'unit-test-project',FIREBASE_CLIENT_EMAIL:'test@unit-test-project.iam.gserviceaccount.com',FIREBASE_PRIVATE_KEY:privateKey.replace(/\n/g,'\\n')}
  assert.ok(readAdminConfig(env).credential.privateKey===privateKey.trim(),'escaped PEM normalization failed')
  assert.ok(readAdminConfig({...env,FIREBASE_PRIVATE_KEY:privateKey}).credential.privateKey===privateKey.trim(),'multiline PEM normalization failed')
  assert.throws(()=>readAdminConfig({...env,FIREBASE_PRIVATE_KEY:'invalid'}),/credentials_invalid/)
})
const row={id:7,email:'test@example.invalid',password_hash:'test-only-hash',created_at:'2026-01-01T00:00:00.000Z'}
test('normalization keeps MySQL IDs and fields, rejects schema drift',()=>{
  assert.equal(normalizeRow('admin_users',row).id,'7')
  assert.equal(normalizeRow('admin_users',row).data.password_hash,row.password_hash)
  assert.throws(()=>normalizeRow('admin_users',{...row,unknown:'x'}),/schema_mismatch/)
  assert.throws(()=>normalizeRow('admin_users',{...row,id:'a/b'}),/invalid_document_id/)
  assert.equal(checksum({a:1,b:2}),checksum({b:2,a:1}))
})
test('products/orders retain JSON, decimal values and large MySQL IDs',()=>{
  const product=Object.fromEntries(schema.products.fields.map(key=>[key,null]))
  Object.assign(product,{id:7,slug:'fixture-product',images:'["/fixture.jpg"]',model_parts:'{}',customizable_parts:'["rim"]',active:1,price:'129.00',created_at:row.created_at,updated_at:row.created_at})
  const p=normalizeRow('products',product)
  assert.equal(p.data.price,'129.00');assert.equal(p.data.active,true);assert.deepEqual(p.data.images,['/fixture.jpg'])
  const order=Object.fromEntries(schema.orders.fields.map(key=>[key,null]))
  Object.assign(order,{id:'18446744073709551614',public_id:'REV-TEST',details:'{"quantity":1}',created_at:row.created_at,updated_at:row.created_at})
  const o=normalizeRow('orders',order)
  assert.equal(o.id,'REV-TEST');assert.equal(o.data.id,order.id);assert.deepEqual(o.data.details,{quantity:1})
})
test('migration preserves nullable dates/booleans and nested JSON types',async()=>{
  const product=Object.fromEntries(schema.products.fields.map(key=>[key,null]))
  Object.assign(product,{id:9,images:'[]',model_parts:'{"value":null,"enabled":false,"number":1.5,"list":[null,true,2]}',customizable_parts:'[]',active:null})
  const normalized=normalizeRow('products',product),converted=firestoreData('products',normalized.data)
  assert.equal(converted.active,null);assert.equal(converted.created_at,null);assert.equal(converted.updated_at,null)
  assert.deepEqual(converted.model_parts,{value:null,enabled:false,number:1.5,list:[null,true,2]})
  const repo=createMigrationRepository(memoryDb())
  assert.equal(await repo.importRow('products',normalized,'test-only'),'created')
  assert.equal(await repo.importRow('products',normalized,'test-only'),'skipped')
  assert.throws(()=>normalizeRow('products',{...product,active:2}),/invalid_mysql_boolean/)
  for(const active of [0,1,false,true,'0','1'])assert.equal(normalizeRow('products',{...product,active}).data.active,Boolean(Number(active)))
})
test('timestamp conversion preserves the instant including timezone offsets',()=>{
  const source={...row,created_at:'2026-10-02T03:04:05.123+03:00'}
  const normalized=normalizeRow('admin_users',source)
  assert.equal(normalized.data.created_at,'2026-10-02T00:04:05.123Z')
  assert.equal(firestoreData('admin_users',normalized.data).created_at.toDate().getTime(),new Date(source.created_at).getTime())
})
test('backup validation rejects missing counts, tampering and duplicate IDs',()=>{
  const tables=Object.fromEntries(Object.entries(schema).map(([name,spec])=>[name,{columns:spec.fields,rows:name==='admin_users'?[row]:[],count:name==='admin_users'?1:0}]))
  const valid={version:1,sourceDatabase:'test-only',tables,digest:checksum(tables)}
  assert.equal(validateBackup(valid),valid)
  assert.throws(()=>validateBackup({...valid,digest:'changed'}),/digest/)
  const dup=structuredClone(tables);dup.admin_users.rows.push(row);dup.admin_users.count=2
  assert.throws(()=>validateBackup({...valid,tables:dup,digest:checksum(dup)}),/duplicate_source_id/)
})
function memoryDb() {
  const documents=new Map()
  const doc=key=>({id:key.split('/').at(-1),get:async()=>({exists:documents.has(key),data:()=>structuredCloneWithTimestamp(documents.get(key))}),key})
  const structuredCloneWithTimestamp=value=>value?{...value,_migration:{...value._migration}}:value
  return {documents,collection:name=>({doc:id=>doc(name+'/'+id),count:()=>({get:async()=>({data:()=>({count:[...documents.keys()].filter(k=>k.startsWith(name+'/')).length})})})}),runTransaction:async action=>action({get:ref=>ref.get(),create:(ref,data)=>{assert.equal(documents.has(ref.key),false);documents.set(ref.key,data)}})}
}
test('migration rerun skips records, never duplicates or overwrites changed data',async()=>{
  const db=memoryDb(),repo=createMigrationRepository(db),normalized=normalizeRow('admin_users',row)
  assert.equal(await repo.importRow('admin_users',normalized,'test-only'),'created')
  assert.equal(await repo.importRow('admin_users',normalized,'test-only'),'skipped')
  assert.equal(db.documents.size,1)
  assert.equal(await repo.verify('admin_users',[row],'test-only'),1)
  db.documents.get('adminUsers/7').email='changed@example.invalid'
  await assert.rejects(repo.importRow('admin_users',normalized,'test-only'),/conflict/)
  assert.equal(db.documents.get('adminUsers/7').email,'changed@example.invalid')
})
test('repository maps timestamps to API-compatible ISO strings',async()=>{
  const db=memoryDb(),repo=createMigrationRepository(db)
  // Product lookup conversion uses the same Timestamp representation as migration.
  const admin=normalizeRow('admin_users',row)
  await repo.importRow('admin_users',admin,'test-only')
  db.documents.set('products/7',db.documents.get('adminUsers/7'))
  const product=await createProductRepository(db).getById(7)
  assert.equal(product.created_at,row.created_at)
  assert.ok(!('_migration' in product))
})
