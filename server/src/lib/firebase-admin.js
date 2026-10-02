import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { readAdminConfig } from './admin-config.js'

// Load the existing server environment, never client/.env.local or VITE_ keys.
dotenv.config({path:fileURLToPath(new URL('../../../.env',import.meta.url)),quiet:true})
export function getAdminApp() {
  const settings=readAdminConfig(process.env)
  if (!settings.configured) throw new Error('firebase_admin_missing_env:' + settings.missing.join(','))
  const app=getApps().find(item=>item.name==='revtrove-server') || initializeApp({credential:cert(settings.credential),projectId:settings.credential.projectId},'revtrove-server')
  return app
}
export function getAdminDb() {return getFirestore(getAdminApp())}
