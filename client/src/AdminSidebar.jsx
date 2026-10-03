import {useEffect,useRef} from 'react'
import {Menu} from 'lucide-react'
import {lockPageScroll} from './lib/scroll-lock.mjs'

export default function AdminSidebar({open,onChange,language,children}){
 const trigger=useRef(null),panel=useRef(null)
 const title=({ar:'قائمة الإدارة',en:'Admin menu',he:'תפריט ניהול'})[language]||'Admin menu'
 const close=({ar:'إغلاق القائمة',en:'Close menu',he:'סגירת התפריט'})[language]||'Close menu'
 useEffect(()=>{
  if(!open)return
  const unlock=lockPageScroll(),previous=document.activeElement
  const controls=()=>[...panel.current.querySelectorAll('button,a[href]')].filter(element=>!element.disabled)
  controls()[0]?.focus()
  function keyboard(event){
   if(event.key==='Escape'){event.preventDefault();onChange(false)}
   if(event.key==='Tab'){
    const items=controls(),first=items[0],last=items.at(-1)
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
   }
  }
  document.addEventListener('keydown',keyboard)
  return ()=>{unlock();document.removeEventListener('keydown',keyboard);if(trigger.current?.isConnected)trigger.current.focus();else if(previous?.isConnected)previous.focus()}
 },[open,onChange])
 return <><button ref={trigger} type="button" hidden={open} className="admin-menu-toggle" aria-label={title} aria-controls="admin-side-navigation" aria-expanded={open} onClick={()=>onChange(true)}><Menu size={23}/></button>{open&&<div className="admin-sidebar-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onChange(false)}><aside ref={panel} id="admin-side-navigation" className="admin-side-navigation" role="dialog" aria-modal="true" aria-label={title}><button type="button" className="admin-drawer-close" onClick={()=>onChange(false)} aria-label={close}><Menu size={23}/></button>{children}</aside></div>}</>
}
