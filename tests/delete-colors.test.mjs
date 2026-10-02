import test from 'node:test'
import assert from 'node:assert/strict'
import {visibleColors,colorNameKey} from '../shared/color-choices.mjs'
test('Same named shades display once; saved spelling and degree take precedence',()=>{
 const records=[{hex:'#101114',name_ar:'اسود'},{hex:'#f4f4ef',name_ar:'ابيض'},{hex:'#000000',name_ar:'أسود'},{hex:'#ffffff',name_ar:'أبيض'},{hex:'#333333',name_ar:'رمادي غامق'}]
 const colors=visibleColors(records)
 assert.equal(colors.length,3);assert.ok(colors.some(c=>c.hex==='#000000'));assert.ok(colors.some(c=>c.hex==='#ffffff'))
 assert.equal(colorNameKey(records[0]),colorNameKey(records[2]))
 assert.notEqual(colorNameKey({name_ar:'أزرق فاتح'}),colorNameKey({name_ar:'أزرق غامق'}))
})
