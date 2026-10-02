import test from 'node:test'
import assert from 'node:assert/strict'
import {configurationFields,fieldPalette} from '../shared/product-configuration.mjs'
import {saveError} from '../client/src/lib/save-errors.js'
test('Product color classifications preserve text fields and pending colors are not selectable',()=>{
 const category={customization_fields:[{key:'rim',colorEnabled:true,textEnabled:false,label_en:'Rim'},{key:'name',colorEnabled:false,textEnabled:true,label_en:'Name'}]}
 const fields=configurationFields(category,{enabled_color_fields:[],field_labels:{name:{label_en:'Custom name'}}});assert.deepEqual(fields.map(f=>f.key),['name']);assert.equal(fields[0].label_en,'Custom name')
 assert.ok(!fieldPalette({colors:[{hex:'#df2029'}],pending_color_assignments:['#df2029']},'rim').some(c=>c.hex==='#df2029'))
 assert.deepEqual(fieldPalette({colors:[{hex:'#df2029'}],field_options:{rim:{colors:[]}}},'rim'),[])
 assert.deepEqual(fieldPalette({color_library_managed:true,colors:[{hex:'#df2029'}]},'caliper'),[])
})
test('Save errors identify the missing product/category field and row',()=>{
 const message=saveError({issues:[{field:'customizationFields.1.placeholder_ar',message:'Required'}]},'ar');assert.ok(message.includes('النص المائي بالعربية'));assert.ok(message.includes('#2'));assert.ok(message.includes('Required'))
 assert.ok(saveError({message:'image_required'},'en').includes('image'))
})
