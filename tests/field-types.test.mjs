import test from 'node:test'
import assert from 'node:assert/strict'
import {applyColorsToFields,requiresColor} from '../shared/product-configuration.mjs'
test('Bulk colors target only color details, preserve texts, and do not alias palettes',()=>{
 const fields=[{key:'rim'},{key:'stand',colorEnabled:true},{key:'name',colorEnabled:false,textEnabled:true}]
 const options={rim:{defaultColor:'#101114'},stand:{defaultColor:'#ffffff'},name:{colors:[],defaultText:'LOGO'}}
 const colors=[{hex:'#101114',name_ar:'أسود',name_en:'Black',name_he:'שחור'}]
 const result=applyColorsToFields(fields,options,colors)
 assert.equal(requiresColor(fields[2]),false);assert.equal(result.name,options.name);assert.equal(result.rim.defaultColor,'#101114');assert.equal(result.stand.defaultColor,null)
 assert.deepEqual(result.rim.colors,colors);assert.deepEqual(result.stand.colors,colors);assert.notEqual(result.rim.colors,result.stand.colors);assert.equal(options.stand.defaultColor,'#ffffff')
})
