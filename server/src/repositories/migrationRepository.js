import {schema,normalizeRow,firestoreData,checksum} from './migrationSchema.js'
import {FieldValue} from 'firebase-admin/firestore'

function matches(snapshot,table,row,sourceDatabase) {
  if(!snapshot.exists)return false
  const data=snapshot.data(),metadata=data._migration
  if(metadata?.source!=='mysql' || metadata.database!==sourceDatabase || metadata.hash!==row.hash)return false
  delete data._migration
  for(const field of schema[table].dates) {
    if(data[field]===null)continue
    if(typeof data[field]?.toDate!=='function')return false
    data[field]=data[field].toDate().toISOString()
  }
  return checksum(data)===row.hash
}
export function createMigrationRepository(db) {
  return {
    async count(collection){return (await db.collection(collection).count().get()).data().count},
    async inspect(table,row,sourceDatabase){
      const snap=await db.collection(schema[table].collection).doc(row.id).get()
      return !snap.exists?'missing':matches(snap,table,row,sourceDatabase)?'unchanged':'conflict'
    },
    async importRow(table,row,sourceDatabase){
      const ref=db.collection(schema[table].collection).doc(row.id)
      return db.runTransaction(async tx=>{
        const snap=await tx.get(ref)
        if(snap.exists){if(matches(snap,table,row,sourceDatabase))return 'skipped';throw new Error('target_record_conflict:'+table)}
        tx.create(ref,{...firestoreData(table,row.data),_migration:{source:'mysql',database:sourceDatabase,table,hash:row.hash,importedAt:FieldValue.serverTimestamp()}})
        return 'created'
      })
    },
    async verify(table,rows,sourceDatabase){
      let matched=0
      for(const raw of rows){const row=normalizeRow(table,raw);if(await this.inspect(table,row,sourceDatabase)!=='unchanged')throw new Error('migration_verification_failed:'+table);matched++}
      return matched
    },
  }
}
