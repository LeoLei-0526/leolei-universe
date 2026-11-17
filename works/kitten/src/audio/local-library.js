// 用户主动选择的文件只保存在当前地址的浏览器里，不发送到服务端。
export function createLocalLibrary() {
  let opening;
  function open() {
    if(!globalThis.indexedDB)return Promise.reject(Error('浏览器不支持文件保存'));
    if(!opening)opening=new Promise((resolve,reject)=>{
      const req=indexedDB.open('kitten-pomodoro-local-audio',1);
      req.onupgradeneeded=()=>req.result.createObjectStore('files');
      req.onerror=()=>{opening=null;reject(req.error||Error('文件库无法打开'));};
      req.onblocked=()=>{opening=null;reject(Error('文件库被其他页面占用'));};
      req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
    });
    return opening;
  }
  async function save(mode,file) {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('files','readwrite');tx.objectStore('files').put({file,name:file.name,type:file.type},mode);
      tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error||Error('文件保存失败'));
    });
  }
  async function load(mode) {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('files','readonly'),req=tx.objectStore('files').get(mode);
      req.onsuccess=()=>{const row=req.result;resolve(row?.file instanceof Blob?new File([row.file],row.name,{type:row.type}):null);};
      req.onerror=()=>reject(req.error||Error('文件读取失败'));
    });
  }
  return {save,load};
}
