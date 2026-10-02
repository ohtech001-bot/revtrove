import test from 'node:test'
import assert from 'node:assert/strict'
import { readFirebaseConfig, firebaseEnvKeys } from '../client/src/lib/firebase-config.mjs'
import {catalogAdditions,formatProductPrice} from '../shared/catalog-additions.mjs'
import { existsSync, readFileSync } from 'node:fs'
import {loopPhase} from '../shared/animation.mjs'

test('missing configuration does not initialize Firebase',()=>{
  assert.equal(readFirebaseConfig().configured,false)
  assert.equal(readFirebaseConfig().missing.length,6)
})
test('configuration is read only from Vite environment values',()=>{
  const env=Object.fromEntries(Object.values(firebaseEnvKeys).map(key=>[key,'unit-test-value']))
  assert.equal(readFirebaseConfig(env).configured,true)
  delete env.VITE_FIREBASE_APP_ID
  assert.deepEqual(readFirebaseConfig(env).missing,['VITE_FIREBASE_APP_ID'])
})
test('new products have complete photo galleries and no invented prices or models',()=>{
  assert.equal(new Set(catalogAdditions.map(p=>p.slug)).size,4)
  for (const p of catalogAdditions) {
    assert.equal(p.price,null)
    assert.deepEqual(p.model_parts,{})
    for(const image of p.images) assert.ok(existsSync(new URL('../client/public'+image,import.meta.url)),image)
  }
  assert.equal(formatProductPrice(null,'ar'),'السعر عند التأكيد')
  assert.equal(formatProductPrice(129),'₪129')
})
test('Firestore writes are denied and orders are not exposed',()=>{
  const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')
  assert.ok(!/allow\s+read\s*,\s*write\s*:\s*if\s+true/.test(rules))
  assert.match(rules,/allow read, write: if false/)
})
test('car animation never uses a negative waypoint index',()=>{
  for (const elapsed of [-100,-.1,0,36000,72001]) {
    const phase=loopPhase(elapsed,36000,13)
    assert.ok(phase>=0 && phase<13)
  }
})
