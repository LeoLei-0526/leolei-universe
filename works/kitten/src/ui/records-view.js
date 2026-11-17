import {meta,escape,span} from '../core/config.js';
import {aggregateRecords,beijingDay,shiftDay,durationLabel,categories} from './record-statistics.js';
const $=id=>document.getElementById(id);
const dateTime=t=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(t));
const state={period:'7',date:null,distribution:'mode',activities:null,mode:'all'};
let snapshot,storageAvailable,initialized=false;
function render(){if(snapshot)renderRecords(snapshot,state.mode,storageAvailable);}
// 日期上限随北京时间刷新；只改max，不重置历史日期或任何筛选。
function syncDateLimit(today=beijingDay(Date.now())){$('record-day').max=today;}
function init(){
 initialized=true;
 $('record-period').addEventListener('change',e=>{state.period=e.target.value;state.date=null;$('record-day').value='';render();});
 $('record-day').min='1970-01-01';
 for(const event of ['focus','pointerdown'])$('record-day').addEventListener(event,()=>syncDateLimit());
 $('record-day').addEventListener('change',e=>{syncDateLimit();if(!e.target.checkValidity()){e.target.reportValidity();return;}state.date=e.target.value||null;render();});
 $('record-reset-date').addEventListener('click',()=>{state.date=null;$('record-day').value='';render();$('record-period').focus();});
 $('record-clear-activity').addEventListener('click',()=>{state.activities=null;render();document.querySelector('[data-filter="'+state.mode+'"]').focus();});
 document.querySelectorAll('[data-distribution]').forEach(b=>b.addEventListener('click',()=>{state.distribution=b.dataset.distribution;render();}));
 $('daily-chart').addEventListener('keydown',e=>{const bars=[...$('daily-chart').querySelectorAll('button')],i=bars.indexOf(document.activeElement);if(i<0)return;const next=e.key==='ArrowRight'?Math.min(i+1,bars.length-1):e.key==='ArrowLeft'?Math.max(0,i-1):e.key==='Home'?0:e.key==='End'?bars.length-1:null;if(next!==null){e.preventDefault();bars[next].focus();}});
}
export function renderRecords(s,filter='all',storageOK=true){
 if(!initialized)init();snapshot=s;storageAvailable=storageOK;
 if(state.mode!==filter)state.activities=null;state.mode=filter;
 const today=beijingDay(Date.now()),end=state.date||today,start=state.date||shiftDay(today,-(Number(state.period)-1));
 syncDateLimit(today);
 const stats=aggregateRecords(s.records,{start,end,mode:filter,activities:state.activities});
 const list=stats.selected.slice().sort((a,b)=>b.startedAt-a.startedAt);
 $('record-range-caption').textContent=state.date?end.replaceAll('-','.'):(state.period==='1'?'今天':start.slice(5).replace('-','.')+' — '+end.slice(5).replace('-','.'));
 $('record-reset-date').hidden=!state.date;
 $('record-scope').textContent=(state.date?'所选日期':state.period==='1'?'今日':'近'+state.period+'天')+' · '+(categories.find(([id])=>id===filter)?.[1]||'全部模式');
 const activityName=state.activities?(state.activities.length===1?state.activities[0]:'其他活动（'+state.activities.length+'项）'):'';
 $('record-activity-scope').hidden=!state.activities;$('record-activity-name').textContent=activityName;
 $('record-focus-time').textContent=durationLabel(stats.focusMs);$('record-focus-rounds').textContent=stats.completedFocus;
 $('record-total-time').textContent=durationLabel(stats.total);$('record-total-count').textContent=list.length+'条已结束记录';
 $('record-count').textContent=list.length+'条记录';$('record-detail-scope').textContent=state.activities?'已按活动筛选，与上方统计一致':'';
 $('active-session').hidden=!s.session;$('empty-records').hidden=list.length>0;
 $('empty-records').querySelector('span').textContent=s.records.length?'这段时间没有符合筛选的记录':'从第一轮开始，慢慢积累';
 $('empty-records').querySelector('p').textContent=s.records.length?'换个日期或模式，查看其他投入。':'完成或结束一轮计时后，这里会出现真实的时间总览。';
 const max=Math.max(60000,...stats.days.map(d=>d.ms));
 $('daily-chart').classList.toggle('is-month',stats.days.length>7);
 $('daily-chart').replaceChildren(...stats.days.map(d=>{
  const b=document.createElement('button');b.className='daily-bar';b.type='button';b.dataset.day=d.day;b.style.setProperty('--bar-height',(d.ms/max*100)+'%');b.classList.toggle('is-today',d.day===today);b.classList.toggle('is-empty',d.ms===0);
  const desc=d.day+'，有效计时 '+durationLabel(d.ms)+'，'+d.count+'条记录';b.setAttribute('aria-label',desc+'。按下查看这一天');b.title=desc;b.innerHTML='<span class="bar-value">'+escape(d.ms?durationLabel(d.ms):'0')+'</span><span class="bar-track"><i></i></span><span class="bar-day">'+(stats.days.length>7?d.day.slice(8):d.day.slice(5).replace('-','/'))+'</span>';
  const explain=()=>$('chart-readout').textContent=desc;b.addEventListener('focus',explain);b.addEventListener('mouseenter',explain);b.addEventListener('click',()=>{state.date=d.day;$('record-day').value=d.day;render();$('record-day').focus();});return b;
 }));
 if(stats.days.length>7)$('daily-chart').scrollLeft=$('daily-chart').scrollWidth;
 $('chart-readout').textContent=stats.total?(stats.days.length>7?'向左滚动查看更早日期；点击筛选，方向键逐日查看。':'点击日期查看当天；方向键可逐日查看。'):'暂无有效计时，完成一轮后会在这里显示。';
 $('trend-period').textContent=state.date?'这一天':state.period==='1'?'今天':'近'+state.period+'天';
 document.querySelectorAll('[data-distribution]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.distribution===state.distribution)));
 const rows=state.distribution==='mode'?stats.modes:stats.activities;
 $('distribution-bars').replaceChildren(...rows.map(r=>{const b=document.createElement('button');b.type='button';b.className='distribution-row';b.dataset.category=r.id||'activity';b.style.setProperty('--distribution-width',(stats.total?r.ms/stats.total*100:0)+'%');b.setAttribute('aria-label',r.label+'，'+durationLabel(r.ms)+'，'+(stats.total?Math.round(r.ms/stats.total*100):0)+'%。按下筛选');b.innerHTML='<span class="distribution-label">'+escape(r.label)+'</span><span class="distribution-value">'+durationLabel(r.ms)+'</span><span class="distribution-track"><i></i></span>';b.disabled=!r.ms;b.addEventListener('click',()=>{if(state.distribution==='mode'){const filterButton=document.querySelector('[data-filter="'+r.id+'"]');filterButton.click();filterButton.focus();}else{state.activities=r.activities;render();$('record-clear-activity').focus();}});return b;}));
 $('distribution-empty').hidden=rows.length>0;
 $('records-body').innerHTML=list.map(r=>'<tr data-record-id="'+escape(r.id)+'"><td>'+escape(r.kind==='sleep'?'睡眠定时':meta[r.kind].name)+'</td><td class="record-task">'+escape(r.activity)+'</td><td class="record-time">'+dateTime(r.startedAt)+'<br><span class="record-time-end">至 '+dateTime(r.endedAt)+'</span></td><td>'+span(r.effectiveMs)+'</td><td><span class="record-status'+(r.status==='early'?' early':'')+'">'+(r.status==='completed'?'完成':'提前结束')+'</span></td></tr>').join('');
 $('clear-records').disabled=!s.records.length;
 $('storage-scope').textContent=storageOK?'保存在当前浏览器、当前网页地址，不跨设备同步。清除浏览器数据或更换地址后可能看不到原记录。北京时间显示，跨日记录归入开始日；有效时长扣除暂停。睡眠定时不代表实测睡眠。':'本机存储不可用，新记录仅在本页暂存，关闭后会丢失。北京时间显示，跨日记录归入开始日；有效时长扣除暂停。';
}
