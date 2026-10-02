export const ARCHIVE_DAYS=60
export function archiveRetention(order,now=Date.now()){
 const value=order.archived_at||order.updated_at
 const start=typeof value==='string'?Date.parse(value):value instanceof Date?value.getTime():NaN
 if(!Number.isFinite(start))return null
 const expiresAt=start+ARCHIVE_DAYS*86400000
 return {expiresAt,remainingDays:Math.max(0,Math.min(ARCHIVE_DAYS,Math.ceil((expiresAt-now)/86400000))),elapsedDays:Math.max(0,Math.min(ARCHIVE_DAYS,Math.floor((now-start)/86400000)))}
}
export function ordersFilterStatus(tab,status){return tab==='archive'?'archived':status==='received'?'completed':status}
