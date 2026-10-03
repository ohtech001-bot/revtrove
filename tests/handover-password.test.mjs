import test from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import {readFileSync} from 'node:fs'
import {validateHandoverPassword,setExistingAdminPassword} from '../server/scripts/set-admin-password.js'

test('Handover password validates strength and confirmation',()=>{
 assert.throws(()=>validateHandoverPassword('short','short'))
 assert.throws(()=>validateHandoverPassword('new-test-password','another-password'))
 assert.throws(()=>validateHandoverPassword('א'.repeat(40),'א'.repeat(40)))
 assert.doesNotThrow(()=>validateHandoverPassword('12345678','12345678'))
 assert.throws(()=>validateHandoverPassword('1234567','1234567'))
})
test('Handover updates only the existing account password and revokes sessions',async()=>{
 const record={email:'owner@example.invalid',password_hash:'original',session_version:2},ref={path:'adminUsers/1'}
 const db={runTransaction:fn=>fn({get:async()=>({exists:true,get:key=>record[key]}),update:(target,values)=>{assert.equal(target,ref);Object.assign(record,values)}})}
 await setExistingAdminPassword(db,ref,'original','new-test-password')
 assert.equal(record.email,'owner@example.invalid');assert.equal(record.session_version,3)
 assert.equal(await bcrypt.compare('new-test-password',record.password_hash),true)
 const hash=record.password_hash
 await assert.rejects(setExistingAdminPassword(db,ref,'original','other-test-password'),/concurrently/)
 assert.equal(record.password_hash,hash)
})
test('Initial setup no longer supplies a built-in password',()=>{
 const source=readFileSync(new URL('../server/src/init-db.js',import.meta.url),'utf8')
 assert.ok(!source.includes("process.env.ADMIN_PASSWORD || 'ChangeMe123!'"))
 const env=readFileSync(new URL('../.env.example',import.meta.url),'utf8')
 assert.ok(!env.includes('ADMIN_PASSWORD=ChangeMe123!'))
})

