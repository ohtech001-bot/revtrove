import {head,issueSignedToken,presignUrl,BlobNotFoundError,BlobAccessError,BlobPreconditionFailedError,BlobFileTooLargeError,BlobContentTypeNotAllowedError} from '@vercel/blob'
import {safeBlobError} from './blob-diagnostics.js'

const fail=code=>{throw Object.assign(new Error(code),{code})}
export function configuredBlob({sdk={head,issueSignedToken,presignUrl}}={}) {
  const storeId=String(process.env.BLOB_STORE_ID||'').trim()
  if(!storeId)fail('storage_configuration')
  // SDK resolves/refreshes project OIDC on every call. Never capture or explicitly
  // pass VERCEL_OIDC_TOKEN: doing so bypasses its automatic refresh mechanism.
  // No read-write token is required or provisioned by this application.
  const guard=async(operation,step,action)=>{try{return await action()}catch(error){
    const diagnostic=error.storageDiagnostic||safeBlobError(error,operation,step)
    if(process.env.BLOB_DIAGNOSTICS==='1'&&!error.storageDiagnostic)console.error(JSON.stringify({blobDiagnostic:diagnostic}))
    let code='storage_unavailable'
    if(error instanceof BlobNotFoundError)code='not_found'
    else if(error instanceof BlobAccessError)code='storage_configuration'
    else if(error instanceof BlobPreconditionFailedError)code='upload_conflict'
    else if(error instanceof BlobFileTooLargeError||error instanceof BlobContentTypeNotAllowedError)code='invalid_upload'
    else if(['not_found','invalid_upload','upload_conflict','storage_configuration'].includes(error.code))code=error.code
    // Preserve exactly the previous public error mapping; attach safe server-only diagnostics.
    throw Object.assign(new Error(code),{code,storageDiagnostic:diagnostic})
  }}
  const sign=async(path,operation,expires,extra={})=>{
    const task=operation==='put'?'upload':operation==='delete'?'delete':'download'
    const material=await guard('auth','issueSignedToken',()=>sdk.issueSignedToken({storeId,pathname:path,operations:[operation],validUntil:expires,...(operation==='put'?{allowedContentTypes:extra.allowedContentTypes,maximumSizeInBytes:extra.maximumSizeInBytes}:{})}))
    const {presignedUrl}=await guard(task,'presignUrl',()=>sdk.presignUrl(material,{pathname:path,operation,access:'private',validUntil:expires,...extra}))
    return presignedUrl // Only one scoped URL leaves the backend, never signing material.
  }
  return {
    uploadUrl:(path,type,size,expires)=>sign(path,'put',expires,{allowedContentTypes:[type],maximumSizeInBytes:size,allowOverwrite:false,addRandomSuffix:false,cacheControlMaxAge:60}),
    head:path=>guard('download','head',()=>sdk.head(path,{storeId})),
    readUrl:(path,expires)=>sign(path,'get',expires,{useCache:false}),
    async header(path){return guard('download','header',async()=>{
      const url=await sign(path,'get',Date.now()+60000,{useCache:false})
      const response=await fetch(url,{headers:{Range:'bytes=0-15'},signal:AbortSignal.timeout(15000)})
      if(!response.ok)throw Object.assign(new Error(response.status===404?'not_found':'storage_unavailable'),{code:response.status===404?'not_found':'storage_unavailable',httpStatus:response.status})
      const reader=response.body.getReader(),chunks=[];let size=0
      try{while(size<16){const {done,value}=await reader.read();if(done)break;const part=value.subarray(0,16-size);chunks.push(part);size+=part.length}}
      finally{await reader.cancel()}
      return Buffer.concat(chunks)
    })},
    async remove(path,etag){return guard('delete','remove',async()=>{
      const url=await sign(path,'delete',Date.now()+60000,{ifMatch:etag})
      const response=await fetch(url,{method:'DELETE',signal:AbortSignal.timeout(15000)})
      if(response.status===404)return
      if(response.status===412)throw Object.assign(new Error('upload_conflict'),{code:'upload_conflict',httpStatus:412})
      if(!response.ok)throw Object.assign(new Error('storage_unavailable'),{code:'storage_unavailable',httpStatus:response.status})
    })},
  }
}
