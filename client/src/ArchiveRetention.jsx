import {useEffect,useState} from 'react'
import {archiveRetention} from './lib/archive-retention'
import './archive-retention.css'
export default function ArchiveRetention({order,language}){
 const [now,setNow]=useState(Date.now)
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer)},[])
 const retention=archiveRetention(order,now)
 const c=({ar:{notice:'تُحذف بيانات الطلب وصوره بعد 60 يومًا من الأرشفة.',left:'الأيام المتبقية للحذف',due:'انتهت المهلة؛ ينتظر التنظيف التلقائي.',unknown:'تاريخ الأرشفة غير متاح؛ لا يمكن حساب المدة.'},en:{notice:'Order data and images are deleted 60 days after archiving.',left:'Days until deletion',due:'Retention expired; awaiting automatic cleanup.',unknown:'Archive date unavailable; countdown cannot be calculated.'},he:{notice:'פרטי ההזמנה והתמונות יימחקו 60 יום לאחר העברה לארכיון.',left:'ימים עד למחיקה',due:'התקופה הסתיימה; ממתין לניקוי אוטומטי.',unknown:'תאריך הארכוב אינו זמין; לא ניתן לחשב את הזמן.'}})[language]||{}
 return <div className="archive-retention"><small>{c.notice}</small>{retention?<><strong>{c.left}: <b>{retention.remainingDays}</b></strong><progress value={retention.elapsedDays} max="60" aria-label={c.left}/>{retention.remainingDays===0&&<small>{c.due}</small>}</>:<small>{c.unknown}</small>}</div>
}
