import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import postcss from 'postcss'
const source=path=>readFileSync(new URL('../client/src/'+path,import.meta.url),'utf8')
test('Expanded orders show static photos, selected colors and texts, never a 360 viewer',()=>{
 const app=source('App.jsx'),order=app.slice(app.indexOf('function LegacyOrderCard('),app.indexOf('function OrderReferenceImage('))
 assert.ok(!order.includes('<ProductViewer'));assert.ok(!order.includes('mini-viewer'))
 for(const text of ['originalProduct.images[0]','order-preview-images','order-selected-colors','order-selected-texts','order-extra-information','order.reference_images','order.details?.texts'])assert.ok(order.includes(text),text)
 for(const action of ['sendQuote','copy.contactWhatsapp','setPrintOpen(true)','printReferenceImages'])assert.ok(order.includes(action),action)
})
test('Order preview has bounded small images and compact layouts for desktop and phones',()=>{
 const css=source('admin-drawer.css');postcss.parse(css)
 for(const text of ['width:min(600px,96vw)','height:110px;max-height:110px','height:82px;max-height:82px','object-fit:contain','.order-inline-details .order-compact-modal'])assert.ok(css.includes(text),text)
})
