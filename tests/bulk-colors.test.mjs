import test from 'node:test'
import assert from 'node:assert/strict'
import {detailColorChoices,supportColor,uniqueColors} from '../shared/color-choices.mjs'
import {readFile} from 'node:fs/promises'
test('Bulk color selection preserves existing shades, adds several and never duplicates',()=>{
 const first={hex:'#123456',name_ar:'أزرق'},second={hex:'#654321',name_ar:'أحمر'},third={hex:'#abcdef',name_ar:'آخر'}
 const allowed=detailColorChoices({allowed_colors:[first,second]},[],[first,second,third])
 const chosen=allowed.filter(c=>[first.hex,second.hex,third.hex].includes(c.hex))
 const root=chosen.reduce((list,color)=>supportColor(list,color),[first])
 assert.deepEqual(root,[first,second]);assert.deepEqual(uniqueColors([first,...chosen]),[first,second])
 assert.ok(!root.some(c=>c.hex===third.hex))
})
test('Bulk picker supports checkboxes, select all, explicit apply and cancellation without deleting saved colors',async()=>{
 const src=await readFile(new URL('../client/src/ProductDetails.jsx',import.meta.url),'utf8')
 assert.ok(src.includes('type="checkbox"'));assert.ok(src.includes('تحديد الكل'));assert.ok(src.includes('إضافة الألوان المختارة'))
 assert.ok(src.includes('disabled={!draft.length}'));assert.ok(src.includes('...current,...chosen'));assert.ok(src.includes('setDraft([])'))
 assert.ok(src.includes('askConfirmation'));assert.ok(src.includes("onClick={()=>assign(field)}"))
})

