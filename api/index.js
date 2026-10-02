import {createApp} from '../server/src/index.js'

// One warm Express instance per function process. Vercel handles HTTP listening.
// Static frontend files are served by the CDN, not bundled into this function.
const app=createApp({serverless:true})
export default app
