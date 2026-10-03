import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {loginErrorMessage} from '../shared/login-message.mjs'

test('Login uses a generic localized modal message for validation and API errors',()=>{
  assert.equal(loginErrorMessage('ar'),'البيانات غير صحيحة')
  assert.equal(loginErrorMessage('en'),'Invalid credentials')
  assert.equal(loginErrorMessage('he'),'הפרטים שגויים')
  const app=readFileSync(new URL('../client/src/App.jsx',import.meta.url),'utf8')
  assert.ok(app.includes('data-validation-message={loginErrorMessage(language)}'))
  assert.ok(app.includes('<p className="form-error">{loginErrorMessage(language)}</p>'))
  const dialogs=readFileSync(new URL('../client/src/lib/site-dialogs.js',import.meta.url),'utf8')
  assert.ok(dialogs.includes('if(form.dataset.validationMessage){showMessage(form.dataset.validationMessage);return}'))
})
