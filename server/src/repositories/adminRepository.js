import {safeId,guarded,FieldValue,toApi,repositoryError} from './common.js'
export function createAdminRepository(db) {
  const admins=db.collection('adminUsers')
  return {
    findByEmail(email) {return guarded(async()=>{const snap=await admins.where('email','==',email.toLowerCase()).limit(1).get();return snap.empty?null:toApi(snap.docs[0].data())})},
    getById(id) {return guarded(async()=>{const snap=await admins.doc(safeId(id)).get();return snap.exists?toApi(snap.data()):null})},
    changePassword:(id,expectedHash,newHash)=>guarded(()=>db.runTransaction(async tx=>{const ref=admins.doc(safeId(id)),snap=await tx.get(ref);if(!snap.exists)throw repositoryError('not_found');if(snap.get('password_hash')!==expectedHash)throw repositoryError('write_conflict');tx.update(ref,{password_hash:newHash,updated_at:FieldValue.serverTimestamp()})})),
    create(record) {return guarded(async()=>{await admins.doc(safeId(record.id)).create({...record,created_at:FieldValue.serverTimestamp()})})},
  }
}
