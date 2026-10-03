import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'
import bcrypt from 'bcryptjs'
import {getAdminApp,getAdminDb} from '../src/lib/firebase-admin.js'

export async function diagnoseAdminLogin({db,password,request=fetch,reportLocal=()=>{}}) {
  // This diagnostic has no write methods and reads exactly this account.
  const admin=await db.collection('adminUsers').doc('1').get()
  const result={adminFound:admin.exists,bcryptCompare:false}
  if(!admin.exists){reportLocal({...result});return result}
  const hash=admin.get('password_hash')
  result.bcryptCompare=typeof hash==='string'&&await bcrypt.compare(password,hash)
  reportLocal({...result})
  if(!result.bcryptCompare)return result
  const response=await request('https://revtrove.vercel.app/api/admin/login',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:admin.get('email'),password}),
  })
  const body=await response.json().catch(()=>({}))
  result.httpStatus=response.status
  result.tokenReturned=typeof body.token==='string'&&body.token.length>0
  result.loginSucceeded=response.ok&&result.tokenReturned
  // Never return the token, submitted password, or stored hash.
  return result
}

export function hiddenPassword({input=process.stdin,output=process.stderr}={}) {
  return new Promise((resolvePassword,reject)=>{
    if(!input.isTTY||typeof input.setRawMode!=='function')return reject(new Error('interactive_terminal_required'))
    let value='',escape='';const wasRaw=input.isRaw
    output.write('Password to test (hidden): ')
    input.setEncoding('utf8');input.setRawMode(true);input.resume()
    function finish(error){input.off('data',onData);input.off('end',onEnd);input.off('error',onError);input.setRawMode(Boolean(wasRaw));input.pause();output.write('\n');error?reject(error):resolvePassword(value)}
    function onEnd(){finish(new Error('input_cancelled'))}
    function onError(){finish(new Error('input_cancelled'))}
    function onData(chunk){for(const char of chunk){
      if(char==='\u0003')return finish(new Error('input_cancelled'))
      // Ignore terminal escape sequences, including bracketed paste markers.
      if(escape){escape+=char;if(/^\x1b(?:\[[0-?]*[ -/]*[@-~]|O.)$/.test(escape)||escape.length>32)escape='';continue}
      if(char==='\x1b'){escape=char;continue}
      if(char==='\r'||char==='\n')return finish()
      if(char==='\u007f'||char==='\b'){value=Array.from(value).slice(0,-1).join('');continue}
      if(char>=' '){value+=char;if(value.length>512)return finish(new Error('input_too_long'))}
    }}
    input.on('data',onData);input.on('end',onEnd);input.on('error',onError)
  })
}

async function main(){
  if(getAdminApp().options.projectId!=='revtrove-web')throw new Error('project_mismatch')
  const password=await hiddenPassword()
  const result=await diagnoseAdminLogin({db:getAdminDb(),password,reportLocal:local=>{
    console.log('admin found: '+local.adminFound)
    console.log('bcrypt compare: '+local.bcryptCompare)
  }})
  if(result.bcryptCompare){
    console.log('HTTP status: '+result.httpStatus)
    console.log('token returned: '+result.tokenReturned)
    console.log('login succeeded: '+result.loginSucceeded)
  }else if(result.adminFound){
    process.stderr.write('password_hash الحالي لا يطابق كلمة المرور التي أدخلتها. لم يتم تغيير أي بيانات.\n')
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
  const messages={interactive_terminal_required:'Run in your own interactive terminal; do not pass the password in arguments.',project_mismatch:'Firebase project is not revtrove-web. Nothing changed.',input_cancelled:'Cancelled. Nothing changed.',input_too_long:'Input is too long. Nothing changed.'}
  console.error(messages[error.message]||'Diagnostic could not finish. Check Firebase/network configuration. No data changed.')
  process.exitCode=1
})
