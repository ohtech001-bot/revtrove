import express from 'express'
import {createHash} from 'node:crypto'
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
import { createCategoryRepository } from './repositories/categoryRepository.js'
import {registerDetailRoutes,categoryDetailFields} from './lib/detail-library.js'
import {registerColorRoutes} from './lib/color-routes.js'
import {configurationFields,fieldPalette,requiresColor} from '../../shared/product-configuration.mjs'
import { categoryId } from '../../shared/catalog-categories.mjs'
import { requireAdmin, signAdmin } from './auth.js'
import { createStorageService } from './lib/storage-service.js'
import { addedTextDefaults, catalogAdditions } from '../../shared/catalog-additions.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

export function createApp({db=getAdminDb(),storageService=createStorageService(db),serverless=process.env.VERCEL==='1'}={}) {
const productRepository=createProductRepository(db)
const orderRepository=createOrderRepository(db)
const adminRepository=createAdminRepository(db)
const categoryRepository=createCategoryRepository(db)
const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'wasm-unsafe-eval'", 'https://maps.googleapis.com', 'https://maps.gstatic.com'],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://maps.googleapis.com'],
    fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:', 'blob:', 'https://maps.googleapis.com', 'https://maps.gstatic.com', 'https://*.googleapis.com', 'https://*.gstatic.com', 'https://tile.openstreetmap.org', 'https://*.private.blob.vercel-storage.com'],
    connectSrc: ["'self'", 'https://maps.googleapis.com', 'https://places.googleapis.com', 'https://api.bigdatacloud.net', 'https://firestore.googleapis.com', 'https://vercel.com/api/blob/', 'https://*.private.blob.vercel-storage.com', 'https://raw.githack.com/pmndrs/drei-assets/', 'https://raw.githubusercontent.com/pmndrs/drei-assets/'],
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
registerColorRoutes(app,{db,requireAdmin})

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
  texts:z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/),z.string().trim().max(80)).optional().default({}),
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(20),
  baseText: z.string().trim().max(30).optional().default(''),
  caliperText: z.string().trim().max(20).optional().default(''),
  parts: z.record(z.string(), z.string().regex(/^#[0-9a-fA-F]{6}$/)),
})
const customOrderSchema = customerSchema.extend({
  dimensions: z.object({length:z.number().positive().max(10000).nullable(),width:z.number().positive().max(10000).nullable(),height:z.number().positive().max(10000).nullable()}).optional(),
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
const mapOrder = (row) => ({ ...row, display_id:'ord'+row.id, details: safeJson(row.details, {}) })
const dimensionsSchema=z.object({length:z.coerce.number().positive().max(10000).nullable(),width:z.coerce.number().positive().max(10000).nullable(),height:z.coerce.number().positive().max(10000).nullable()}).strict()
const colorsSchema=z.array(z.object({hex:z.string().regex(/^#[0-9a-fA-F]{6}$/),name_ar:z.string().trim().min(1).max(80),name_en:z.string().trim().min(1).max(80),name_he:z.string().trim().min(1).max(80)}).strict()).max(50).refine(items=>new Set(items.map(c=>c.hex.toLowerCase())).size===items.length)
const configFieldsSchema=z.array(z.object({key:z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/),label_ar:z.string().trim().min(1).max(80),label_en:z.string().trim().min(1).max(80),label_he:z.string().trim().min(1).max(80),placeholder_ar:z.string().trim().max(120).optional(),placeholder_en:z.string().trim().max(120).optional(),placeholder_he:z.string().trim().max(120).optional(),colorEnabled:z.boolean().optional(),textEnabled:z.boolean()}).strict()).max(30).refine(v=>new Set(v.map(f=>f.key)).size===v.length)
const fieldOptionsSchema=z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/),z.object({colors:colorsSchema,defaultColor:z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),defaultText:z.string().trim().max(80).optional()}).strict().refine(v=>(!v.defaultColor||v.colors.some(c=>c.hex.toLowerCase()===v.defaultColor.toLowerCase())))).refine(v=>Object.keys(v).length<=30)
const categorySchema=z.object({nameAr:z.string().trim().min(2).max(80),nameEn:z.string().trim().min(2).max(80),nameHe:z.string().trim().min(2).max(80),detailKeys:z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/)).max(30).refine(v=>new Set(v).size===v.length).optional(),customizationFields:configFieldsSchema.optional()}).strict()
const enabledColorsSchema=z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/)).max(30)
const fieldLabelsSchema=z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/),z.object({label_ar:z.string().trim().min(1).max(80),label_en:z.string().trim().min(1).max(80),label_he:z.string().trim().min(1).max(80)}).strict())
const categoryFields=input=>categoryDetailFields(db,input)
registerDetailRoutes(app,{db,requireAdmin})
app.get('/api/categories',async(_req,res,next)=>{try{res.json(await categoryRepository.list())}catch(error){next(error)}})
app.get('/api/admin/categories',requireAdmin,async(_req,res,next)=>{try{res.json(await categoryRepository.list())}catch(error){next(error)}})
app.post('/api/admin/categories',requireAdmin,async(req,res,next)=>{try{const input=categorySchema.parse(req.body);const id='category-'+nanoid(12).toLowerCase();await categoryRepository.create({id,...await categoryFields(input)});res.status(201).json({id})}catch(error){next(error)}})
app.patch('/api/admin/categories/:id',requireAdmin,async(req,res,next)=>{try{await categoryRepository.update(req.params.id,await categoryFields(categorySchema.parse(req.body)));res.json({ok:true})}catch(error){next(error)}})
app.delete('/api/admin/categories/:id',requireAdmin,async(req,res,next)=>{try{await categoryRepository.delete(req.params.id);res.json({ok:true})}catch(error){if(error.code==='write_conflict')return res.status(409).json({error:'category_has_products'});next(error)}})
const catalogExclusions=async()=>{const snap=await db.collection('catalogExclusions').limit(500).get();return snap.docs.map(d=>d.id)}
app.get('/api/catalog/exclusions',async(_req,res,next)=>{try{res.json(await catalogExclusions())}catch(error){next(error)}})
app.delete('/api/admin/catalog-products/:slug',requireAdmin,async(req,res,next)=>{try{if(!catalogAdditions.some(p=>p.slug===req.params.slug))return res.status(404).json({error:'not_found'});if(await productRepository.getBySlug(req.params.slug))return res.status(409).json({error:'write_conflict'});await db.runTransaction(async tx=>{const ref=db.collection('catalogExclusions').doc(req.params.slug);const old=await tx.get(ref);const stored=await tx.get(db.collection('products').where('slug','==',req.params.slug).limit(1));if(!stored.empty)throw Object.assign(new Error('write_conflict'),{code:'write_conflict'});if(old.exists)throw Object.assign(new Error('not_found'),{code:'not_found'});tx.create(ref,{slug:req.params.slug})});res.json({ok:true})}catch(error){next(error)}})
app.get('/api/admin/products',requireAdmin,async(_req,res,next)=>{try{const items=[];let cursor;do{const page=await productRepository.listAll({limit:500,cursor});items.push(...page.items);cursor=page.items.length===500?page.cursor:null}while(cursor!=null);const slugs=new Set(items.map(p=>p.slug)),excluded=new Set(await catalogExclusions());res.json([...items.map(mapProduct),...catalogAdditions.filter(p=>!slugs.has(p.slug)&&!excluded.has(p.slug)).map(p=>({...p,id:null,active:1,catalogOnly:true}))])}catch(error){next(error)}})
app.post('/api/admin/change-password',requireAdmin,rateLimit({windowMs:15*60*1000,limit:5}),async(req,res,next)=>{try{const input=z.object({currentPassword:z.string().min(8).max(72),newPassword:z.string().min(12).max(72).refine(v=>Buffer.byteLength(v,'utf8')<=72)}).strict().parse(req.body);const admin=await adminRepository.getById(req.admin.sub);if(!admin||!await bcrypt.compare(input.currentPassword,admin.password_hash))return res.status(403).json({error:'invalid_current_password'});if(await bcrypt.compare(input.newPassword,admin.password_hash))return res.status(400).json({error:'password_unchanged'});await adminRepository.changePassword(admin.id,admin.password_hash,await bcrypt.hash(input.newPassword,12));res.json({ok:true})}catch(error){next(error)}})
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

async function prepareStandardOrder(input){
    const found = await productRepository.getById(input.productId)
    if (!found?.active) throw Object.assign(new Error('product_not_found'),{checkoutStatus:404,checkoutError:'product_not_found'})
    const product = mapProduct(found)
    const category=await categoryRepository.getById(product.category)
    const fields=configurationFields(category,product)
    const colorFields=fields.filter(requiresColor)
    const allowedParts = new Set(colorFields.map(f=>f.key))
    if (Object.keys(input.parts).some((part) => !allowedParts.has(part))) throw Object.assign(new Error('invalid_part'),{checkoutStatus:400,checkoutError:'invalid_part'})
    if(colorFields.some(f=>!input.parts[f.key]))throw Object.assign(new Error('required_colors_missing'),{checkoutStatus:400,checkoutError:'required_colors_missing'})
    if(colorFields.some(f=>!fieldPalette(product,f.key,f).some(c=>c.hex.toLowerCase()===input.parts[f.key].toLowerCase())))throw Object.assign(new Error('invalid_color'),{checkoutStatus:400,checkoutError:'invalid_color'})
    const selectedTexts=Object.fromEntries(fields.filter(f=>f.textEnabled).map(f=>[f.key,(input.texts[f.key]||(f.key==='stand'?input.baseText:f.key==='caliper'?input.caliperText:'')||'').trim()]))
    if(Object.values(selectedTexts).some(v=>!v))throw Object.assign(new Error('required_text_missing'),{checkoutStatus:400,checkoutError:'required_text_missing'})
    if(Object.keys(input.texts).some(k=>!fields.some(f=>f.key===k&&f.textEnabled)))throw Object.assign(new Error('invalid_text_field'),{checkoutStatus:400,checkoutError:'invalid_text_field'})
    const defaultText=productDefaultText[product.slug] || { base:'',caliper:'' }
    const details = {
      productId: product.id,
      productSlug: product.slug,
      productName: product.name_en,
      quantity: input.quantity,
      baseText: selectedTexts.standText||selectedTexts.stand||'',
      texts:selectedTexts,
      textLabels:Object.fromEntries(fields.filter(f=>f.textEnabled).map(f=>[f.key,{ar:f.label_ar,en:f.label_en,he:f.label_he}])),
      caliperText: selectedTexts.caliperText||selectedTexts.caliper||'',
      modelParts: product.model_parts,
      parts: Object.entries(input.parts).map(([label,color]) => {const field=fields.find(f=>f.key===label),selected=fieldPalette(product,label,field).find(c=>c.hex.toLowerCase()===color.toLowerCase());return {label,color,labels:{ar:field.label_ar,en:field.label_en,he:field.label_he},...(selectedTexts[label]?{text:selectedTexts[label]}:{}),...(selected?{colorNames:{ar:selected.name_ar,en:selected.name_en,he:selected.name_he}}:{})}}),
      deliveryLocation: input.deliveryLat != null && input.deliveryLng != null ? { lat:input.deliveryLat,lng:input.deliveryLng,placeId:input.deliveryPlaceId } : null,
    }
    const publicId = `REV-${new Date().getFullYear()}-${nanoid(7).toUpperCase()}`
    const needsQuote = product.price == null
    const orderStatus = needsQuote ? 'new' : 'ready'
    const orderType = needsQuote ? 'custom' : 'standard'
    return {public_id:publicId,type:orderType,customer_name:input.customerName,phone:input.phone,country_code:input.countryCode,country:input.country,delivery_address:input.deliveryAddress,notes:input.notes,details,status:orderStatus}
}
app.post('/api/orders', async (req,res,next)=>{
 try{const record=await prepareStandardOrder(standardOrderSchema.parse(req.body));const created=await orderRepository.create(record,{includeDisplayId:true});res.status(201).json({id:record.public_id,displayId:created.displayId,status:record.status})}catch(error){if(error.checkoutStatus)return res.status(error.checkoutStatus).json({error:error.checkoutError});next(error)}
})
app.post('/api/cart/checkout',async(req,res,next)=>{
 try{
  const {checkoutId,customer,items}=z.object({checkoutId:z.string().uuid(),customer:customerSchema,items:z.array(standardOrderSchema.omit({customerName:true,phone:true,countryCode:true,country:true,deliveryAddress:true,deliveryLat:true,deliveryLng:true,deliveryPlaceId:true,notes:true})).min(1).max(30)}).strict().parse(req.body)
  const inputs=items.map(item=>standardOrderSchema.parse({...customer,...item}))
  const fingerprint=createHash('sha256').update(JSON.stringify(inputs)).digest('hex')
  // Check replay before reading mutable catalog data; the transaction repeats this check.
  const previous=await orderRepository.checkoutResult(checkoutId,fingerprint)
  if(previous)return res.status(201).json({orders:previous})
  const records=[];for(const input of inputs)records.push(await prepareStandardOrder(input))
  const orders=await orderRepository.createCheckout(records,{checkoutId,fingerprint})
  res.status(201).json({orders})
 }catch(error){if(error.checkoutStatus)return res.status(error.checkoutStatus).json({error:error.checkoutError});next(error)}
})

app.post('/api/custom-orders', rejectMultipart, async (req, res, next) => {
  try {
    const input = customOrderSchema.extend({referenceUpload:claimSchema.optional(),referenceUploads:z.array(claimSchema).min(1).max(3).optional()}).parse(req.body)
    const uploads=input.referenceUploads||[input.referenceUpload].filter(Boolean)
    if(!uploads.length)return res.status(400).json({error:'reference_image_required'})
    if(new Set(uploads.map(x=>x.id)).size!==uploads.length)return res.status(400).json({error:'invalid_upload'})
    const limits=(await db.collection('settings').doc('customOrders').get()).data()?.maxDimensions||{}
    for(const key of ['length','width','height'])if(input.dimensions?.[key]!=null && limits[key]!=null && input.dimensions[key]>limits[key])return res.status(400).json({error:'dimensions_exceed_maximum',dimension:key,maximum:limits[key]})
    const publicId = `CUSTOM-${new Date().getFullYear()}-${nanoid(7).toUpperCase()}`
    const details = { dimensions:input.dimensions||null, customName: input.customName, partsDescription: input.partsDescription, parts: [], deliveryLocation:input.deliveryLat != null && input.deliveryLng != null ? { lat:input.deliveryLat,lng:input.deliveryLng,placeId:input.deliveryPlaceId } : null }
    const createdOrder=await orderRepository.create({public_id:publicId,type:'custom',customer_name:input.customerName,phone:input.phone,country_code:input.countryCode,country:input.country,delivery_address:input.deliveryAddress,notes:input.notes,details,reference_image:'/api/files/'+uploads[0].id,reference_images:uploads.map(x=>'/api/files/'+x.id)},{includeDisplayId:true,prepare:(tx,target)=>storageService.attach(tx,uploads.map(x=>({...x,kind:'reference'})),target)})
    res.status(201).json({ id: publicId, displayId:createdOrder.displayId, status: 'new' })
  } catch (error) { next(error) }
})

app.get('/api/settings/custom-orders',async(req,res,next)=>{try{res.json({maxDimensions:(await db.collection('settings').doc('customOrders').get()).data()?.maxDimensions||{length:null,width:null,height:null}})}catch(e){next(e)}})
app.patch('/api/admin/settings/custom-orders',requireAdmin,async(req,res,next)=>{try{const input=z.object({maxDimensions:dimensionsSchema}).strict().parse(req.body);await db.collection('settings').doc('customOrders').set(input);res.json(input)}catch(e){next(e)}})
app.get('/api/maintenance/archive',async(req,res,next)=>{if(!process.env.CRON_SECRET||req.get('authorization')!=='Bearer '+process.env.CRON_SECRET)return res.status(401).json({error:'unauthorized'});try{res.json(await orderRepository.purgeArchived({storageService}))}catch(e){next(e)}})

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
    const input = z.object({ slug:z.string().regex(/^[a-z0-9-]{3,120}$/).optional(), nameAr:z.string().trim().min(2).max(190), nameEn:z.string().trim().min(2).max(190), nameHe:z.string().trim().min(2).max(190), price:z.coerce.number().min(0).max(99999999.99).nullable(), category:z.string().max(80).default('wheel'),imageUpload:claimSchema.optional(),modelUpload:claimSchema.optional(),images:z.array(z.string().max(500)).max(100).optional(),modelParts:z.record(z.string(),z.string().max(500)).optional(),customizableParts:z.array(z.string().max(80)).max(30).optional(),dimensions:dimensionsSchema.optional(),enabledColorFields:enabledColorsSchema.optional(),fieldLabels:fieldLabelsSchema.optional(),fieldOptions:fieldOptionsSchema.optional(),colors:colorsSchema.optional() }).parse(req.body)
    if(!await categoryRepository.getById(input.category))return res.status(400).json({error:'invalid_category'})
    const slug=input.slug||(input.nameEn.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,95)||'product')+'-'+nanoid(8).toLowerCase().replace(/_/g,'-')
    const images=input.imageUpload?['/api/files/'+input.imageUpload.id]:input.images||['/assets/bmw/4e141d69-0cc6-47e3-84bb-5343aa265525.jpg']
    const modelParts=input.modelParts||{rim:'/models/bmw-rim.glb',disc:'/models/disc.glb',caliper:'/models/caliper.glb',stand:'/models/stand.glb'}
    if(input.modelUpload)modelParts.rim='/api/files/'+input.modelUpload.id
    const files=[...(input.imageUpload?[{...input.imageUpload,kind:'productImage'}]:[]),...(input.modelUpload?[{...input.modelUpload,kind:'productModel'}]:[])]
    const id=await productRepository.create({slug,name_ar:input.nameAr,name_en:input.nameEn,name_he:input.nameHe,category:categoryId(input.category),price:input.price,images,model_parts:modelParts,customizable_parts:input.customizableParts||['rim','disc','caliper','stand'],dimensions:input.dimensions||{length:null,width:null,height:null},enabled_color_fields:input.enabledColorFields??null,field_labels:input.fieldLabels||{},field_options:input.fieldOptions||{},colors:input.colors||[]},{prepare:(tx,target)=>storageService.attach(tx,files,target,req.admin.sub)})
    res.status(201).json({ ok:true,id,slug })
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
    const input=z.object({slug:z.string().regex(/^[a-z0-9-]{3,120}$/).optional(),nameAr:z.string().trim().min(2).max(190).optional(),nameEn:z.string().trim().min(2).max(190).optional(),nameHe:z.string().trim().min(2).max(190).optional(),category:z.string().min(1).max(80).optional(),price:z.coerce.number().min(0).max(99999999.99).nullable().optional(),active:z.boolean().optional(),images:z.array(z.string().max(500)).max(100).optional(),modelParts:z.record(z.string(),z.string().max(500)).optional(),customizableParts:z.array(z.string().max(80)).optional(),dimensions:dimensionsSchema.optional(),enabledColorFields:enabledColorsSchema.optional(),fieldLabels:fieldLabelsSchema.optional(),fieldOptions:fieldOptionsSchema.optional(),colors:colorsSchema.optional(),imageUpload:claimSchema.optional(),modelUpload:claimSchema.optional()}).strict().parse(req.body)
    if(input.category){if(!await categoryRepository.getById(input.category))return res.status(400).json({error:'invalid_category'});input.category=categoryId(input.category)}
    const fields={enabledColorFields:'enabled_color_fields',fieldLabels:'field_labels',fieldOptions:'field_options',nameAr:'name_ar',nameEn:'name_en',nameHe:'name_he',modelParts:'model_parts',customizableParts:'customizable_parts'}
    const {imageUpload,modelUpload,...editable}=input
    const changes=Object.fromEntries(Object.entries(editable).map(([k,v])=>[fields[k]||k,v]))
    const files=[...(imageUpload?[{...imageUpload,kind:'productImage'}]:[]),...(modelUpload?[{...modelUpload,kind:'productModel'}]:[])]
    await productRepository.update(req.params.id,changes,{prepare:async(tx,target,current)=>{await storageService.attach(tx,files,target,req.admin.sub);if(changes.field_options)changes.pending_color_assignments=(current.pending_color_assignments||[]).filter(hex=>!Object.values(changes.field_options).some(x=>x.colors?.some(c=>c.hex.toLowerCase()===hex)));if(imageUpload)changes.images=['/api/files/'+imageUpload.id,...(changes.images||current.images||[])];if(modelUpload)changes.model_parts={...(changes.model_parts||current.model_parts||{}),rim:'/api/files/'+modelUpload.id}}})
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


