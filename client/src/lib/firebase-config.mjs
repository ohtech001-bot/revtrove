export const firebaseEnvKeys = {
  apiKey:'VITE_FIREBASE_API_KEY',
  authDomain:'VITE_FIREBASE_AUTH_DOMAIN',
  projectId:'VITE_FIREBASE_PROJECT_ID',
  storageBucket:'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId:'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId:'VITE_FIREBASE_APP_ID',
}
export function readFirebaseConfig(env = {}) {
  const config = Object.fromEntries(Object.entries(firebaseEnvKeys).map(([field,key])=>[field,String(env[key] || '').trim()]))
  const missing = Object.entries(firebaseEnvKeys).filter(([field])=>!config[field]).map(([,key])=>key)
  return {config, missing, configured:missing.length === 0}
}
