import {useEffect,useState} from 'react'
import {showMessage} from './lib/site-dialogs'
import './password-recovery.css'

export const recoveryCopy=language=>({
 ar:{forgot:'هل نسيت كلمة المرور؟',remember:'تذكرني لمدة 24 ساعة',title:'استعادة كلمة المرور',send:'أرسل رابط الاستعادة',sent:'إذا كان البريد مرتبطًا بحساب المدير، سيصلك رابط استعادة صالح لمدة 30 دقيقة.',back:'العودة لتسجيل الدخول',password:'كلمة المرور الجديدة (8 حرفًا على الأقل)',confirm:'تأكيد كلمة المرور',save:'حفظ كلمة المرور',mismatch:'كلمتا المرور غير متطابقتين',success:'تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.',failed:'تعذر إتمام الاستعادة. تحقق من صلاحية الرابط أو حاول لاحقًا.'},
 en:{forgot:'Forgot password?',remember:'Remember me for 24 hours',title:'Reset password',send:'Send recovery link',sent:'If the email belongs to the administrator, a recovery link valid for 30 minutes will arrive.',back:'Back to login',password:'New password (at least 8 characters)',confirm:'Confirm password',save:'Save password',mismatch:'Passwords do not match',success:'Password changed. Sign in with your new password.',failed:'Unable to reset. Check the link validity or try later.'},
 he:{forgot:'שכחת את הסיסמה?',remember:'זכור אותי ל-24 שעות',title:'איפוס סיסמה',send:'שליחת קישור לשחזור',sent:'אם האימייל משויך למנהל, יישלח קישור בתוקף ל-30 דקות.',back:'חזרה להתחברות',password:'סיסמה חדשה (לפחות 8 תווים)',confirm:'אישור סיסמה',save:'שמירת סיסמה',mismatch:'הסיסמאות אינן תואמות',success:'הסיסמה שונתה. יש להתחבר עם הסיסמה החדשה.',failed:'השחזור נכשל. יש לבדוק את תוקף הקישור או לנסות מאוחר יותר.'},
}[language]||recoveryCopy('en'))

export default function PasswordRecovery({language,token,onBack}){
 const copy=recoveryCopy(language),[busy,setBusy]=useState(false)
 useEffect(()=>{if(token){const url=new URL(window.location.href);url.searchParams.delete('resetToken');history.replaceState(null,'',url)}},[token])
 async function submit(event){
  event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget))
  if(token&&data.password!==data.confirm){await showMessage(copy.mismatch);return}
  setBusy(true)
  try{
   const response=await fetch('/api/admin/'+(token?'reset-password':'forgot-password'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(token?{token,password:data.password}:{email:'rev.trove.911@gmail.com'})})
   if(!response.ok)throw new Error('failed')
   await showMessage(token?copy.success:copy.sent)
   if(token){const url=new URL(window.location.href);url.searchParams.delete('resetToken');history.replaceState(null,'',url);onBack()}
  }catch{await showMessage(copy.failed)}finally{setBusy(false)}
 }
 return <div className="admin-login"><section className="login-card"><h1>{copy.title}</h1><form noValidate onSubmit={submit}>{token?<><label>{copy.password}<input type="password" name="password" minLength={8} maxLength={72} required autoComplete="new-password"/></label><label>{copy.confirm}<input type="password" name="confirm" minLength={8} maxLength={72} required autoComplete="new-password"/></label></>:<p dir="ltr">Rev.trove.911@gmail.com</p>}<button disabled={busy} className="button primary wide">{token?copy.save:copy.send}</button></form><button type="button" className="button ghost wide" onClick={onBack}>{copy.back}</button></section></div>
}

