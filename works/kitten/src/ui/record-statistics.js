// 已结束记录；北京时间开始日归属。不推断逐小时投入或睡眠质量。
export const categories=[['focus','专注'],['rest','休息'],['sleep','睡眠定时'],['meditate','冥想']];
export const recordCategory=r=>r.kind==='short'||r.kind==='long'?'rest':r.kind;
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
export const beijingDay=t=>dayFormatter.format(new Date(t));
export function shiftDay(day,delta){return new Date(Date.parse(day+'T12:00:00+08:00')+delta*86400000).toISOString().slice(0,10);}
export function aggregateRecords(records,{start,end,mode='all',activities=null}={}){
 const dated=records.map(record=>({record,day:beijingDay(record.startedAt)})).filter(({record:r,day})=>(!start||day>=start)&&(!end||day<=end)&&(mode==='all'||recordCategory(r)===mode)&&(!activities||activities.includes(r.activity)));
 const selected=dated.map(r=>r.record),daily=new Map();for(const {record:r,day} of dated){const entry=daily.get(day)||{ms:0,count:0};entry.ms+=r.effectiveMs;entry.count++;daily.set(day,entry);}
 const total=selected.reduce((n,r)=>n+r.effectiveMs,0),focus=selected.filter(r=>r.kind==='focus');
 const days=[];if(start&&end)for(let d=start;d<=end;d=shiftDay(d,1))days.push({day:d,...(daily.get(d)||{ms:0,count:0})});
 const modes=categories.map(([id,label])=>({id,label,ms:selected.filter(r=>recordCategory(r)===id).reduce((n,r)=>n+r.effectiveMs,0)}));
 const byActivity=new Map();for(const r of selected)byActivity.set(r.activity,(byActivity.get(r.activity)||0)+r.effectiveMs);
 const activitiesAll=[...byActivity].map(([label,ms])=>({label,ms,activities:[label]})).sort((a,b)=>b.ms-a.ms||a.label.localeCompare(b.label,'zh-CN'));
 const activityRows=activitiesAll.slice(0,4);if(activitiesAll.length>4)activityRows.push({label:'其他活动',ms:activitiesAll.slice(4).reduce((n,r)=>n+r.ms,0),activities:activitiesAll.slice(4).map(r=>r.label)});
 return {selected,total,focusMs:focus.reduce((n,r)=>n+r.effectiveMs,0),completedFocus:focus.filter(r=>r.status==='completed').length,days,modes,activities:activityRows};
}
export function durationLabel(ms){const s=Math.max(0,Math.floor(ms/1000));return s<60?s+'秒':s<3600?Math.floor(s/60)+'分'+(s%60?' '+s%60+'秒':''):Math.floor(s/3600)+'小时 '+Math.floor(s%3600/60)+'分';}
