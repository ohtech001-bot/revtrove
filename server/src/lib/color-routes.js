import {readColorCatalog} from './color-catalog.js'
import {colorNameKey} from '../../../shared/color-choices.mjs'
import {availableColors} from '../../../shared/color-library.mjs'
import {z} from 'zod'
import {FieldValue} from 'firebase-admin/firestore'
import {configurationFields,requiresColor,fieldPalette} from '../../../shared/product-configuration.mjs'
import {categoryId} from '../../../shared/catalog-categories.mjs'
const colorSchema=z.object({hex:z.string().regex(/^#[0-9a-fA-F]{6}$/),name_ar:z.string().trim().min(1).max(80),name_en:z.string().trim().min(1).max(80),name_he:z.string().trim().min(1).max(80)}).strict()
export function registerColorRoutes(app,{db,requireAdmin}){
 app.get('/api/colors',async(_req,res,next)=>{try{res.json((await readColorCatalog(db)).colors)}catch(e){next(e)}})
 app.get('/api/admin/colors',requireAdmin,async(req,res,next)=>{try{const catalog=await readColorCatalog(db);res.json(req.query.includeAliases==='1'?catalog.all:catalog.colors)}catch(e){next(e)}})
 app.post('/api/admin/colors',requireAdmin,async(req,res,next)=>{try{
  const input=z.object({createOnly:z.boolean().optional().default(false),color:colorSchema,assignments:z.array(z.object({productId:z.number().int().positive(),fields:z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/)).max(30).default([])}).strict()).max(50)}).strict().parse(req.body)
  if(new Set(input.assignments.map(x=>x.productId)).size!==input.assignments.length)return res.status(400).json({error:'duplicate_product_assignment'})
  const color={...input.color,hex:input.color.hex.toLowerCase()}
  if(input.createOnly&&(await readColorCatalog(db)).colors.some(c=>colorNameKey(c)===colorNameKey(color)))return res.status(409).json({error:'color_exists'})
  await db.runTransaction(async tx=>{
   const existing=await tx.get(db.collection('colorLibrary').doc(color.hex.slice(1)))
   if(input.createOnly&&existing.exists&&!existing.get('deleted'))throw Object.assign(Error('color_exists'),{code:'color_exists'})
   const snapshots=[]
   for(const assignment of input.assignments){const ref=db.collection('products').doc(String(assignment.productId)),snap=await tx.get(ref);if(!snap.exists)throw Object.assign(Error('product_not_found'),{code:'not_found'});snapshots.push({assignment,ref,product:snap.data()})}
   for(const entry of snapshots){const key=categoryId(entry.product.category),snap=await tx.get(db.collection('categories').doc(key));entry.category=snap.exists?snap.data():null;const allowed=configurationFields(entry.category,entry.product).filter(requiresColor);if(entry.assignment.fields.some(key=>!allowed.some(f=>f.key===key)))throw Object.assign(Error('invalid_color_section'),{code:'invalid_data'})}
   for(const {assignment,ref,product} of snapshots){const colors=[...(product.colors||[]).filter(c=>c.hex.toLowerCase()!==color.hex),color];if(colors.length>50)throw Object.assign(Error('color_limit'),{code:'invalid_data'});const field_options={...(product.field_options||{})};for(const key of assignment.fields){const old=field_options[key]||{};field_options[key]={...old,colors:[...fieldPalette(product,key).filter(c=>c.hex.toLowerCase()!==color.hex),color]};if(field_options[key].colors.length>50)throw Object.assign(Error('color_limit'),{code:'invalid_data'})}const pending=new Set(product.pending_color_assignments||[]);if(assignment.fields.length)pending.delete(color.hex);else if(!Object.values(field_options).some(x=>x.colors?.some(c=>c.hex.toLowerCase()===color.hex)))pending.add(color.hex);tx.update(ref,{colors,field_options,color_library_managed:true,pending_color_assignments:[...pending],updated_at:FieldValue.serverTimestamp()})}
   tx.set(db.collection('colorLibrary').doc(color.hex.slice(1)),{color,deleted:false,updated_at:FieldValue.serverTimestamp()})
  });res.json({ok:true,updatedProducts:input.assignments.map(x=>x.productId)})
 }catch(e){if(e.code==='color_exists')return res.status(409).json({error:'color_exists'});next(e)}})
 app.delete('/api/admin/colors/:hex',requireAdmin,async(req,res,next)=>{try{
  const hex='#'+z.string().regex(/^[0-9a-fA-F]{6}$/).parse(req.params.hex).toLowerCase()
  await db.runTransaction(async tx=>{
   const saved=await tx.get(db.collection('colorLibrary').limit(501)),products=await tx.get(db.collection('products').limit(501)),details=await tx.get(db.collection('detailLibrary').limit(501)),categories=await tx.get(db.collection('categories').limit(501))
   if([saved,products,details,categories].some(s=>s.size>500))throw Object.assign(Error('limit'),{code:'color_cleanup_limit'})
   const blocked=new Set(saved.docs.filter(d=>d.get('deleted')).map(d=>d.id.toLowerCase()))
   const catalog=availableColors([...products.docs.flatMap(d=>d.get('colors')||[]),...saved.docs.filter(d=>!d.get('deleted')).map(d=>d.get('color'))]).filter(c=>!blocked.has(c.hex.slice(1)))
   const chosen=catalog.find(c=>c.hex===hex);if(!chosen)throw Object.assign(Error('not_found'),{code:'color_not_found'})
   const targets=catalog.filter(c=>c.hex===hex||colorNameKey(c)===colorNameKey(chosen)),hexes=new Set(targets.map(c=>c.hex))
   const retain=colors=>(colors||[]).filter(c=>!hexes.has(c.hex.toLowerCase()))
   const updates=[]
   for(const doc of products.docs){const p=doc.data(),colors=retain(p.colors),field_options=Object.fromEntries(Object.entries(p.field_options||{}).map(([key,value])=>[key,{...value,colors:retain(value.colors),...(hexes.has(value.defaultColor?.toLowerCase())?{defaultColor:null}:{})}])),pending=(p.pending_color_assignments||[]).filter(h=>!hexes.has(h.toLowerCase()))
    if(JSON.stringify(colors)!==JSON.stringify(p.colors||[])||JSON.stringify(field_options)!==JSON.stringify(p.field_options||{})||pending.length!==(p.pending_color_assignments||[]).length)updates.push([doc.ref,{colors,field_options,color_library_managed:true,pending_color_assignments:pending}])
   }
   for(const doc of details.docs){const current=doc.get('allowed_colors');if(Array.isArray(current)&&retain(current).length!==current.length)updates.push([doc.ref,{allowed_colors:retain(current)}])}
   for(const doc of categories.docs){const current=doc.get('customization_fields');if(Array.isArray(current)){const fields=current.map(f=>Array.isArray(f.allowed_colors)?{...f,allowed_colors:retain(f.allowed_colors)}:f);if(JSON.stringify(fields)!==JSON.stringify(current))updates.push([doc.ref,{customization_fields:fields}])}}
   if(updates.length+targets.length>450)throw Object.assign(Error('limit'),{code:'color_cleanup_limit'})
   for(const [ref,data] of updates)tx.update(ref,{...data,updated_at:FieldValue.serverTimestamp()})
   for(const color of targets)tx.set(db.collection('colorLibrary').doc(color.hex.slice(1)),{color,deleted:true,updated_at:FieldValue.serverTimestamp()})
  });res.json({ok:true})
 }catch(e){if(e.code==='color_not_found')return res.status(404).json({error:'not_found'});if(e.code==='color_cleanup_limit')return res.status(409).json({error:'color_cleanup_limit'});next(e)}})

}





