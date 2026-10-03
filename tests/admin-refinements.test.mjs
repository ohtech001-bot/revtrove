import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import postcss from 'postcss'
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
test('Mobile filters remain in one row with a smaller selector and usable search width',()=>{
 const css=source('client/src/admin-drawer.css');postcss.parse(css)
 assert.ok(css.includes('.admin-filters:not(.archive-filters){grid-template-columns:minmax(0,1fr) minmax(98px,112px)'))
 assert.ok(css.includes('.admin-filters>select'));assert.ok(css.includes('height:44px'))
})
test('Detail and color editors have non-submit top-left close buttons disabled while saving',()=>{
 for(const file of ['AdminDetails.jsx','AdminColors.jsx']){
  const text=source('client/src/'+file)
  assert.ok(text.includes('type="button" className="editor-corner-close" disabled={busy}'))
  assert.ok(text.includes('<X size={20}/>'))
 }
 assert.ok(source('client/src/admin-drawer.css').includes('position:absolute;left:14px;top:14px'))
})
test('Password creation, settings and recovery all use a minimum of eight, not an exact length',()=>{
 for(const file of ['server/src/index.js','server/src/lib/password-recovery.js']){
  const text=source(file);assert.ok(text.includes('.min(8)'));assert.ok(!text.includes('.min(12)'))
 }
 for(const file of ['server/scripts/set-admin-password.js','server/src/init-db.js'])assert.ok(source(file).includes('length<8'))
 const form=source('client/src/AdminInventory.jsx')
 assert.ok(form.includes("['newPassword',c.newPassword,8,"));assert.ok(form.includes("['confirm',c.confirm,8,"))
 assert.ok(source('client/src/PasswordRecovery.jsx').includes('minLength={8}'))
})
