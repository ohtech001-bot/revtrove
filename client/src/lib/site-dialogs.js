const queue=[]
let active=false
const words=()=>({ar:{title:'رسالة',ok:'حسنًا',cancel:'إلغاء',confirm:'تأكيد',invalid:'يرجى تصحيح بيانات النموذج'},en:{title:'Message',ok:'OK',cancel:'Cancel',confirm:'Confirm',invalid:'Please correct the form details'},he:{title:'הודעה',ok:'אישור',cancel:'ביטול',confirm:'אישור',invalid:'יש לתקן את פרטי הטופס'}}[document.documentElement.lang]||{title:'Message',ok:'OK',cancel:'Cancel',confirm:'Confirm',invalid:'Please correct the form details'})
export function showMessage(message){return openDialog(message,false)}
export function askConfirmation(message){return openDialog(message,true)}
function openDialog(message,confirmation,actions=[]){return new Promise(resolve=>{queue.push({message,confirmation,actions,resolve});next()})}
function next(){
 if(active||!queue.length)return
 active=true;const task=queue.shift(),copy=words(),previous=document.activeElement,scroll=document.body.style.overflow
 const backdrop=document.createElement('div');backdrop.className='site-message-backdrop'
 const dialog=document.createElement('section');dialog.className='site-message-dialog';dialog.setAttribute('role','alertdialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','site-message-title');dialog.setAttribute('aria-describedby','site-message-content');dialog.dir=document.documentElement.dir||'rtl'
 const title=document.createElement('h2');title.id='site-message-title';title.textContent=copy.title
 const content=document.createElement('p');content.id='site-message-content';content.textContent=task.message
 const buttons=document.createElement('div');buttons.className='site-message-actions';dialog.append(title,content,buttons);backdrop.append(dialog)
 const siblings=[...document.body.children].map(element=>({element,inert:element.inert}));for(const item of siblings)item.element.inert=true
 function finish(value){document.removeEventListener('keydown',keyboard,true);backdrop.remove();for(const item of siblings)item.element.inert=item.inert;document.body.style.overflow=scroll;active=false;if(previous?.isConnected)previous.focus();task.resolve(value);next()}
 function button(label,action,primary=false){const element=document.createElement('button');element.type='button';element.className='button '+(primary?'primary':'outline');element.textContent=label;element.onclick=action;buttons.append(element);return element}
 if(task.confirmation)button(copy.cancel,()=>finish(false))
 for(const action of task.actions)button(action.label,()=>{finish(false);action.run()})
 const accept=button(task.confirmation?copy.confirm:copy.ok,()=>finish(true),true)
 function keyboard(event){if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish(false)}else if(event.key==='Tab'){const controls=[...buttons.querySelectorAll('button')],first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}}
 document.body.append(backdrop);document.body.style.overflow='hidden';document.addEventListener('keydown',keyboard,true);accept.focus()
}
export function installSiteDialogs(){
 const seen=new WeakMap()
 const check=()=>{for(const node of document.querySelectorAll('.form-error,.form-success,.inventory-success')){const message=[...node.childNodes].filter(child=>child.nodeName!=='BUTTON').map(child=>child.textContent).join(' ').trim();if(!message||seen.get(node)===message)continue;seen.set(node,message);node.dataset.messagePresented='true';const actions=[...node.querySelectorAll('button')].map(button=>({label:button.textContent,run:()=>button.click()}));openDialog(message,false,actions)}}
 const observer=new MutationObserver(check);observer.observe(document.getElementById('root'),{childList:true,subtree:true,characterData:true});check()
 document.addEventListener('invalid',event=>event.preventDefault(),true)
 document.addEventListener('submit',event=>{const form=event.target;if(!(form instanceof HTMLFormElement)||form.checkValidity())return;event.preventDefault();event.stopImmediatePropagation();const invalid=form.querySelector(':invalid'),label=invalid?.getAttribute('aria-label')||[...(invalid?.closest('label')?.childNodes||[])].filter(n=>n.nodeType===3||n.nodeName==='SPAN').map(n=>n.textContent).join(' ').trim()||invalid?.name||'';showMessage(words().invalid+'\n'+label+': '+(invalid?.validationMessage||'')).then(()=>invalid?.isConnected&&invalid.focus())},true)
}
