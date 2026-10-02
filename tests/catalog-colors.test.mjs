import test from 'node:test'
import assert from 'node:assert/strict'
import {catalogColors,availableColors} from '../shared/color-library.mjs'
test('The ten reference colors are available in the color and detail library without overwriting saved colors',()=>{
 assert.equal(catalogColors.length,10)
 assert.equal(new Set(catalogColors.map(c=>c.hex)).size,10)
 assert.ok(catalogColors.every(c=>c.name_ar&&c.name_en&&c.name_he))
 const custom={hex:catalogColors[0].hex.toUpperCase(),name_ar:'اسم محفوظ',name_en:'Saved name',name_he:'שם שמור'}
 const extra={hex:'#abcdef',name_ar:'لون إضافي',name_en:'Extra',name_he:'נוסף'}
 const merged=availableColors([custom,extra])
 assert.equal(merged.length,11);assert.equal(merged.find(c=>c.hex===catalogColors[0].hex).name_ar,custom.name_ar)
 assert.ok(merged.some(c=>c.hex===extra.hex));assert.notEqual(catalogColors[0].name_ar,custom.name_ar)
})
