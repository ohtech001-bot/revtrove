import {availableColors} from '../../../shared/color-library.mjs'
import {z} from 'zod'
import {nanoid} from 'nanoid'
import {FieldValue} from 'firebase-admin/firestore'
import {configurationFields,splitConfigurationFields,isAvailableDetail} from '../../../shared/product-configuration.mjs'
import {defaultCategories,categoryId} from '../../../shared/catalog-categories.mjs'
const keySchema=z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/)
const schema=z.object({label_ar:z.string().trim().min(1).max(80),label_en:z.string().trim().min(1).max(80),label_he:z.string().trim().min(1).max(80),type:z.enum(['color','text']),placeholder_ar:z.string().trim().max(120).default(''),placeholder_en:z.string().trim().max(120).default(''),placeholder_he:z.string().trim().max(120).default(''),colorHexes:z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(50).default([])}).strict()
export async function listDetails(db){
 const [saved,categories,products]=await Promise.all([db.collection('detailLibrary').limit(500).get(),db.collection('categories').limit(500).get(),db.collection('products').orderBy('id').limit(500).get()])
 const groups=new Map(defaultCategories.map(c=>[c.id,c])),items=new Map()
 for(const doc of categories.docs)if(!doc.get('deleted'))groups.set(doc.id,doc.data())
 const add=fields=>{for(const f of splitConfigurationFields(fields))if(!items.has(f.key))items.set(f.key,{...f,type:f.colorEnabled===false?'text':'color'})}
 for(const c of groups.values())if(Array.isArray(c.customization_fields))add(c.customization_fields)
 for(const doc of products.docs){const p=doc.data();add(configurationFields(groups.get(categoryId(p.category)),p))}
 for(const doc of saved.docs){if(doc.get('deleted'))items.delete(doc.id);else items.set(doc.id,{...doc.data(),key:doc.id})}
 return [...items.values()].filter(isAvailableDetail)
}
export async function categoryDetailFields(db,input){
 const base={name_ar:input.nameAr,name_en:input.nameEn,name_he:input.nameHe}
 if(input.detailKeys!==undefined){
  const available=await listDetails(db),selected=input.detailKeys.map(key=>available.find(f=>f.key===key))
  if(selected.some(f=>!f))throw Object.assign(Error('invalid_detail'),{code:'invalid_data'})
  return {...base,detail_keys:input.detailKeys,customization_fields:selected.map(({created_at,updated_at,type,...f})=>({...f,library_managed:true}))}
 }
 return {...base,...(input.customizationFields!==undefined?{customization_fields:input.customizationFields,detail_keys:null}:{})}
}
export function registerDetailRoutes(app,{db,requireAdmin}){
 app.get('/api/admin/details',requireAdmin,async(_req,res,next)=>{try{res.json(await listDetails(db))}catch(e){next(e)}})
 const save=async(req,res,next)=>{try{
  const input=schema.parse(req.body),key=req.params.key?keySchema.parse(req.params.key):'detail'+nanoid(16).replace(/[-_]/g,'x')
  if(!isAvailableDetail({key,label_ar:input.label_ar,colorEnabled:input.type==='color'}))return res.status(400).json({error:'detail_unavailable'})
  if(req.params.key&&!(await listDetails(db)).some(f=>f.key===key))return res.status(404).json({error:'not_found'})
  const palette=await db.collection('colorLibrary').limit(500).get(),colors=availableColors(palette.docs.map(d=>d.get('color')))
  const hexes=[...new Set(input.colorHexes.map(h=>h.toLowerCase()))],allowed_colors=hexes.map(hex=>colors.find(c=>c.hex.toLowerCase()===hex))
  if(allowed_colors.some(c=>!c))return res.status(400).json({error:'invalid_color',issues:[{field:'colorHexes',message:'Choose colors from the Colors page'}]})
  const previous=(await listDetails(db)).find(f=>f.key===key)
  if(previous&&previous.type!==input.type){
   const groups=await db.collection('categories').limit(500).get()
   if(groups.docs.some(d=>!d.get('deleted')&&(d.get('detail_keys')?.includes(key)||d.get('customization_fields')?.some(f=>f.key===key))))return res.status(409).json({error:'detail_type_in_use'})
  }
  const record={key,type:input.type,label_ar:input.label_ar,label_en:input.label_en,label_he:input.label_he,colorEnabled:input.type==='color',textEnabled:input.type==='text',placeholder_ar:input.placeholder_ar,placeholder_en:input.placeholder_en,placeholder_he:input.placeholder_he,...(input.type==='color'?{allowed_colors}:{allowed_colors:[]}),deleted:false,updated_at:FieldValue.serverTimestamp()}
  await db.collection('detailLibrary').doc(key).set(record)
  res.status(req.params.key?200:201).json({key})
 }catch(e){next(e)}}
 app.post('/api/admin/details',requireAdmin,save)
 app.patch('/api/admin/details/:key',requireAdmin,save)
 app.delete('/api/admin/details/:key',requireAdmin,async(req,res,next)=>{try{
  const key=keySchema.parse(req.params.key)
  if(!(await listDetails(db)).some(f=>f.key===key))return res.status(404).json({error:'not_found'})
  await db.runTransaction(async tx=>{
   const groups=await tx.get(db.collection('categories').limit(500)),products=await tx.get(db.collection('products').limit(500))
   if(groups.docs.some(d=>!d.get('deleted')&&(d.get('detail_keys')?.includes(key)||d.get('customization_fields')?.some(f=>f.key===key)))||products.docs.some(d=>{const c=groups.docs.find(c=>c.id===categoryId(d.get('category')))?.data();return splitConfigurationFields(configurationFields(c,d.data())).some(f=>f.key===key)}))throw Object.assign(Error('detail_in_use'),{code:'write_conflict'})
   tx.set(db.collection('detailLibrary').doc(key),{key,deleted:true,updated_at:FieldValue.serverTimestamp()})
  });res.json({ok:true})
 }catch(e){if(e.code==='write_conflict')return res.status(409).json({error:'detail_in_use'});next(e)}})
}


