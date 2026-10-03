import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {shouldToggleOrder} from '../client/src/lib/order-card-interaction.mjs'
const source=path=>readFileSync(new URL('../client/src/'+path,import.meta.url),'utf8')
test('Admin navigation is a controlled sidebar and closes after choosing a section',()=>{
 const app=source('App.jsx'),drawer=source('AdminSidebar.jsx')
 assert.ok(app.includes('admin-shell admin-drawer-layout'))
 assert.ok(app.includes('<AdminSidebar open={sidebarOpen} onChange={setSidebarOpen}'))
 assert.ok(app.includes('const chooseTab=(value)=>{setSidebarOpen(false);setTab(value)'))
 for(const text of ['aria-expanded={open}','aria-controls="admin-side-navigation"','lockPageScroll()','Escape',"event.key==='Tab'",'trigger.current.focus()'])assert.ok(drawer.includes(text),text)
})
test('Mobile order details toggle inline while desktop keeps its centered dialog',()=>{
 const app=source('App.jsx')
 assert.ok(app.includes("window.matchMedia('(max-width:800px)')"))
 assert.ok(app.includes("compact?'order-inline-details':'order-detail-backdrop'"))
 assert.ok(app.includes("role={compact?'region':'dialog'}"))
 assert.ok(app.includes('if(!open||compact)return'))
 assert.ok(app.includes('aria-expanded={open} aria-controls={detailsId}'))
 assert.ok(app.includes('order.customer_name'));assert.ok(app.includes('order.phone'));assert.ok(app.includes('order.details?.productName || order.details?.customName'))
})
test('Clicking an order summary toggles details but nested actions never do',()=>{
 let selector
 assert.equal(shouldToggleOrder({target:{closest:value=>{selector=value;return null}}}),true)
 assert.equal(shouldToggleOrder({target:{closest:()=>({tagName:'BUTTON'})}}),false)
 assert.ok(selector.includes('button,a,input'))
})
test('Compact sidebar overrides load last, preserve RTL and do not appear on invoices',()=>{
 const main=source('main.jsx'),css=source('admin-drawer.css')
 assert.ok(main.indexOf("'./admin-drawer.css'")>main.indexOf("'./mobile.css'"))
 assert.ok(css.includes('inset-inline-start:18px'));assert.ok(css.includes('flex-direction:column'))
 assert.ok(css.includes('@media print{.admin-menu-toggle,.admin-sidebar-backdrop{display:none!important}}'))
 assert.ok(css.includes('@media screen and (max-width:800px)'))
 assert.ok(css.includes('.compact-summary .chosen-color{display:none}'))
 assert.ok(css.includes('.order-inline-details .order-detail-modal'))
})
