async function request(path,body,token,method='POST') {
  const response=await fetch(path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)})
  const value=await response.json();if(!response.ok)throw new Error(value.error||'upload_failed');return value
}
export async function uploadFile(file,kind,token) {
  const claim=await request('/api/uploads',{kind,name:file.name,contentType:kind==='productModel'?'model/gltf-binary':file.type,size:file.size},token)
  try {
    // Raw bytes go directly to Blob, not through an Express/Vercel function.
    const response=await fetch(claim.url,{method:claim.method,headers:claim.headers,body:file})
    if(!response.ok)throw new Error('storage_upload_failed')
    await request('/api/uploads/'+claim.id+'/complete',{token:claim.token},token)
    return {id:claim.id,token:claim.token}
  }catch(error){await discardUpload(claim,token).catch(()=>{});throw error}
}
export function discardUpload(claim,token) {return request('/api/uploads/'+claim.id,{token:claim.token},token,'DELETE')}
