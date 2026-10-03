import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import bcrypt from 'bcryptjs'
import {diagnoseAdminLogin,hiddenPassword} from '../server/scripts/check-admin-password.js'

const password='test-only-correct-password'
const hash=await bcrypt.hash(password,4)
const db=exists=>({collection:name=>{assert.equal(name,'adminUsers');return {doc:id=>{assert.equal(id,'1');return {get:async()=>({exists,get:key=>({email:'rev.trove.911@gmail.com',password_hash:hash})[key]})}}}}})
test('Password diagnostic reads exactly adminUsers/1 and never calls Production on mismatch or missing account',async()=>{
 const request=()=>{throw new Error('Must not send a login request')}
 assert.deepEqual(await diagnoseAdminLogin({db:db(true),password:'incorrect-test-password',request}),{adminFound:true,bcryptCompare:false})
 assert.deepEqual(await diagnoseAdminLogin({db:db(false),password,request}),{adminFound:false,bcryptCompare:false})
})
test('Matching password is tested once on the fixed HTTPS login endpoint without returning secrets',async()=>{
 let calls=0
 const result=await diagnoseAdminLogin({db:db(true),password,request:async(url,options)=>{
  calls++;assert.equal(url,'https://revtrove.vercel.app/api/admin/login');assert.equal(options.method,'POST');assert.equal(options.redirect,'error')
  assert.deepEqual(JSON.parse(options.body),{email:'rev.trove.911@gmail.com',password})
  return {status:200,ok:true,json:async()=>({token:'secret-test-token',admin:{email:'rev.trove.911@gmail.com'}})}
 }})
 assert.equal(calls,1);assert.deepEqual(result,{adminFound:true,bcryptCompare:true,httpStatus:200,tokenReturned:true,loginSucceeded:true})
 for(const secret of [password,hash,'secret-test-token'])assert.ok(!JSON.stringify(result).includes(secret))
})
test('Matching local password can still report a Production rejection safely',async()=>{
 const result=await diagnoseAdminLogin({db:db(true),password,request:async()=>({status:401,ok:false,json:async()=>({error:'invalid_credentials'})})})
 assert.deepEqual(result,{adminFound:true,bcryptCompare:true,httpStatus:401,tokenReturned:false,loginSucceeded:false})
})
function terminal(){const input=new EventEmitter();Object.assign(input,{isTTY:true,isRaw:false,setEncoding(){},setRawMode(v){this.isRaw=v},resume(){},pause(){this.paused=true}});const writes=[],output={write:value=>writes.push(value)};return {input,output,writes}}
test('Hidden input never echoes passwords and ignores fragmented bracketed paste markers',async()=>{
 const terminalMock=terminal(),pending=hiddenPassword(terminalMock)
 terminalMock.input.emit('data','\x1b[20');terminalMock.input.emit('data','0~test-secretX\b\x1b[201~\r')
 assert.equal(await pending,'test-secret');assert.equal(terminalMock.input.isRaw,false);assert.equal(terminalMock.input.listenerCount('data'),0)
 assert.ok(!terminalMock.writes.join('').includes('test-secret'))
})
test('Cancellation restores terminal mode and does not use password arguments',async()=>{
 const mock=terminal(),pending=hiddenPassword(mock);mock.input.emit('data','secret\u0003')
 await assert.rejects(pending,/input_cancelled/);assert.equal(mock.input.isRaw,false);assert.equal(mock.input.listenerCount('data'),0)
 await assert.rejects(hiddenPassword({input:{isTTY:false},output:mock.output}),/interactive_terminal_required/)
})
