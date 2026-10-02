import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import {fileURLToPath} from 'node:url'
import {mkdir,open,unlink} from 'node:fs/promises'
import {join} from 'node:path'
import {schema,checksum,validateBackup} from '../src/repositories/migrationSchema.js'

const root=fileURLToPath(new URL('../../',import.meta.url))
dotenv.config({path:join(root,'.env'),quiet:true})
let connection,outputPath,handle,completed=false
try {
  connection=await mysql.createConnection({host:process.env.MYSQL_HOST||'127.0.0.1',port:Number(process.env.MYSQL_PORT||3306),user:process.env.MYSQL_USER||'root',password:process.env.MYSQL_PASSWORD||'',database:process.env.MYSQL_DATABASE||'revtrove',supportBigNumbers:true,bigNumberStrings:true,charset:'utf8mb4'})
  await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
  await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY')
  const tables={}
  for(const table of Object.keys(schema)) {
    const [columns]=await connection.execute('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',[table])
    const [engines]=await connection.execute('SELECT ENGINE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table])
    if(engines[0]?.ENGINE!=='InnoDB')throw new Error('backup_requires_innodb:'+table)
    const [[countRow]]=await connection.query(`SELECT COUNT(*) AS count FROM \`${table}\``)
    const rows=[]
    let after='0'
    while(true){
      const [page]=await connection.execute(`SELECT * FROM \`${table}\` WHERE id>? ORDER BY id LIMIT 500`,[after])
      if(!page.length)break
      rows.push(...page);after=String(page.at(-1).id)
    }
    tables[table]={columns:columns.map(c=>c.COLUMN_NAME),count:Number(countRow.count),rows:JSON.parse(JSON.stringify(rows))}
  }
  const backup={version:1,sourceDatabase:process.env.MYSQL_DATABASE||'revtrove',createdAt:new Date().toISOString(),tables,digest:checksum(tables)}
  validateBackup(backup)
  await connection.commit()
  await mkdir(join(root,'backups'),{recursive:true,mode:0o700})
  outputPath=join(root,'backups','mysql-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json')
  handle=await open(outputPath,'wx',0o600)
  await handle.writeFile(JSON.stringify(backup),'utf8');await handle.sync();await handle.close();handle=null
  completed=true
  console.log('MySQL snapshot saved: '+outputPath)
  console.log(JSON.stringify({counts:Object.fromEntries(Object.entries(tables).map(([table,payload])=>[table,payload.count])),digest:backup.digest}))
} catch(error) {
  const code=error.code || (error.message.startsWith('backup_') || error.message.startsWith('mysql_schema_') ? error.message : 'backup_failed')
  console.error('Backup failed: '+code);process.exitCode=1
} finally {
  if(handle)await handle.close()
  if(outputPath&&!completed)await unlink(outputPath).catch(()=>{})
  if(connection){await connection.rollback().catch(()=>{});await connection.end()}
}
