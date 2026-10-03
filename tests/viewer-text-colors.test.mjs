import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {textColorTarget,viewerTextColors} from '../shared/viewer-text-colors.mjs'

const fields=[
  {key:'random-base-id',type:'color',label_ar:'لون النص على القاعدة'},
  {key:'random-caliper-id',type:'color',label_ar:'لون النص على الكليبر'},
]
test('database text color details independently tint their decals',()=>{
  assert.deepEqual(viewerTextColors(fields,{'random-base-id':'#df2029','random-caliper-id':'#174db8'}),{stand:'#df2029',caliper:'#174db8'})
  assert.deepEqual(viewerTextColors(fields,{'random-base-id':'#78c850'}),{stand:'#78c850',caliper:'#f4f4ef'})
})
test('binding accepts multilingual names and saved order snapshots',()=>{
  assert.equal(textColorTarget({label_en:'Text color on base'}),'stand')
  assert.equal(textColorTarget({label_en:'text color on kaleper'}),'caliper')
  assert.equal(textColorTarget({label_he:'צבע הכתיבה על הכליבר'}),'caliper')
  assert.equal(textColorTarget({label_ar:'لون النص على الكاليبر'}),'caliper')
  assert.deepEqual(viewerTextColors([{label:'saved-id',labels:{ar:'لون النص على القاعدة'}}],{'saved-id':'#003cf0'}),{stand:'#003cf0',caliper:'#f4f4ef'})
})
test('body colors, text inputs and invalid values do not tint text',()=>{
  assert.equal(textColorTarget({key:'caliper',label_ar:'لون الكاليبر'}),null)
  assert.equal(textColorTarget({key:'stand',label_ar:'لون القاعدة'}),null)
  assert.equal(textColorTarget({type:'text',label_ar:'لون النص على القاعدة'}),null)
  assert.deepEqual(viewerTextColors(fields,{'random-base-id':'invalid'}),{stand:'#f4f4ef',caliper:'#f4f4ef'})
})
test('viewer wires selected colors to base and caliper text, including saved order previews',()=>{
  const source=readFileSync(new URL('../client/src/App.jsx',import.meta.url),'utf8')
  assert.ok(source.includes('const textColors=viewerTextColors(fields,partColors)'))
  assert.ok(source.includes('color={textColors.stand}'))
  assert.ok(source.includes('color={textColors.caliper}'))
  assert.ok(source.includes('<ProductMediaGallery product={product} fields={fields}'))
  assert.ok(source.includes('fields={parts} baseText='))
  assert.ok(source.includes('<ProductLabel text={text} color={color}'))
})
