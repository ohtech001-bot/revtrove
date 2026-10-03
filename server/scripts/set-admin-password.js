import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'
import bcrypt from 'bcryptjs'
import {FieldValue} from 'firebase-admin/firestore'
import {getAdminApp,getAdminDb} from '../src/lib/firebase-admin.js'

export function validateHandoverPassword(password,confirmation) {
  if(password!==confirmation)throw new Error('Passwords do not match.')
  if(password.length<8||Buffer.byteLength(password,'utf8')>72)throw new Error('Use at least 8 characters and at most 72 UTF-8 bytes.')
  if(password==='ChangeMe123!')throw new Error('Choose a new password, not the old default.')
}

export async function setExistingAdminPassword(db,ref,expectedHash,password) {
  const hash=await bcrypt.hash(password,12)
  await db.runTransaction(async tx=>{
    const current=await tx.get(ref)
    if(!current.exists)throw new Error('Administrator no longer exists. Nothing changed.')
    if(current.get('password_hash')!==expectedHash)throw new Error('Password changed concurrently. Nothing changed; retry.')
    tx.update(ref,{password_hash:hash,session_version:(current.get('session_version')||0)+1,updated_at:FieldValue.serverTimestamp()})
  })
}

// Read from the user's interactive terminal only. Passwords are never command
// arguments, environment overrides, printed output, or committed source values.
function readSecret(prompt) {
  return new Promise((resolveSecret,reject)=>{
    if(!process.stdin.isTTY||!process.stdout.isTTY)return reject(new Error('Run this command in an interactive terminal.'))
    let value='';const wasRaw=process.stdin.isRaw
    process.stdout.write(prompt);process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8')
    function finish(error){process.stdin.off('data',input);process.stdin.setRawMode(Boolean(wasRaw));process.stdin.pause();process.stdout.write('\n');error?reject(error):resolveSecret(value)}
    function input(chunk){for(const char of chunk){
      if(char==='\u0003')return finish(new Error('Cancelled. Nothing changed.'))
      if(char==='\r'||char==='\n')return finish()
      if(char==='\u007f'||char==='\b'){value=Array.from(value).slice(0,-1).join('');continue}
      if(char>=' ')value+=char
    }}
    process.stdin.on('data',input)
  })
}

async function main(){
  const args=process.argv.slice(2),project=args[args.indexOf('--project')+1]
  if(!args.includes('--project')||!project||project.startsWith('--')||!args.includes('--apply'))throw new Error('Usage: npm run admin:password:set -- --project revtrove-web --apply')
  if(getAdminApp().options.projectId!==project)throw new Error('Project mismatch. Nothing changed.')
  const db=getAdminDb(),accounts=await db.collection('adminUsers').limit(2).get()
  if(accounts.size!==1)throw new Error('Expected exactly one existing administrator. Nothing changed.')
  const account=accounts.docs[0]
  console.log(`Project: ${project}\nExisting administrator: ${account.get('email')}\nThis replaces the password and signs out existing sessions; the email stays unchanged.`)
  const password=await readSecret('New handover password (input hidden): '),confirmation=await readSecret('Confirm password (input hidden): ')
  validateHandoverPassword(password,confirmation)
  await setExistingAdminPassword(db,account.ref,account.get('password_hash'),password)
  console.log('Password updated successfully. Give the customer this password securely; they can change it in Settings after login.')
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
  // SDK error messages can contain request details; only our own messages are shown.
  const safe=/^(Passwords|Use at least|Choose a new|Administrator|Password changed|Run this|Cancelled|Usage:|Project mismatch|Expected exactly)/.test(error.message)
  console.error(safe?error.message:'Could not update the password. Check Firebase Admin configuration and connectivity.');process.exitCode=1
})

