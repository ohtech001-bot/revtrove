import { getAdminDb } from '../src/lib/firebase-admin.js'
import { getApps, deleteApp } from 'firebase-admin/app'
import { randomUUID } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
let db,timer,probe,temporaryCollection,runId
let failed=false
try {
  db=getAdminDb()
  // An authenticated server read also succeeds for a nonexistent document.
  // No test documents or personal data are written, read or printed.
  await Promise.race([db.doc('health/connection').get(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('connection_timeout')),12000)})])
  console.log('Firebase Admin: authenticated Firestore read succeeded; no writes performed.')
  if(process.argv.includes('--crud')) {
    if(process.env.FIRESTORE_EMULATOR_HOST)throw new Error('emulator_not_allowed')
    runId=randomUUID()
    temporaryCollection=db.collection('_connectionCheck_'+runId.replaceAll('-',''))
    if(!(await temporaryCollection.limit(1).get()).empty)throw new Error('temporary_collection_not_empty')
    probe=temporaryCollection.doc('probe')
    await probe.create({runId,testOnly:true,number:7,nullable:null,array:[true,3,null],json:{label:'connection-test'},createdAt:FieldValue.serverTimestamp()})
    const first=await probe.get(),data=first.data()
    if(!first.exists || data.runId!==runId || data.nullable!==null || data.number!==7 || data.array.length!==3 || !(data.createdAt instanceof Timestamp))throw new Error('temporary_read_verification_failed')
    await probe.update({number:8,updatedAt:FieldValue.serverTimestamp()},{lastUpdateTime:first.updateTime})
    const updated=await probe.get()
    if(updated.get('number')!==8 || !(updated.get('updatedAt') instanceof Timestamp))throw new Error('temporary_update_verification_failed')
    console.log('Firestore temporary create/read/update: succeeded.')
  }
} catch(error) {
  const code=String(error.code || '').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,50)
  console.error(error.message.startsWith('firebase_admin_missing_env:')?error.message:'Firebase Admin check failed ('+(code || 'configuration_or_connection_error')+')')
  process.exitCode=1
  failed=true
} finally {
  clearTimeout(timer)
  if(probe) {
    try {
      const remaining=await probe.get()
      if(remaining.exists) {
        if(remaining.get('runId')!==runId)throw new Error('temporary_document_ownership_changed')
        await probe.delete({lastUpdateTime:remaining.updateTime})
      }
      const empty=(await temporaryCollection.limit(1).get()).empty
      if(!empty || (await probe.get()).exists)throw new Error('temporary_cleanup_not_verified')
      console.log('Firestore temporary delete: succeeded; temporary collection is empty.')
    } catch {
      console.error('Temporary cleanup NOT verified. Inspect the run-specific collection manually; no unrelated data was deleted.')
      process.exitCode=1
      failed=true
    }
  }
  if(process.argv.includes('--crud'))console.log(JSON.stringify({crudPassed:!failed && !!probe,cleanupChecked:!!probe}))
  if(db) await db.terminate()
  await Promise.all(getApps().filter(app=>app.name==='revtrove-server').map(deleteApp))
}
