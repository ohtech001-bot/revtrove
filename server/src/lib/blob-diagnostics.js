export const blobEnvironment=()=>Object.fromEntries(['BLOB_STORE_ID','VERCEL_OIDC_TOKEN','BLOB_WEBHOOK_PUBLIC_KEY'].map(key=>[key,Boolean(process.env[key]?.trim())]))

export function safeBlobMessage(value) {
  let message=typeof value==='string'?value.slice(0,8000):'No safe error message available'
  // Redact actual credentials, their JSON-escaped variants and the requested env values.
  for(const [key,secret] of Object.entries(process.env))if(secret&&(/TOKEN|SECRET|PASSWORD|PRIVATE_KEY|API_KEY/.test(key)||['BLOB_STORE_ID','BLOB_WEBHOOK_PUBLIC_KEY'].includes(key))) {
    for(const variant of [secret,JSON.stringify(secret).slice(1,-1)])message=message.split(variant).join('[redacted]')
  }
  return message.replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g,'[redacted-key]')
    .replace(/https?:\/\/[^\s<>"']+/gi,'[redacted-url]')
    .replace(/\bBearer\s+\S+/gi,'Bearer [redacted]')
    .replace(/\b[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\b/g,'[redacted-token]')
    .replace(/((?:token|secret|password|authorization|signature|credential)\s*[=:]\s*)[^\s,;]+/gi,'$1[redacted]')
    .replace(/[A-Za-z0-9_+/=-]{40,}/g,'[redacted-opaque-value]')
    .replace(/[\r\n\t]/g,' ').slice(0,700)
}
const atom=value=>{if(value==null)return null;const safe=safeBlobMessage(String(value));return /^[A-Za-z0-9_-]{1,96}$/.test(safe)?safe:null}
export function safeBlobError(error,operation,step) {
  const statuses=[error?.httpStatus,error?.status,error?.statusCode,error?.response?.status,error?.cause?.status]
  const httpStatus=statuses.find(value=>Number.isInteger(value)&&value>=100&&value<=599)??null
  return {operation: ['upload','download','delete','auth'].includes(operation)?operation:'auth',...(step?{step:atom(step)}:{}),name:atom(error?.name)||'Error',...(error?.constructor?.name?{errorType:atom(error.constructor.name)}:{}),code:atom(error?.code??error?.cause?.code),httpStatus,message:safeBlobMessage(error?.message)}
}
