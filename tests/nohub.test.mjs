import test from 'node:test'
import assert from 'node:assert/strict'
import {configurationFields,isAvailableDetail} from '../shared/product-configuration.mjs'
test('Hub color is removed from legacy, category and library customization without removing geometry',()=>{
 const product={customizable_parts:['rim','hub','disc'],model_parts:{hub:'/models/hub.glb'}}
 assert.deepEqual(configurationFields(null,product).map(f=>f.key),[])
 const fields=[{key:'rim',colorEnabled:true},{key:'hub',colorEnabled:true},{key:'detail123',label_ar:'لون المركز',colorEnabled:true},{key:'text',colorEnabled:false,textEnabled:true}]
 assert.deepEqual(configurationFields({detail_keys:fields.map(f=>f.key),customization_fields:fields},product).map(f=>f.key),['rim','text'])
 assert.equal(isAvailableDetail({key:'centerColor',colorEnabled:true}),false)
 assert.equal(isAvailableDetail({key:'text',colorEnabled:false}),true)
 assert.equal(product.model_parts.hub,'/models/hub.glb')
})

