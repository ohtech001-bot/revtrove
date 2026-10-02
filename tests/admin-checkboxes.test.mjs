import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
test('Admin detail and bulk color checkboxes use the same fixed square dimensions',async()=>{
 const css=await readFile(new URL('../client/src/admin-checkboxes.css',import.meta.url),'utf8')
 assert.ok(css.includes('.detail-color-picker input[type="checkbox"]'))
 assert.ok(css.includes('.bulk-color-options input[type="checkbox"]'))
 for(const rule of ['width:18px','height:18px','min-width:18px','max-width:18px','flex:0 0 18px','padding:0'])assert.ok(css.includes(rule))
 const app=await readFile(new URL('../client/src/App.jsx',import.meta.url),'utf8')
 assert.ok(app.includes("import './admin-checkboxes.css'"))
})
