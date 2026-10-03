const key='revtrove-admin-token'
export function tokenExpiry(token){
  try{const data=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return Number(data.exp)*1000||0}catch{return 0}
}
export function clearAdminSession(){sessionStorage.removeItem(key);localStorage.removeItem(key)}
export function readAdminSession(){
  const token=localStorage.getItem(key)||sessionStorage.getItem(key)||''
  if(tokenExpiry(token)<=Date.now()){clearAdminSession();return ''}
  return token
}
export function saveAdminSession(token,remember){clearAdminSession();(remember?localStorage:sessionStorage).setItem(key,token)}
