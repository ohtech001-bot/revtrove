import {catalogColors,availableColors} from '../../../shared/color-library.mjs'
import {z} from 'zod'
import {FieldValue} from 'firebase-admin/firestore'
import {configurationFields,requiresColor,fieldPalette} from '../../../shared/product-configuration.mjs'
import {defaultCategories,categoryId} from '../../../shared/catalog-categories.mjs'
const colorSchema=z.object({hex:z.string().regex(/^#[0-9a-fA-F]{6}$/),name_ar:z.string().trim().min(1).max(80),name_en:z.string().trim().min(1).max(80),name_he:z.string().trim().min(1).max(80)}).strict()
export function registerColorRoutes(app,{db,requireAdmin}){
 app.get('/api/admin/colors',requireAdmin,async(req,res,next)=>{try{const snap=await db.collection('colorLibrary').limit(500).get();res.json(availableColors(snap.docs.map(d=>d.data().color)))}catch(e){next(e)}})
 app.post('/api/admin/colors',requireAdmin,async(req,res,next)=>{try{
  const input=z.object({createOnly:z.boolean().optional().default(false),color:colorSchema,assignments:z.array(z.object({productId:z.number().int().positive(),fields:z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/)).max(30).default([])}).strict()).max(50)}).strict().parse(req.body)
  if(new Set(input.assignments.map(x=>x.productId)).size!==input.assignments.length)return res.status(400).json({error:'duplicate_product_assignment'})
  const color={...input.color,hex:input.color.hex.toLowerCase()}
  await db.runTransaction(async tx=>{
   const existing=await tx.get(db.collection('colorLibrary').doc(color.hex.slice(1)))
   if(input.createOnly&&(existing.exists||catalogColors.some(c=>c.hex===color.hex)))throw Object.assign(Error('color_exists'),{code:'color_exists'})
   const snapshots=[]
   for(const assignment of input.assignments){const ref=db.collection('products').doc(String(assignment.productId)),snap=await tx.get(ref);if(!snap.exists)throw Object.assign(Error('product_not_found'),{code:'not_found'});snapshots.push({assignment,ref,product:snap.data()})}
   for(const entry of snapshots){const key=categoryId(entry.product.category),snap=await tx.get(db.collection('categories').doc(key));entry.category=snap.exists?snap.data():defaultCategories.find(x=>x.id===key);const allowed=configurationFields(entry.category,entry.product).filter(requiresColor);if(entry.assignment.fields.some(key=>!allowed.some(f=>f.key===key)))throw Object.assign(Error('invalid_color_section'),{code:'invalid_data'})}
   for(const {assignment,ref,product} of snapshots){const colors=[...(product.colors||[]).filter(c=>c.hex.toLowerCase()!==color.hex),color];if(colors.length>50)throw Object.assign(Error('color_limit'),{code:'invalid_data'});const field_options={...(product.field_options||{})};for(const key of assignment.fields){const old=field_options[key]||{};field_options[key]={...old,colors:[...fieldPalette(product,key).filter(c=>c.hex.toLowerCase()!==color.hex),color]};if(field_options[key].colors.length>50)throw Object.assign(Error('color_limit'),{code:'invalid_data'})}const pending=new Set(product.pending_color_assignments||[]);if(assignment.fields.length)pending.delete(color.hex);else if(!Object.values(field_options).some(x=>x.colors?.some(c=>c.hex.toLowerCase()===color.hex)))pending.add(color.hex);tx.update(ref,{colors,field_options,color_library_managed:true,pending_color_assignments:[...pending],updated_at:FieldValue.serverTimestamp()})}
   tx.set(db.collection('colorLibrary').doc(color.hex.slice(1)),{color,updated_at:FieldValue.serverTimestamp()})
  });res.json({ok:true,updatedProducts:input.assignments.map(x=>x.productId)})
 }catch(e){if(e.code==='color_exists')return res.status(409).json({error:'color_exists'});next(e)}})
}


