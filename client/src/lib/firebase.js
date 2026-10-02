import { initializeApp, getApps } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { readFirebaseConfig } from './firebase-config.mjs'

const settings = readFirebaseConfig(import.meta.env)
export const firebaseConfigured = settings.configured
export const missingFirebaseEnv = settings.missing
// No initialization or network request until the real configuration is supplied.
export const firebaseApp = firebaseConfigured
  ? getApps().find(app=>app.name === 'revtrove') || initializeApp(settings.config, 'revtrove')
  : null
export const db = firebaseApp ? getFirestore(firebaseApp) : null
