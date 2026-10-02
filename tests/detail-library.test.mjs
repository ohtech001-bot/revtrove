import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {configurationFields,fieldPalette} from '../shared/product-configuration.mjs'
test('Referenced category details are inherited without product title/type overrides',()=>{
 const field={key:'logo',label_ar:'لون الشعار',label_en:'Logo',label_he:'לוגו',library_managed:true,colorEnabled:true,textEnabled:false,allowed_colors:[{hex:'#123456'}]}
 const category={detail_keys:['logo'],customization_fields:[field]},product={enabled_color_fields:[],field_labels:{logo:{label_ar:'wrong'}},colors:[{hex:'#123456',name_ar:'أزرق'},{hex:'#654321',name_ar:'أحمر'}]}
 assert.deepEqual(configurationFields(category,product),[field])
 assert.deepEqual(fieldPalette(product,'logo',field),[])
 assert.deepEqual(fieldPalette({...product,field_options:{logo:{colors:[product.colors[0]]}}},'logo',field),[product.colors[0]])
 assert.deepEqual(fieldPalette({...product,field_options:{logo:{colors:[product.colors[1]]}}},'logo',field),[])
 assert.deepEqual(fieldPalette(product,'logo',{...field,allowed_colors:[]}),[])
 const legacy={customization_fields:[{...field,library_managed:false}],library_fields:[{...field,label_ar:'اسم جديد'}]}
 assert.equal(configurationFields(legacy,product)[0].label_ar,'اسم جديد')
 assert.equal(configurationFields(legacy,product)[0].library_managed,true)
})
test('Product details are Arabic read-only rows and category adds use the library selector',async()=>{
 const product=await readFile(new URL('../client/src/ProductDetails.jsx',import.meta.url),'utf8')
 const inventory=await readFile(new URL('../client/src/AdminInventory.jsx',import.meta.url),'utf8')
 const admin=await readFile(new URL('../client/src/AdminDetails.jsx',import.meta.url),'utf8')
 assert.ok(product.includes('<strong>{field.label_ar}</strong>'))
 assert.ok(!product.includes('label_en'));assert.ok(!product.includes('setFieldLabels'));assert.ok(!product.includes('type="text"'))
 assert.ok(product.includes('palette=colors||product.colors||[]'));assert.ok(product.includes('إضافة ألوان'));assert.ok(product.includes('askConfirmation'))
 assert.ok(inventory.includes('<DetailSelector'));assert.ok(inventory.includes('detailKeys:fields.map(f=>f.key)'))
 assert.ok(admin.includes("['ar','en','he'].map"));assert.ok(admin.includes("'/api/admin/details'"))
})

test('Product color support is explicit, scoped per detail and bounded by global detail choices',()=>{
 const blue={hex:'#123456'},red={hex:'#654321'},field={allowed_colors:[blue,red]}
 assert.deepEqual(fieldPalette({},'rim',field),[])
 assert.deepEqual(fieldPalette({colors:[blue,red]},'rim',field),[])
 assert.deepEqual(fieldPalette({colors:[blue,red]},'rim'),[])
 const product={colors:[blue,red],field_options:{rim:{colors:[blue]}}}
 assert.deepEqual(fieldPalette(product,'rim',field),[blue])
 assert.deepEqual(fieldPalette(product,'caliper',field),[])
 assert.deepEqual(fieldPalette(product,'rim',{allowed_colors:[red]}),[])
 assert.deepEqual(fieldPalette({...product,field_options:{rim:{colors:[]}}},'rim',field),[])
 assert.deepEqual(fieldPalette(product,'rim',{allowed_colors:[...field.allowed_colors,{hex:'#abcdef'}]}),[blue])
})

