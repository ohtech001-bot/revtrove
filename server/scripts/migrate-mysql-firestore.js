import {readFile} from 'node:fs/promises'
import {getApps,deleteApp} from 'firebase-admin/app'
import {getAdminDb} from '../src/lib/firebase-admin.js'
import {schema,normalizeRow,validateBackup} from '../src/repositories/migrationSchema.js'
import {createMigrationRepository} from '../src/repositories/migrationRepository.js'

const args=process.argv.slice(2)
const option=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined
const apply=args.includes('--apply')
const verifyOnly=args.includes('--verify-only')
let db
try {
  const path=option('--backup'),target=option('--project')
  if(apply && verifyOnly)throw new Error('usage: --verify-only cannot be combined with --apply')
  if(!path||!target)throw new Error('usage: --backup <snapshot.json> --project <real-project-id> [--apply]')
  // A real, complete, validated backup is mandatory even for preflight.
  const backup=validateBackup(JSON.parse(await readFile(path,'utf8')))
  if(target!==process.env.FIREBASE_PROJECT_ID)throw new Error('firebase_project_confirmation_mismatch')
  if(process.env.FIRESTORE_EMULATOR_HOST)throw new Error('migration_emulator_target_not_allowed')
  db=getAdminDb()
  await db.doc('health/connection').get()
  const repository=createMigrationRepository(db),summary={mode:apply?'apply':verifyOnly?'verify-only':'dry-run',tables:{}}
  // Preflight EVERY record before creating any documents. No overwrites/deletes.
  for(const [table,spec] of Object.entries(schema)) {
    const source=backup.tables[table]
    const before=await repository.count(spec.collection)
    let missing=0,unchanged=0
    for(const raw of source.rows){
      const row=normalizeRow(table,raw)
      if(Buffer.byteLength(JSON.stringify(row.data))>900000)throw new Error('document_too_large:'+table)
      const state=await repository.inspect(table,row,backup.sourceDatabase)
      if(state==='conflict')throw new Error('target_record_conflict:'+table)
      if(state==='missing')missing++;else unchanged++
    }
    summary.tables[table]={source:source.count,before,missing,unchanged,created:0,skipped:0}
  }
  if(apply){
    for(const table of Object.keys(schema)){
      const result=summary.tables[table]
      for(const raw of backup.tables[table].rows){
        const state=await repository.importRow(table,normalizeRow(table,raw),backup.sourceDatabase)
        result[state]++
      }
      result.verified=await repository.verify(table,backup.tables[table].rows,backup.sourceDatabase)
      result.after=await repository.count(schema[table].collection)
      if(result.verified!==result.source || result.after!==result.before+result.created)throw new Error('migration_count_mismatch:'+table)
    }
  }
  if(verifyOnly){
    for(const [table,spec] of Object.entries(schema)){
      const result=summary.tables[table]
      result.verified=await repository.verify(table,backup.tables[table].rows,backup.sourceDatabase)
      result.after=await repository.count(spec.collection)
      if(result.verified!==result.source || result.before!==result.after)throw new Error('migration_count_mismatch:'+table)
    }
  }
  console.log(JSON.stringify(summary,null,2))
  console.log(apply?'Migration verified. MySQL and API backend are unchanged.':verifyOnly?'Verification completed; no writes.':'Preflight completed; no writes. Add --apply only after reviewing counts and backup.')
}catch(error){
  const message=error.message
  const safePrefixes=['usage:','invalid_backup','backup_','mysql_schema_','invalid_mysql_','duplicate_source_','firebase_project_','firebase_admin_missing_env:','target_record_','migration_','document_too_']
  console.error('Migration stopped: '+(safePrefixes.some(prefix=>message.startsWith(prefix))?message:String(error.code || 'configuration_or_connection_error')))
  console.error('Nothing was deleted or overwritten. If partially completed, repeat with the same backup; matching records are skipped.')
  process.exitCode=1
}finally{
  if(db)await db.terminate()
  await Promise.all(getApps().filter(app=>app.name==='revtrove-server').map(deleteApp))
}
