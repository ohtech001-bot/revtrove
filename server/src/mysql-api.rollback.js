import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
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
import { query } from './db.js'
import { requireAdmin, signAdmin } from './auth.js'
import { queueOrderPrint } from './print-service.js'
import { addedTextDefaults } from '../../shared/catalog-additions.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const uploadDir = path.resolve(__dirname, '..', 'uploads')
await mkdir(uploadDir, { recursive: true })

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
    imgSrc: ["'self'", 'data:', 'blob:', 'https://maps.googleapis.com', 'https://maps.gstatic.com', 'https://*.googleapis.com', 'https://*.gstatic.com', 'https://tile.openstreetmap.org'],
    connectSrc: ["'self'", 'https://maps.googleapis.com', 'https://places.googleapis.com', 'https://api.bigdatacloud.net', 'https://firestore.googleapis.com'],
    frameSrc: ["'self'", 'https://www.google.com', 'https://maps.google.com'],
    workerSrc: ["'self'", 'blob:'],
  } },
}))
app.use(compression())
app.use(cors({ origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((x) => x.trim()), methods: ['GET','POST','PATCH'], allowedHeaders: ['Content-Type','Authorization'] }))
app.use(express.json({ limit: '250kb' }))
app.use('/uploads', express.static(uploadDir, { dotfiles: 'deny', maxAge: '1d', index: false }))
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 250, standardHeaders: 'draft-8', legacyHeaders: false }))

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${nanoid(10)}${path.extname(file.originalname).toLowerCase()}`),
})
const imageUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, ['image/jpeg','image/png','image/webp'].includes(file.mimetype)),
})
const assetUpload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => cb(null, ['image/jpeg','image/png','image/webp','model/gltf-binary','application/octet-stream'].includes(file.mimetype)),
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
  try { res.json((await query('SELECT * FROM products WHERE active=1 ORDER BY created_at DESC')).map(mapProduct)) } catch (error) { next(error) }
})
app.get('/api/products/:slug', async (req, res, next) => {
  try {
    const rows = await query('SELECT * FROM products WHERE slug=? AND active=1 LIMIT 1', [req.params.slug])
    if (!rows.length) return res.status(404).json({ error: 'not_found' })
    res.json(mapProduct(rows[0]))
  } catch (error) { next(error) }
})

app.post('/api/orders', async (req, res, next) => {
  try {
    const input = standardOrderSchema.parse(req.body)
    const products = await query('SELECT * FROM products WHERE id=? AND active=1 LIMIT 1', [input.productId])
    if (!products.length) return res.status(404).json({ error: 'product_not_found' })
    const product = mapProduct(products[0])
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
    const result = await query(`INSERT INTO orders (public_id,type,customer_name,phone,country_code,country,delivery_address,notes,details,status)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, [publicId,orderType,input.customerName,input.phone,input.countryCode,input.country,input.deliveryAddress,input.notes,JSON.stringify(details),orderStatus])
    const [created] = await query('SELECT * FROM orders WHERE id=?', [result.insertId])
    try { await queueOrderPrint(mapOrder(created)); await query("UPDATE orders SET print_status='queued' WHERE id=?", [result.insertId]) } catch (printError) { console.error('Print queue:', printError.message); await query("UPDATE orders SET print_status='failed' WHERE id=?", [result.insertId]) }
    res.status(201).json({ id: publicId, status: orderStatus })
  } catch (error) { next(error) }
})

app.post('/api/custom-orders', imageUpload.single('referenceImage'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'reference_image_required' })
    const input = customOrderSchema.parse(req.body)
    const publicId = `CUSTOM-${new Date().getFullYear()}-${nanoid(7).toUpperCase()}`
    const details = { customName: input.customName, partsDescription: input.partsDescription, parts: [], deliveryLocation:input.deliveryLat != null && input.deliveryLng != null ? { lat:input.deliveryLat,lng:input.deliveryLng,placeId:input.deliveryPlaceId } : null }
    await query(`INSERT INTO orders (public_id,type,customer_name,phone,country_code,country,delivery_address,notes,details,reference_image)
      VALUES (?,'custom',?,?,?,?,?,?,?,?)`, [publicId,input.customerName,input.phone,input.countryCode,input.country,input.deliveryAddress,input.notes,JSON.stringify(details),`/uploads/${req.file.filename}`])
    res.status(201).json({ id: publicId, status: 'new' })
  } catch (error) { next(error) }
})

app.post('/api/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 8 }), async (req, res, next) => {
  try {
    const input = z.object({ email: z.string().email().max(190), password: z.string().min(8).max(200) }).parse(req.body)
    const rows = await query('SELECT * FROM admin_users WHERE email=? LIMIT 1', [input.email.toLowerCase()])
    if (!rows.length || !(await bcrypt.compare(input.password, rows[0].password_hash))) return res.status(401).json({ error: 'invalid_credentials' })
    res.json({ token: signAdmin(rows[0]), admin: { email: rows[0].email } })
  } catch (error) { next(error) }
})

app.get('/api/admin/orders', requireAdmin, async (req, res, next) => {
  try {
    const status = z.string().max(30).optional().parse(req.query.status)
    const search = z.string().max(100).optional().parse(req.query.search)
    const params = []
    let sql = 'SELECT * FROM orders WHERE 1=1'
    if (status && status !== 'all') { sql += ' AND status=?'; params.push(status) }
    else { sql += " AND status<>'archived'" }
    if (search) { sql += ' AND (public_id LIKE ? OR customer_name LIKE ? OR phone LIKE ?)'; const term=`%${search}%`; params.push(term,term,term) }
    sql += ' ORDER BY created_at DESC LIMIT 500'
    res.json((await query(sql, params)).map(mapOrder))
  } catch (error) { next(error) }
})

app.patch('/api/admin/orders/:id', requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({ status: z.enum(['new','contacted','quoted','in_production','ready','awaiting_pickup','archived','completed','cancelled']).optional(), quotedPrice: z.coerce.number().min(0).nullable().optional(), productionEta: z.string().trim().regex(/^\d{1,3}$/).nullable().optional() }).parse(req.body)
    const rows=await query('SELECT type FROM orders WHERE public_id=? LIMIT 1',[req.params.id])
    if(!rows.length) return res.status(404).json({error:'not_found'})
    if(input.status === 'quoted' && rows[0].type !== 'custom') return res.status(400).json({error:'quote_only_for_custom_orders'})
    if(input.status === 'quoted' && (!input.quotedPrice || !input.productionEta)) return res.status(400).json({error:'quote_details_required'})
    await query('UPDATE orders SET status=COALESCE(?,status), quoted_price=COALESCE(?,quoted_price), production_eta=COALESCE(?,production_eta) WHERE public_id=?', [input.status || null,input.quotedPrice ?? null,input.productionEta ?? null,req.params.id])
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.post('/api/admin/products', requireAdmin, assetUpload.fields([{ name:'image', maxCount:1 },{ name:'model', maxCount:1 }]), async (req, res, next) => {
  try {
    const input = z.object({ slug:z.string().regex(/^[a-z0-9-]{3,120}$/), nameAr:z.string().min(2).max(190), nameEn:z.string().min(2).max(190), nameHe:z.string().min(2).max(190), price:z.coerce.number().min(0), category:z.string().max(80).default('wheel') }).parse(req.body)
    const image = req.files?.image?.[0] ? `/uploads/${req.files.image[0].filename}` : '/assets/bmw/4e141d69-0cc6-47e3-84bb-5343aa265525.jpg'
    const rim = req.files?.model?.[0] ? `/uploads/${req.files.model[0].filename}` : '/models/bmw-rim.glb'
    await query(`INSERT INTO products (slug,name_ar,name_en,name_he,category,price,images,model_parts,customizable_parts) VALUES (?,?,?,?,?,?,?,?,?)`, [input.slug,input.nameAr,input.nameEn,input.nameHe,input.category,input.price,JSON.stringify([image]),JSON.stringify({ rim,disc:'/models/disc.glb',caliper:'/models/caliper.glb',stand:'/models/stand.glb' }),JSON.stringify(['rim','disc','caliper','stand'])])
    res.status(201).json({ ok:true })
  } catch (error) { next(error) }
})

app.post('/api/admin/orders/:id/print', requireAdmin, async (req, res, next) => {
  try {
    const lang=z.enum(['ar','en','he']).default('ar').parse(req.query.lang)
    const rows = await query('SELECT * FROM orders WHERE public_id=? LIMIT 1', [req.params.id])
    if (!rows.length) return res.status(404).json({ error:'not_found' })
    await queueOrderPrint(mapOrder(rows[0]),lang)
    res.json({ok:true,queued:true})
  } catch (error) { next(error) }
})

const clientDist = path.join(rootDir, 'client', 'dist')
app.use(express.static(clientDist))
app.use((req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile(path.join(clientDist, 'index.html')))

app.use((error, _req, res, _next) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error:'validation_error', issues:error.issues.map(({path,message}) => ({ field:path.join('.'), message })) })
  if (error instanceof multer.MulterError) return res.status(400).json({ error:'upload_error', message:error.message })
  console.error(error)
  res.status(500).json({ error:'internal_error' })
})

app.listen(Number(process.env.PORT || 4000), () => console.log(`Revtrove server running on http://localhost:${process.env.PORT || 4000}`))
