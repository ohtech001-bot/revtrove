// Diagnostic only: no Firestore imports, no put/delete, and no uploaded files.
import 'dotenv/config'
import {configuredBlob} from '../src/lib/blob-provider.js'
import {blobEnvironment,safeBlobError} from '../src/lib/blob-diagnostics.js'
import {randomUUID} from 'node:crypto'
import {channel} from 'node:diagnostics_channel'

const report={environment:blobEnvironment(),operation:'auth',filesCreated:false,firestoreTouched:false,network:[]}
const originalFetch=globalThis.fetch
const httpChannel=channel('undici:request:headers')
const observeHttp=event=>{
  const status=event?.response?.statusCode
  if(Number.isInteger(status)&&status>=400)report.network.push(safeBlobError({name:'HttpError',httpStatus:status,message:'SDK HTTP request rejected'},'auth','SDK_HTTP'))
}
httpChannel.subscribe(observeHttp) // Observe status only: never headers, request body or URLs.
globalThis.fetch=async(input,options)=>{
  const response=await originalFetch(input,options)
  // Capture HTTP status/code before the SDK reduces it to a generic Error class.
  if(!response.ok){
    let body;try{body=await response.clone().json()}catch{}
    const error={name:'HttpError',httpStatus:response.status,code:body?.error?.code,message:body?.error?.message||'Remote HTTP request failed'}
    report.network.push(safeBlobError(error,'auth','SDK_HTTP'))
  }
  return response
}
try {
  // Same grant generation as uploads, but never use the URL to send any bytes.
  await configuredBlob().uploadUrl('diagnostics/'+randomUUID()+'/not-uploaded.png','image/png',16,Date.now()+60000)
  report.result='auth_and_presign_succeeded'
}catch(error){report.result='failed';report.error=error.storageDiagnostic||safeBlobError(error,'auth','configure');const observed=report.network.at(-1);if(report.error.httpStatus==null&&observed){report.error.httpStatus=observed.httpStatus;report.error.httpStatusSource='observedSDKResponse'}report.mappedErrorCode=error.code;process.exitCode=1}
finally{globalThis.fetch=originalFetch;httpChannel.unsubscribe(observeHttp);console.log(JSON.stringify(report,null,2))}
