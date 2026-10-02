const changeKey='revtrove-catalog-changed'

// Only an invalidation marker crosses tabs. Product data still comes from the API.
export function startCatalogSync({refresh,win=window,doc=document,intervalMs=30000,onError=()=>{}}){
 let stopped=false,pending=false,announce=false,running=null
 const run=(notify=false)=>{
  if(stopped)return Promise.resolve()
  pending=true;announce ||= notify
  if(running)return running
  running=Promise.resolve().then(async()=>{
   while(pending&&!stopped){
    pending=false;const notifyTabs=announce;announce=false
    await refresh()
    if(notifyTabs&&!stopped){try{win.localStorage.setItem(changeKey,win.crypto.randomUUID())}catch{}}
   }
  }).finally(()=>{running=null})
  return running
 }
 const safelyRefresh=()=>{if(!doc.hidden)run().catch(onError)}
 const changed=event=>{if(event.key===changeKey)run().catch(onError)}
 win.addEventListener('storage',changed)
 win.addEventListener('focus',safelyRefresh)
 doc.addEventListener('visibilitychange',safelyRefresh)
 const timer=win.setInterval(safelyRefresh,intervalMs)
 run().catch(onError)
 return {refresh:()=>run(true),stop(){stopped=true;win.clearInterval(timer);win.removeEventListener('storage',changed);win.removeEventListener('focus',safelyRefresh);doc.removeEventListener('visibilitychange',safelyRefresh)}}
}
