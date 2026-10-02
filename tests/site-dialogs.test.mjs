import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {showMessage,askConfirmation} from '../client/src/lib/site-dialogs.js'
test('Site notifications are queued, cancel safely and restore focus without native dialogs',async()=>{
 const previousDocument=globalThis.document
 class Element{
  constructor(tag){this.tag=tag;this.children=[];this.inert=false;this.style={};this.isConnected=true}
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node)}}
  setAttribute(key,value){this[key]=value}
  remove(){this.isConnected=false;this.parent.children=this.parent.children.filter(x=>x!==this)}
  focus(){document.activeElement=this}
  querySelectorAll(tag){return this.children.flatMap(x=>[...(x.tag===tag?[x]:[]),...x.querySelectorAll(tag)])}
 }
 const body=new Element('body'),root=new Element('root'),focus=new Element('input'),listeners=new Map();body.append(root)
 globalThis.document={documentElement:{lang:'ar',dir:'rtl'},body,activeElement:focus,createElement:tag=>new Element(tag),addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)}
 try{
  const first=askConfirmation('Delete?'),second=showMessage('<script>test</script>')
  assert.equal(body.children.length,2);assert.equal(root.inert,true)
  let dialog=body.children[1].children[0];assert.equal(dialog.role,'alertdialog');assert.equal(dialog.children[1].textContent,'Delete?')
  dialog.querySelectorAll('button')[0].onclick();assert.equal(await first,false)
  dialog=body.children[1].children[0];assert.equal(dialog.children[1].textContent,'<script>test</script>')
  dialog.querySelectorAll('button').at(-1).onclick();assert.equal(await second,true)
  assert.equal(root.inert,false);assert.equal(document.activeElement,focus);assert.equal(body.children.length,1)
  const cancel=askConfirmation('Confirm?');listeners.get('keydown')({key:'Escape',preventDefault(){},stopImmediatePropagation(){}});assert.equal(await cancel,false)
  const accept=askConfirmation('Confirm?');body.children[1].querySelectorAll('button').at(-1).onclick();assert.equal(await accept,true)
 }finally{globalThis.document=previousDocument}
})
test('All site forms use app-managed validation and no native alert/confirm/prompt remains',async()=>{
 for(const file of ['App.jsx','AdminInventory.jsx','CustomOrderExtras.jsx']){const source=await readFile(new URL('../client/src/'+file,import.meta.url),'utf8');assert.doesNotMatch(source,/window\.(alert|confirm|prompt)\s*\(/);for(const form of source.matchAll(/<form\b[^>]*>/g))assert.match(form[0],/noValidate/)}
 const source=await readFile(new URL('../client/src/lib/site-dialogs.js',import.meta.url),'utf8');assert.match(source,/form\.checkValidity\(\)/);assert.match(source,/stopImmediatePropagation/);assert.match(source,/textContent=task.message/)
})
