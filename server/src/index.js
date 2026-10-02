import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import 'dotenv/config'
import { getAdminDb } from './lib/firebase-admin.js'
import { createProductRepository } from './repositories/productRepository.js'
import { createOrderRepository } from './repositories/orderRepository.js'
import { createAdminRepository } from './repositories/adminRepository.js'
import { requireAdmin, signAdmin } from './auth.js'
import { createStorageService } from './lib/storage-service.js'
import { addedTextDefaults } from '../../shared/catalog-additions.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

export function createApp({db=getAdminDb(),storageService=createStorageService(db),serverless=process.env.VERCEL==='1'}={}) {
const productRepository=createProductRepository(db)
const orderRepository=createOrderRepository(db)
const adminRepository=createAdminRepository(db)
const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", 'https://maps.googleapis.com', 'https://maps.gstatic.com'],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://maps.googleapis.com'],
    fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:', 'blob:', 'https://maps.googleapis.com', 'https://maps.gstatic.com', 'https://*.googleapis.com', 'https://*.gstatic.com', 'https://tile.openstreetmap.org', 'https://*.private.blob.vercel-storage.com'],
    connectSrc: ["'self'", 'https://maps.googleapis.com', 'https://places.googleapis.com', 'https://api.bigdatacloud.net', 'https://firestore.googleapis.com', 'https://vercel.com/api/blob/', 'https://*.private.blob.vercel-storage.com'],
    frameSrc: ["'self'", 'https://www.google.com', 'https://maps.google.com'],
    workerSrc: ["'self'", 'blob:'],
  } },
}))
app.use(compression())
app.use(cors({ origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((x) => x.trim()), methods: ['GET','POST','PATCH','DELETE'], allowedHeaders: ['Content-Type','Authorization'] }))
app.use(express.json({ limit: '250kb' }))
// Legacy disk URLs are retained in old records but no new local upload is accepted.
app.use('/uploads',(_req,res)=>res.status(410).json({error:'legacy_upload_unavailable'}))
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 250, standardHeaders: 'draft-8', legacyHeaders: false }))

const rejectMultipart=(req,res,next)=>req.is('multipart/form-data')?res.status(400).json({error:'direct_upload_required'}):next()
const claimSchema=z.object({id:z.string().uuid(),token:z.string().regex(/^[a-f0-9]{64}$/)})
const adminForUpload=(req,res,next)=>req.body?.kind==='reference'?next():requireAdmin(req,res,next)
const ownerAdmin=(req,res,next)=>req.get('authorization')?requireAdmin(req,res,next):next()
app.post('/api/uploads',rateLimit({windowMs:3600000,limit:30}),adminForUpload,async(req,res,next)=>{
  try {const input=z.object({kind:z.enum(['reference','productImage','productModel']),name:z.string().min(1).max(190),contentType:z.string().max(100),size:z.number().int().positive()}).parse(req.body);res.status(201).json(await storageService.start(input,{adminId:req.admin?.sub,ip:req.ip}))}catch(error){next(error)}
})
app.post('/api/uploads/:id/complete',ownerAdmin,async(req,res,next)=>{
  try {const {token}=claimSchema.omit({id:true}).parse(req.body);res.json(await storageService.finish(req.params.id,token,req.admin?.sub))}catch(error){next(error)}
})
app.post('/api/uploads/:id/preview',ownerAdmin,async(req,res,next)=>{
  try {const {token}=claimSchema.omit({id:true}).parse(req.body);res.json(await storageService.preview(req.params.id,token,req.admin?.sub))}catch(error){next(error)}
})
app.delete('/api/uploads/:id',ownerAdmin,async(req,res,next)=>{
  try {const {token}=claimSchema.omit({id:true}).parse(req.body);res.json(await storageService.remove(req.params.id,token,req.admin?.sub))}catch(error){next(error)}
})
app.get('/api/files/:id',ownerAdmin,async(req,res,next)=>{
  try {const url=await storageService.download(req.params.id,req.admin?.sub);res.set('Cache-Control','private, no-store');if(req.query.format==='json')res.json({url});else res.redirect(302,url)}catch(error){next(error)}
})

const optionalCoordinate = (min,max) => z.preprocess((value) => value === '' || value == null ? undefined : Number(value),z.number().min(min).max(max).optional())
const customerSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^[0-9+()\-\s]{6,30}$/),
  countryCode: z.string().trim().regex(/^\+?[0-9]{1,4}$/),
  country: z.string().trim().min(2).max(100),
  deliveryAddress: z.string().trim().min(5).max(500),
  deliveryLat: optionalCoordinate(-90,90),
  deliveryLng: optionalCoordinate(-180,180),
  deliveryPlaceId: z.string().trim().max(255).optional().default(''),
  notes: z.string().trim().max(1500).optional().default(''),
})
const standardOrderSchema = customerSchema.extend({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(20),
  baseText: z.string().trim().max(30).optional().default(''),
  caliperText: z.string().trim().max(20).optional().default(''),
  parts: z.record(z.string(), z.string().regex(/^#[0-9a-fA-F]{6}$/)),
})
const customOrderSchema = customerSchema.extend({
  customName: z.string().trim().min(2).max(160),
  partsDescription: z.string().trim().min(5).max(2000),
})

const safeJson = (value, fallback) => {
  try { return typeof value === 'string' ? JSON.parse(value) : value } catch { return fallback }
}

const reverseGeocodeCache=new Map()
let reverseGeocodeQueue=Promise.resolve(), lastReverseGeocodeAt=0
async function reverseGeocode({lat,lng,lang}) {
  const key=`${lat.toFixed(5)},${lng.toFixed(5)},${lang}`
  if (reverseGeocodeCache.has(key)) return reverseGeocodeCache.get(key)
  const run=async () => {
    const wait=Math.max(0,1100-(Date.now()-lastReverseGeocodeAt))
    if (wait) await delay(wait)
    lastReverseGeocodeAt=Date.now()
    const base=process.env.REVERSE_GEOCODER_URL || 'https://nominatim.openstreetmap.org/reverse'
    const url=new URL(base); url.searchParams.set('format','jsonv2'); url.searchParams.set('lat',lat); url.searchParams.set('lon',lng); url.searchParams.set('zoom','18'); url.searchParams.set('addressdetails','1'); url.searchParams.set('accept-language',lang)
    const response=await fetch(url,{headers:{'User-Agent':'Revtrove/1.0 (Rev.trove.911@gmail.com)','Accept':'application/json'}})
    if (!response.ok) throw new Error(`reverse_geocoder_${response.status}`)
    const value=await response.json()
    if (!value.display_name) throw new Error('reverse_address_not_found')
    const result={address:value.display_name,placeId:String(value.place_id || '')}
    reverseGeocodeCache.set(key,result)
    if (reverseGeocodeCache.size > 500) reverseGeocodeCache.delete(reverseGeocodeCache.keys().next().value)
    return result
  }
  const task=reverseGeocodeQueue.then(run,run)
  reverseGeocodeQueue=task.catch(() => {})
  return task
}
const mapProduct = (row) => ({ ...row, images: safeJson(row.images, []), model_parts: safeJson(row.model_parts, {}), customizable_parts: safeJson(row.customizable_parts, []) })
const mapOrder = (row) => ({ ...row, details: safeJson(row.details, {}) })
const productDefaultText = {
  ...addedTextDefaults,
  'bmw-m3-cs':{ base:'BMW M3 CS',caliper:'BREMBO' },
  'dodge-srt':{ base:'SRT',caliper:'BREMBO' },
  'porsche-gt3rs':{ base:'PORSCHE GT3 RS',caliper:'PORSCHE' },
  'bmw-m-turbo':{ base:'BMW M',caliper:'' },
}

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.get('/api/reverse-geocode', async (req,res,next) => {
  try { const input=z.object({lat:z.coerce.number().min(-90).max(90),lng:z.coerce.number().min(-180).max(180),lang:z.enum(['ar','en','he']).default('en')}).parse(req.query); res.json(await reverseGeocode(input)) } catch (error) { next(error) }
})
app.get('/api/products', async (_req, res, next) => {
  try {
    const items=[];let cursor
    do {const page=await productRepository.listActive({limit:500,cursor});items.push(...page.items);cursor=page.items.length===500?page.cursor:null}while(cursor)
    res.json(items.map(mapProduct))
  } catch (error) { next(error) }
})
app.get('/api/products/:slug', async (req, res, next) => {
  try {
    const product = await productRepository.getBySlug(req.params.slug)
    if (!product) return res.status(404).json({ error: 'not_found' })
    res.json(mapProduct(product))
  } catch (error) { next(error) }
})

app.post('/api/orders', async (req, res, next) => {
  try {
    const input = standardOrderSchema.parse(req.body)
    const found = await productRepository.getById(input.productId)
    if (!found?.active) return res.status(404).json({ error: 'product_not_found' })
    const product = mapProduct(found)
    const allowedParts = new Set(product.customizable_parts)
    if (Object.keys(input.parts).some((part) => !allowedParts.has(part))) return res.status(400).json({ error: 'invalid_part' })
    const defaultText=productDefaultText[product.slug] || { base:'',caliper:'' }
    const details = {
      productId: product.id,
      productSlug: product.slug,
      productName: product.name_en,
      quantity: input.quantity,
      baseText: input.baseText || defaultText.base,
      caliperText: input.caliperText || defaultText.caliper,
      modelParts: product.model_parts,
      parts: Object.entries(input.parts).map(([label,color]) => ({ label, color })),
      deliveryLocation: input.deliveryLat != null && input.deliveryLng != null ? { lat:input.deliveryLat,lng:input.deliveryLng,placeId:input.deliveryPlaceId } : null,
    }
    const publicId = `REV-${new Date().getFullYear()}-${nanoid(7).toUpperCase()}`
    const needsQuote = product.price == null
    const orderStatus = needsQuote ? 'new' : 'ready'
    const orderType = needsQuote ? 'custom' : 'standard'
    await orderRepository.create({public_id:publicId,type:orderType,customer_name:input.customerName,phone:input.phone,country_code:input.countryCode,country:input.country,delivery_address:input.deliveryAddress,notes:input.notes,details,status:orderStatus})
    res.status(201).json({ id: publicId, status: orderStatus })
  } catch (error) { next(error) }
})

app.post('/api/custom-orders', rejectMultipart, async (req, res, next) => {
  try {
    if (!req.body.referenceUpload) return res.status(400).json({ error: 'reference_image_required' })
    const input = customOrderSchema.extend({referenceUpload:claimSchema}).parse(req.body)
    const publicId = `CUSTOM-${new Date().getFullYear()}-${nanoid(7).toUpperCase()}`
    const details = { customName: input.customName, partsDescription: input.partsDescription, parts: [], deliveryLocation:input.deliveryLat != null && input.deliveryLng != null ? { lat:input.deliveryLat,lng:input.deliveryLng,placeId:input.deliveryPlaceId } : null }
    await orderRepository.create({public_id:publicId,type:'custom',customer_name:input.customerName,phone:input.phone,country_code:input.countryCode,country:input.country,delivery_address:input.deliveryAddress,notes:input.notes,details,reference_image:'/api/files/'+input.referenceUpload.id},{prepare:(tx,target)=>storageService.attach(tx,[{...input.referenceUpload,kind:'reference'}],target)})
    res.status(201).json({ id: publicId, status: 'new' })
  } catch (error) { next(error) }
})

app.post('/api/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 8 }), async (req, res, next) => {
  try {
    const input = z.object({ email: z.string().email().max(190), password: z.string().min(8).max(200) }).parse(req.body)
    const admin = await adminRepository.findByEmail(input.email)
    if (!admin || !(await bcrypt.compare(input.password, admin.password_hash))) return res.status(401).json({ error: 'invalid_credentials' })
    res.json({ token: signAdmin(admin), admin: { email: admin.email } })
  } catch (error) { next(error) }
})

app.get('/api/admin/orders', requireAdmin, async (req, res, next) => {
  try {
    const status = z.string().max(30).optional().parse(req.query.status)
    const search = z.string().max(100).optional().parse(req.query.search)
    res.json((await orderRepository.list({status,search,limit:500})).items.map(mapOrder))
  } catch (error) { next(error) }
})

app.patch('/api/admin/orders/:id', requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({ status: z.enum(['new','contacted','quoted','in_production','ready','awaiting_pickup','archived','completed','cancelled']).optional(), quotedPrice: z.coerce.number().min(0).nullable().optional(), productionEta: z.string().trim().regex(/^\d{1,3}$/).nullable().optional() }).parse(req.body)
    const order=await orderRepository.getByPublicId(req.params.id)
    if(!order) return res.status(404).json({error:'not_found'})
    if(input.status === 'quoted' && order.type !== 'custom') return res.status(400).json({error:'quote_only_for_custom_orders'})
    if(input.status === 'quoted' && (!input.quotedPrice || !input.productionEta)) return res.status(400).json({error:'quote_details_required'})
    const changes={}
    if(input.status)changes.status=input.status
    if(input.quotedPrice!=null)changes.quoted_price=input.quotedPrice
    if(input.productionEta!=null)changes.production_eta=input.productionEta
    await orderRepository.update(req.params.id,changes)
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.post('/api/admin/products', requireAdmin, rejectMultipart, async (req, res, next) => {
  try {
    const input = z.object({ slug:z.string().regex(/^[a-z0-9-]{3,120}$/), nameAr:z.string().min(2).max(190), nameEn:z.string().min(2).max(190), nameHe:z.string().min(2).max(190), price:z.coerce.number().min(0), category:z.string().max(80).default('wheel'),imageUpload:claimSchema.optional(),modelUpload:claimSchema.optional() }).parse(req.body)
    const image = input.imageUpload ? '/api/files/'+input.imageUpload.id : '/assets/bmw/4e141d69-0cc6-47e3-84bb-5343aa265525.jpg'
    const rim = input.modelUpload ? '/api/files/'+input.modelUpload.id : '/models/bmw-rim.glb'
    const files=[...(input.imageUpload?[{...input.imageUpload,kind:'productImage'}]:[]),...(input.modelUpload?[{...input.modelUpload,kind:'productModel'}]:[])]
    await productRepository.create({slug:input.slug,name_ar:input.nameAr,name_en:input.nameEn,name_he:input.nameHe,category:input.category,price:input.price,images:[image],model_parts:{rim,disc:'/models/disc.glb',caliper:'/models/caliper.glb',stand:'/models/stand.glb'},customizable_parts:['rim','disc','caliper','stand']},{prepare:(tx,target)=>storageService.attach(tx,files,target,req.admin.sub)})
    res.status(201).json({ ok:true })
  } catch (error) { next(error) }
})

app.post('/api/admin/orders/:id/print', requireAdmin, async (req, res, next) => {
  try {
    const lang=z.enum(['ar','en','he']).default('ar').parse(req.query.lang)
    const order = await orderRepository.getByPublicId(req.params.id)
    if (!order) return res.status(404).json({ error:'not_found' })
    // Compatibility read-only endpoint. The browser owns rendering and window.print().
    res.json({ok:true,queued:false,clientSide:true,language:lang,order:mapOrder(order)})
  } catch (error) { next(error) }
})

app.get('/api/admin/me', requireAdmin, async(req,res,next)=>{
  try {const admin=await adminRepository.getById(req.admin.sub);if(!admin)return res.status(404).json({error:'not_found'});res.json({admin:{email:admin.email}})}catch(error){next(error)}
})
app.get('/api/admin/products/:id', requireAdmin, async(req,res,next)=>{
  try {const product=await productRepository.getById(req.params.id);if(!product)return res.status(404).json({error:'not_found'});res.json(mapProduct(product))}catch(error){next(error)}
})
app.get('/api/admin/orders/:id', requireAdmin, async(req,res,next)=>{
  try {const order=await orderRepository.getByPublicId(req.params.id);if(!order)return res.status(404).json({error:'not_found'});res.json(mapOrder(order))}catch(error){next(error)}
})
app.patch('/api/admin/products/:id', requireAdmin, async(req,res,next)=>{
  try {
    const input=z.object({slug:z.string().regex(/^[a-z0-9-]{3,120}$/).optional(),nameAr:z.string().min(2).max(190).optional(),nameEn:z.string().min(2).max(190).optional(),nameHe:z.string().min(2).max(190).optional(),category:z.string().min(1).max(80).optional(),price:z.coerce.number().min(0).max(99999999.99).nullable().optional(),active:z.boolean().optional(),images:z.array(z.string().max(500)).max(100).optional(),modelParts:z.record(z.string(),z.string().max(500)).optional(),customizableParts:z.array(z.string().max(80)).optional()}).strict().parse(req.body)
    const fields={nameAr:'name_ar',nameEn:'name_en',nameHe:'name_he',modelParts:'model_parts',customizableParts:'customizable_parts'}
    await productRepository.update(req.params.id,Object.fromEntries(Object.entries(input).map(([k,v])=>[fields[k]||k,v])))
    res.json({ok:true})
  }catch(error){next(error)}
})
app.delete('/api/admin/products/:id', requireAdmin, async(req,res,next)=>{
  try {await productRepository.delete(req.params.id);res.json({ok:true})}catch(error){next(error)}
})

const clientDist = path.join(rootDir, 'client', 'dist')
if(!serverless) {
  app.use(express.static(clientDist))
  app.use((req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile(path.join(clientDist, 'index.html')))
}
app.use((_req,res)=>res.status(404).json({error:'not_found'}))

app.use((error, _req, res, _next) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error:'validation_error', issues:error.issues.map(({path,message}) => ({ field:path.join('.'), message })) })
  if (error instanceof multer.MulterError) return res.status(400).json({ error:'upload_error', message:error.message })
  const storageStatus={invalid_upload:400,upload_forbidden:403,upload_conflict:409,upload_rate_limited:429,storage_configuration:503,storage_unavailable:503}
  if(storageStatus[error.code])return res.status(storageStatus[error.code]).json({error:error.code})
  if(error.code===403)return res.status(503).json({error:'storage_permission'})
  if(error.code===404)return res.status(404).json({error:'not_found'})
  if(error.code===412)return res.status(409).json({error:'upload_conflict'})
  const repositoryStatus={not_found:404,write_conflict:409,invalid_data:400,firestore_permission:503,firestore_configuration:503,firestore_unavailable:503,repository_error:503}
  if(repositoryStatus[error.code]) {console.error('Repository operation failed:',error.code);return res.status(repositoryStatus[error.code]).json({error:error.code})}
  console.error('Request failed:',error.name || 'Error')
  res.status(500).json({ error:'internal_error' })
})

return app
}
if(process.env.VERCEL!=='1' && process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  createApp().listen(Number(process.env.PORT || 4000), () => console.log(`Revtrove server running on http://localhost:${process.env.PORT || 4000}`))
}
