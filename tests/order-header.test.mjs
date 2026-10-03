import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import postcss from 'postcss'
const source=path=>readFileSync(new URL('../client/src/'+path,import.meta.url),'utf8')
test('Order customer appears beside the identifier and the product name appears once in the card',()=>{
 const app=source('App.jsx'),order=app.slice(app.indexOf('function LegacyOrderCard('),app.indexOf('function OrderReferenceImage('))
 const card=order.slice(order.indexOf('<article'),order.indexOf('</article>'))
 const head=card.slice(card.indexOf('<div className="order-head">'),card.indexOf('className="status-pill"'))
 assert.ok(head.includes('customer compact-customer'));assert.ok(head.includes('order.customer_name'));assert.ok(head.includes('order.phone'))
 assert.equal(order.split('<b>{order.customer_name}</b>').length-1,1)
 assert.equal(order.split('<b>{order.details?.productName || order.details?.customName}</b>').length-1,1)
})
test('Expanded details do not repeat customer, order identifier or product title and notes need no disclosure',()=>{
 const app=source('App.jsx'),expanded=app.slice(app.indexOf('{open && <div className={compact?'),app.indexOf('function OrderReferenceImage('))
 assert.ok(!expanded.includes('<header>'));assert.ok(!expanded.includes('<details'))
 assert.ok(!expanded.includes('<b>{order.customer_name}</b>'))
 assert.ok(!expanded.includes('<b>{order.details?.productName || order.details?.customName}</b>'))
 assert.ok(expanded.includes('order-visible-notes'));assert.ok(expanded.includes("{order.notes||'—'}"))
 assert.ok(expanded.includes('order-selected-colors'));assert.ok(expanded.includes('order-selected-texts'))
})
test('Customer/header columns and centered product name are responsive and CSS remains valid',()=>{
 const css=source('admin-drawer.css');postcss.parse(css)
 assert.ok(css.includes('grid-template-columns:48px minmax(0,1fr) auto'))
 assert.ok(css.includes('.compact-summary{text-align:center;justify-content:center'))
 assert.ok(css.includes('white-space:pre-wrap'))
})
