import { FieldValue, Timestamp } from 'firebase-admin/firestore'
export { FieldValue, Timestamp }
export function safeId(value) {
  const id=String(value ?? '')
  if (!id || id.includes('/') || id==='.' || id==='..' || Buffer.byteLength(id)>1500) {const error=repositoryError('invalid_data');error.message='invalid_document_id';throw error}
  return id
}
export function pageSize(value=100) {
  if (!Number.isInteger(value) || value<1 || value>500) throw new Error('invalid_page_size')
  return value
}
export function toApi(record) {
  if (!record) return null
  return Object.fromEntries(Object.entries(record).filter(([key])=>key!=='_migration').map(([key,value])=>[key,key==='active' && typeof value==='boolean' ? Number(value) : value instanceof Timestamp ? value.toDate().toISOString() : value]))
}
export function repositoryError(code) {const error=new Error(code);error.code=code;return error}
export function decimal(value) {if(value==null)return null;const number=Number(value);if(!Number.isFinite(number)||number<0||number>99999999.99)throw repositoryError('invalid_data');return number.toFixed(2)}
export async function nextId(tx,collection,db) {
  const ref=db.collection('internalSequences').doc(collection.id)
  const sequence=await tx.get(ref)
  const snap=await tx.get(collection.orderBy('id','desc').limit(1))
  const id=Math.max(Number(sequence.data()?.value || 0),Number(snap.docs[0]?.get('id') || 0))+1
  if(!Number.isSafeInteger(id))throw repositoryError('invalid_data')
  return {id,ref}
}
export async function guarded(operation) {
  try { return await operation() } catch (error) {
    // Firebase errors can contain request context; don't forward raw messages.
    const safe=new Error('firestore_operation_failed')
    const codes={5:'not_found',6:'write_conflict',10:'write_conflict',3:'invalid_data',7:'firestore_permission',9:'firestore_configuration',16:'firestore_permission',14:'firestore_unavailable'}
    safe.code=codes[error.code] || (['not_found','write_conflict','invalid_data','invalid_upload','upload_forbidden','upload_conflict','storage_configuration'].includes(error.code)?error.code:'repository_error')
    throw safe
  }
}
