import {createHash,randomBytes} from 'node:crypto'
import bcrypt from 'bcryptjs'
import {Timestamp} from 'firebase-admin/firestore'
import {z} from 'zod'
import rateLimit from 'express-rate-limit'

export const recoveryEmail='rev.trove.911@gmail.com'
const digest=value=>createHash('sha256').update(value).digest('hex')
export async function sendRecoveryEmail({to,url}) {
  const key=process.env.RESEND_API_KEY,from=process.env.MAIL_FROM
  if(!key||!from)throw new Error('mail_not_configured')
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',signal:AbortSignal.timeout(15000),
    headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({from,to:[to],subject:'Revtrove — استعادة كلمة المرور',text:`لتعيين كلمة مرور جديدة، افتح الرابط التالي خلال 30 دقيقة:\n${url}\n\nإذا لم تطلب الاستعادة، تجاهل هذه الرسالة.`}),
  })
  // Never log the provider body, credentials, or reset link.
  if(!response.ok)throw new Error('mail_delivery_failed')
}

export function registerPasswordRecovery(app,{db,adminRepository,sendEmail=sendRecoveryEmail}) {
  const resets=db.collection('adminPasswordResets')
  app.post('/api/admin/forgot-password',rateLimit({windowMs:3600000,limit:5}),async(req,res)=>{
    const parsed=z.object({email:z.string().email().max(190)}).safeParse(req.body)
    const ok=()=>res.json({ok:true}) // Same response for unknown addresses.
    if(!parsed.success||parsed.data.email.toLowerCase()!==recoveryEmail)return ok()
    let ref
    try {
      let admin=await adminRepository.findByEmail(recoveryEmail)
      // The owner's recovery inbox may differ from the existing login email.
      // Never guess an account if the store has multiple administrators.
      if(!admin){const accounts=await db.collection('adminUsers').limit(2).get();if(accounts.size===1)admin=accounts.docs[0].data()}
      if(!admin)return ok()
      const origin=new URL((process.env.PASSWORD_RESET_URL||process.env.CLIENT_URL||'').split(',')[0].trim())
      if(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname)))throw new Error('mail_not_configured')
      const token=randomBytes(32).toString('hex')
      ref=resets.doc(digest(token))
      await ref.create({adminId:admin.id,passwordHash:admin.password_hash,expiresAt:Timestamp.fromMillis(Date.now()+30*60*1000)})
      const url=new URL('/admin',origin);url.searchParams.set('resetToken',token)
      await sendEmail({to:recoveryEmail,url:url.toString()})
      return ok()
    }catch(error){
      if(ref)await ref.delete().catch(()=>{})
      console.error('Password recovery failed:',['mail_not_configured','mail_delivery_failed'].includes(error.message)?error.message:'recovery_unavailable')
      return res.status(503).json({error:'recovery_unavailable'})
    }
  })
  app.post('/api/admin/reset-password',rateLimit({windowMs:15*60*1000,limit:10}),async(req,res)=>{
    const parsed=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),password:z.string().min(8).max(72).refine(v=>Buffer.byteLength(v,'utf8')<=72)}).safeParse(req.body)
    if(!parsed.success)return res.status(400).json({error:'invalid_reset'})
    try {
      const hash=await bcrypt.hash(parsed.data.password,12),ref=resets.doc(digest(parsed.data.token))
      await db.runTransaction(async tx=>{
        const reset=await tx.get(ref)
        if(!reset.exists||reset.get('expiresAt').toMillis()<=Date.now())throw new Error('invalid_reset')
        const adminRef=db.collection('adminUsers').doc(String(reset.get('adminId'))),admin=await tx.get(adminRef)
        if(!admin.exists||admin.get('password_hash')!==reset.get('passwordHash'))throw new Error('invalid_reset')
        tx.update(adminRef,{password_hash:hash,session_version:(admin.get('session_version')||0)+1,updated_at:Timestamp.now()})
        tx.delete(ref)
      })
      res.json({ok:true})
    }catch(error){res.status(error.message==='invalid_reset'?400:503).json({error:error.message==='invalid_reset'?'invalid_reset':'recovery_unavailable'})}
  })
}

