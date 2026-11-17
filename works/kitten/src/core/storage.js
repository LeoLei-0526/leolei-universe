import {defaults,meta} from './config.js';
import {mergeRecords,validRecord} from './records.js';
import {normalizeAudioPreferences} from '../audio/preferences.js';
export const KEY='kitten-pomodoro-app-v1', LEGACY_KEY='kitten-pomodoro-prototype-v1';
export function validSession(s) {
  return !!(s && typeof s.id==='string' && s.id.length>0 && meta[s.kind] && typeof s.activity==='string' && Number.isFinite(s.startedAt) && s.startedAt>=0 &&
    Number.isFinite(s.durationMs) && s.durationMs>=1000 && s.durationMs<=14400000 && Number.isFinite(s.elapsedMs) && s.elapsedMs>=0 && s.elapsedMs<=s.durationMs &&
    (s.segmentStart===null || Number.isFinite(s.segmentStart) && s.segmentStart>=s.startedAt));
}
function damaged(data) {
  const s=data.settings;
  return !Array.isArray(data.records)||data.records.some(r=>!validRecord(r))||
    (data.session!=null&&(!validSession(data.session)||data.status==='running'&&!Number.isFinite(data.session.segmentStart)))||
    (data.summary!=null&&(!validRecord(data.summary)||!Number.isFinite(data.summary.durationMs)))||
    !s||Object.keys(meta).some(k=>s.durations?.[k]!=null&&(!Number.isInteger(s.durations[k])||s.durations[k]<60||s.durations[k]>14400)||s.tasks?.[k]!=null&&typeof s.tasks[k]!=='string')||
    (s.motion!=null&&typeof s.motion!=='boolean');
}
export function sanitize(data, legacy=false) {
  const settings=defaults();
  for(const k of Object.keys(meta)) {
    const d=data.settings?.durations?.[k],t=data.settings?.tasks?.[k];
    if(Number.isInteger(d)&&d>=60&&d<=14400) settings.durations[k]=d;
    if(typeof t==='string') settings.tasks[k]=t.slice(0,64);
  }
  if(typeof data.settings?.motion==='boolean') settings.motion=data.settings.motion;
  settings.audio=normalizeAudioPreferences(data.settings?.audio,data.session?.kind||data.kind||'focus');
  const records=mergeRecords(Array.isArray(data.records)?data.records:[]);
  const session=validSession(data.session)&&!records.some(r=>r.id===data.session.id)?{...data.session,activity:data.session.activity.slice(0,64),mode:meta[data.session.kind].mode}:null;
  const summary=validRecord(data.summary)&&Number.isFinite(data.summary.durationMs)?{...data.summary,remainingMs:Math.max(0,data.summary.durationMs-data.summary.effectiveMs)}:null;
  return {version:2,settings,records,session,summary,kind:session?.kind||(meta[data.kind]?data.kind:'focus'),status:session?(legacy||data.status!=='running'||!Number.isFinite(session.segmentStart)?'paused':'running'):summary?(summary.status==='completed'?'completed':'ended'):'ready'};
}
export function createStorage(getStorage=()=>globalThis.localStorage, onNotice=()=>{}) {
  let available=true,protectedData=false,notice='',backupKey=null;
  const report=t=>{if(notice!==t){notice=t;onNotice(t);}};
  function backup(store,raw) {
    // 覆写异常数据前，完整保留原字节。备份失败则只在内存继续。
    backupKey=KEY+'.backup.'+Date.now()+'.'+Math.random().toString(36).slice(2,8);
    store.setItem(backupKey,raw);
    if(store.getItem(backupKey)!==raw) throw Error('备份未落盘');
  }
  function load() {
    try {
      const store=getStorage(),primary=store.getItem(KEY),legacy=primary===null,raw=primary??store.getItem(LEGACY_KEY);
      if(raw===null) return sanitize({});
      let data;
      try {data=JSON.parse(raw);} catch {
        if(!legacy) backup(store,raw);
        report('保存数据损坏，原始内容已保留。当前从准备状态开始，旧原型数据不会被改写。');
        return sanitize({});
      }
      if(!data||data.version!==(legacy?1:2)) {
        protectedData=true;report('保存数据版本无法识别，原始内容保留。本次设置与记录仅在当前页面暂存。');return sanitize({});
      }
      const broken=damaged(data);
      if(broken&&!legacy) {backup(store,raw);report('部分保存数据无法读取：已保留完整原始备份，并恢复可读取的设置和记录。');}
      if(legacy) report('已读取当前地址下的旧原型记录；旧数据保留，新工程另行保存。');
      return sanitize(data,legacy);
    } catch {
      available=false;report('浏览器无法读写本机存储。计时可继续，设置与记录仅在当前页面暂存；刷新或关闭会丢失。');return sanitize({});
    }
  }
  function save(data,{replaceRecords=false}={}) {
    if(!available||protectedData) return false;
    try {
      const store=getStorage(),raw=store.getItem(KEY);
      if(raw!==null) {
        let latest;
        try {latest=JSON.parse(raw);} catch {backup(store,raw);}
        if(latest&&latest.version!==2) {protectedData=true;report('检测到不兼容的保存数据，原内容保留。本页暂存新记录。');return false;}
        if(latest&&damaged(latest)) {backup(store,raw);report('检测到保存数据损坏，原始字节已备份，本页可读取记录继续保留。');}
        if(latest&&!replaceRecords) data.records=mergeRecords(latest.records||[],data.records);
      }
      store.setItem(KEY,JSON.stringify({...data,version:2,savedAt:Date.now()}));return true;
    } catch {
      available=false;report('本机保存失败（存储不可用或空间不足）。本页继续计时，原有保存数据保留，新记录仅在本页暂存。');return false;
    }
  }
  return {load,save,inspect:()=>({available:available&&!protectedData,protectedData,notice,backupKey})};
}
