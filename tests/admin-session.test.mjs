import test from 'node:test'
import assert from 'node:assert/strict'
import {readAdminSession,saveAdminSession,clearAdminSession,tokenExpiry} from '../client/src/lib/admin-session.mjs'
import {recoveryEmail} from '../server/src/lib/password-recovery.js'
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}}
const token=exp=>'header.'+Buffer.from(JSON.stringify({exp})).toString('base64url')+'.signature'
test('Remember me persists only until token expiry; normal login is session-only',()=>{
 const oldLocal=globalThis.localStorage,oldSession=globalThis.sessionStorage
 globalThis.localStorage=storage();globalThis.sessionStorage=storage()
 try{
  const value=token(Math.floor(Date.now()/1000)+86400)
  saveAdminSession(value,true);assert.equal(localStorage.getItem('revtrove-admin-token'),value);assert.equal(readAdminSession(),value)
  saveAdminSession(value,false);assert.equal(localStorage.getItem('revtrove-admin-token'),null);assert.equal(sessionStorage.getItem('revtrove-admin-token'),value)
  saveAdminSession(token(1),true);assert.equal(readAdminSession(),'');assert.equal(localStorage.getItem('revtrove-admin-token'),null)
  assert.equal(tokenExpiry('malformed'),0);clearAdminSession()
 }finally{globalThis.localStorage=oldLocal;globalThis.sessionStorage=oldSession}
})
test('Recovery recipient is the store owner inbox, not a caller-selected destination',()=>assert.equal(recoveryEmail,'rev.trove.911@gmail.com'))
