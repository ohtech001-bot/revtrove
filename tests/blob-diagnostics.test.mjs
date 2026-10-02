import test from 'node:test'
import assert from 'node:assert/strict'
import {safeBlobError,blobEnvironment} from '../server/src/lib/blob-diagnostics.js'
import {configuredBlob} from '../server/src/lib/blob-provider.js'

test('Blob diagnostics preserve useful fields while redacting env credentials, URLs and tokens',()=>{
  const key='DIAGNOSTIC_TEST_SECRET',previous=process.env[key];process.env[key]='test-secret-value-should-never-leak'
  try {
    const error=Object.assign(new Error('OIDC not enabled for development '+process.env[key]+' https://example.test/?token=abcd Bearer confidential eyJhbGciOiJIUzI1NiJ9.eyJzZWNyZXQiOiJoaWRkZW4ifQ.signature'),{name:'BlobError',code:'oidc_environment_not_allowed',status:403})
    const result=safeBlobError(error,'auth','issueSignedToken')
    assert.equal(result.httpStatus,403);assert.equal(result.name,'BlobError');assert.equal(result.code,'oidc_environment_not_allowed')
    assert.match(result.message,/development/)
    for(const secret of [process.env[key],'https://example.test','confidential','eyJhbGci'])assert.ok(!JSON.stringify(result).includes(secret))
    assert.ok(Object.values(blobEnvironment()).every(value=>typeof value==='boolean'))
  }finally{if(previous===undefined)delete process.env[key];else process.env[key]=previous}
})

test('Blob public error mapping is unchanged and original SDK failure survives as sanitized diagnostic',async()=>{
  const previous=process.env.BLOB_STORE_ID;process.env.BLOB_STORE_ID='store_unit-test'
  try {
    const sdk={issueSignedToken:async()=>{throw Object.assign(new Error('OIDC is enabled for this project, but not for the development environment.'),{code:'oidc_environment_not_allowed',statusCode:403})}}
    await assert.rejects(configuredBlob({sdk}).uploadUrl('unit.png','image/png',16,Date.now()+60000),error=>{
      assert.equal(error.code,'storage_unavailable');assert.equal(error.storageDiagnostic.operation,'auth');assert.equal(error.storageDiagnostic.step,'issueSignedToken');assert.equal(error.storageDiagnostic.httpStatus,403);assert.match(error.storageDiagnostic.message,/development/);return true
    })
  }finally{if(previous===undefined)delete process.env.BLOB_STORE_ID;else process.env.BLOB_STORE_ID=previous}
})
