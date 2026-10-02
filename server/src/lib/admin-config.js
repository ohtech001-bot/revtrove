import { createPrivateKey } from 'node:crypto'

export function readAdminConfig(env = {}) {
  const projectId = String(env.FIREBASE_PROJECT_ID || '').trim()
  const clientEmail = String(env.FIREBASE_CLIENT_EMAIL || '').trim()
  const privateKey = String(env.FIREBASE_PRIVATE_KEY || '').replace(/\\r\\n/g,'\n').replace(/\\n/g,'\n').replace(/\r\n/g,'\n').trim()
  const missing = [['FIREBASE_PROJECT_ID',projectId],['FIREBASE_CLIENT_EMAIL',clientEmail],['FIREBASE_PRIVATE_KEY',privateKey]].filter(([,value])=>!value).map(([key])=>key)
  if (missing.length) return { configured:false, missing }
  // Fail locally without logging PEM content or provider error messages.
  try {
    if (!/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(clientEmail)) throw new Error()
    if (!/^-----BEGIN PRIVATE KEY-----\n/.test(privateKey) || createPrivateKey(privateKey).asymmetricKeyType !== 'rsa') throw new Error()
  } catch { throw new Error('firebase_admin_credentials_invalid') }
  return { configured:true, missing:[], credential:{ projectId,clientEmail,privateKey } }
}
