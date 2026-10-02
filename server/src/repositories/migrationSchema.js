import {createHash} from 'node:crypto'
import {Timestamp} from 'firebase-admin/firestore'
import {safeId} from './common.js'

export const schema={
  products:{collection:'products',key:'id',fields:['id','slug','name_ar','name_en','name_he','description_ar','description_en','description_he','category','price','images','model_parts','customizable_parts','active','created_at','updated_at'],json:{images:'array',model_parts:'object',customizable_parts:'array'},dates:['created_at','updated_at']},
  orders:{collection:'orders',key:'public_id',fields:['id','public_id','type','customer_name','phone','country_code','country','delivery_address','notes','details','reference_image','status','quoted_price','production_eta','print_status','created_at','updated_at'],json:{details:'object'},dates:['created_at','updated_at']},
  admin_users:{collection:'adminUsers',key:'id',fields:['id','email','password_hash','created_at'],json:{},dates:['created_at']},
}
export function canonical(value) {
  if(value===null || typeof value!=='object') return JSON.stringify(value)
  if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']'
  return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}'
}
export const checksum=value=>createHash('sha256').update(canonical(value)).digest('hex')
export function normalizeRow(table,row) {
  const spec=schema[table]
  if(!spec || spec.fields.some(key=>!(key in row)) || Object.keys(row).some(key=>!spec.fields.includes(key))) throw new Error('mysql_schema_mismatch:'+table)
  const data={...row}
  for(const [key,kind] of Object.entries(spec.json)) {
    if(typeof data[key]==='string') {try{data[key]=JSON.parse(data[key])}catch{throw new Error('invalid_mysql_json:'+table+':'+key)}}
    if(!data[key] || (kind==='array'?!Array.isArray(data[key]):typeof data[key]!=='object'||Array.isArray(data[key]))) throw new Error('invalid_mysql_json:'+table+':'+key)
  }
  for(const key of spec.dates) {
    if(data[key]===null)continue
    const date=new Date(data[key])
    if(data[key]==null || !Number.isFinite(date.getTime())) throw new Error('invalid_mysql_timestamp:'+table+':'+key)
    data[key]=date.toISOString()
  }
  if(table==='products' && data.active!==null) {
    if(![0,1,'0','1',false,true].includes(data.active))throw new Error('invalid_mysql_boolean:products:active')
    data.active=Boolean(Number(data.active))
  }
  return {id:safeId(data[spec.key]),data,hash:checksum(data)}
}
export function firestoreData(table,data) {
  const record={...data}
  for(const key of schema[table].dates) if(record[key]!==null)record[key]=Timestamp.fromDate(new Date(record[key]))
  return record
}
export function validateBackup(backup) {
  if(backup?.version!==1 || !backup.sourceDatabase || !backup.tables || backup.digest!==checksum(backup.tables)) throw new Error('invalid_backup_digest')
  for(const [table,spec] of Object.entries(schema)) {
    const payload=backup.tables[table]
    if(!payload || !Array.isArray(payload.rows) || payload.count!==payload.rows.length) throw new Error('backup_count_mismatch:'+table)
    const ids=new Set()
    for(const row of payload.rows){const normalized=normalizeRow(table,row);if(ids.has(normalized.id))throw new Error('duplicate_source_id:'+table);ids.add(normalized.id)}
    if(!Array.isArray(payload.columns) || payload.columns.length!==spec.fields.length || spec.fields.some(key=>!payload.columns.includes(key))) throw new Error('backup_schema_mismatch:'+table)
  }
  return backup
}
