import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import postcss from 'postcss'

const source=path=>readFile(new URL('../client/src/'+path,import.meta.url),'utf8')
test('Each product color detail has a native keyboard-accessible independent collapsed section',async()=>{
 const src=await source('ProductDetails.jsx')
 assert.ok(src.includes('fields.map(field=>'))
 assert.ok(src.includes('<details className="product-detail-fold"'))
 assert.ok(src.includes('<summary><strong>{field.label_ar}</strong>'))
 assert.ok(!src.includes('<details open'));assert.ok(!src.includes('<details name='))
 assert.ok(src.includes('selected.length'));assert.ok(src.includes('إغلاق قائمة الألوان'))
 assert.ok(src.includes('!e.currentTarget.open&&adding===field.key'))
 assert.ok(src.includes('setDraft([])'));assert.ok(src.includes('askConfirmation'))
 assert.ok(src.includes('disabled={!draft.length}'));assert.ok(src.includes('onClick={()=>assign(field)}'))
})
test('Mobile overrides are valid CSS, loaded last, scoped to screen and preserve desktop/print',async()=>{
 const css=await source('mobile.css'),root=postcss.parse(css),main=await source('main.jsx')
 root.each(node=>{if(node.type!=='comment')assert.ok(node.type==='atrule'&&node.name==='media'&&node.params.startsWith('screen and (max-width:'))})
 assert.ok(main.indexOf("'./mobile.css'")>main.indexOf("'./styles.css'"))
 assert.ok(css.includes('.admin-shell aside nav{'));assert.ok(css.includes('overflow-x:auto'))
 assert.ok(css.includes('.showcase-hero{height:auto;min-height:0;'))
 assert.ok(css.includes('.showcase-copy{position:relative;'))
 assert.ok(css.includes('.inventory-dimensions{grid-template-columns:1fr;'))
 assert.ok(css.includes('100dvh'));assert.ok(css.includes('safe-area-inset-bottom'))
 assert.ok(css.includes('font-size:16px'));assert.ok(css.includes('.cart-product-actions{flex-direction:column;'))
 assert.ok(!css.includes('overflow-x:hidden'))
})
test('Folded palettes retain fixed checkboxes and wrap color choices on small screens',async()=>{
 const css=await source('product-detail-folds.css')
 postcss.parse(css)
 assert.ok(css.includes('summary:focus-visible'))
 assert.ok(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'))
 assert.ok(css.includes('min-height:46px'));assert.ok(css.includes('min-width:0'))
 assert.ok(!css.includes('input{'));assert.ok(!css.includes('input[type="checkbox"]'))
})
