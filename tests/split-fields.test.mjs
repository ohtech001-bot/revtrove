import test from 'node:test'
import assert from 'node:assert/strict'
import {splitConfigurationFields,requiresColor} from '../shared/product-configuration.mjs'
test('Legacy combined details split into independent editable color and text fields without mutation',()=>{
 const original=[{key:'caliper',label_ar:'لون الكاليبر',label_en:'Caliper color',label_he:'צבע קליפר',textEnabled:true}]
 const fields=splitConfigurationFields(original);assert.equal(fields.length,2);assert.equal(fields[0].key,'caliper');assert.equal(fields[0].textEnabled,false);assert.equal(fields[1].key,'caliperText');assert.equal(requiresColor(fields[1]),false);assert.equal(fields[1].label_ar,'النص على الكاليبر');assert.equal(fields[1].placeholder_en,'Enter your text');assert.equal(original[0].textEnabled,true)
 assert.deepEqual(splitConfigurationFields(fields),fields)
 const collision=splitConfigurationFields([...original,{key:'caliperText',colorEnabled:false,textEnabled:true}]);assert.equal(new Set(collision.map(f=>f.key)).size,3)
})
