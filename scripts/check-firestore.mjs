import { loadEnv } from 'vite'
import { initializeApp, deleteApp } from 'firebase/app'
import { getFirestore, getDocFromServer, doc, terminate, setLogLevel } from 'firebase/firestore'
import { readFirebaseConfig } from '../client/src/lib/firebase-config.mjs'
import { fileURLToPath } from 'node:url'

const env = {...loadEnv('development',fileURLToPath(new URL('../client/',import.meta.url)),'VITE_'),...process.env}
const settings = readFirebaseConfig(env)
// Provider diagnostics may contain project context; print only our safe status.
setLogLevel('silent')
if (!settings.configured) {
  console.error('Firestore not tested: missing ' + settings.missing.join(', '))
  process.exitCode = 2
} else {
  const app = initializeApp(settings.config,'connection-check')
  const db = getFirestore(app)
  let timer
  try {
    const snapshot = await Promise.race([
      getDocFromServer(doc(db,'health','connection')),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Firestore connection timed out after 10 seconds')),10000)}),
    ])
    if (!snapshot.exists() || snapshot.data().ok !== true) throw new Error('Create health/connection with boolean ok=true in Firebase Console')
    console.log('Firestore server connection verified. No writes were performed.')
  } catch (error) {
    console.error('Firestore check failed:',error.code || error.message)
    process.exitCode = 1
  } finally {
    clearTimeout(timer)
    await terminate(db)
    await deleteApp(app)
  }
}
