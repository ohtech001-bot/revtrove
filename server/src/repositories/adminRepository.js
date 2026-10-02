import {safeId,guarded,FieldValue,toApi} from './common.js'
export function createAdminRepository(db) {
  const admins=db.collection('adminUsers')
  return {
    findByEmail(email) {return guarded(async()=>{const snap=await admins.where('email','==',email.toLowerCase()).limit(1).get();return snap.empty?null:toApi(snap.docs[0].data())})},
    getById(id) {return guarded(async()=>{const snap=await admins.doc(safeId(id)).get();return snap.exists?toApi(snap.data()):null})},
    create(record) {return guarded(async()=>{await admins.doc(safeId(record.id)).create({...record,created_at:FieldValue.serverTimestamp()})})},
  }
}
