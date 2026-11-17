import {Timer} from './core/timer.js';
import {createStorage} from './core/storage.js';
import {meta} from './core/config.js';
import {createView} from './ui/view.js';
import {renderRecords} from './ui/records-view.js';
import {createCatPlayer} from './cat/player.js';
import {createBallScheduler} from './cat/ball-scheduler.js';
import {createAudioController} from './audio/controller.js';
import * as synthesis from './audio/synthesis.js';
import {loadAudioCatalog,mountCatalog} from './audio/catalog.js';
const $=id=>document.getElementById(id);
let toastTimer,confirmation=null,filter='all',lastSave=0;
function notice(text) {$('storage-notice').textContent=text;$('storage-notice').hidden=false;}
function notify(text) {clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
const storage=createStorage(undefined,notice),saved=storage.load();
// URL用于真实透明帧，不将7MB素材重新塞进HTML。
const response=await fetch(new URL('../assets/animation.json',import.meta.url));
if(!response.ok)throw Error('小猫素材映射无法读取');
const data=await response.json();
for(const key of Object.keys(data.images))data.images[key]=new URL(data.images[key],document.baseURI).href;
const cat=createCatPlayer(data);
cat.setReduced(saved.settings.motion===null?matchMedia('(prefers-reduced-motion: reduce)').matches:saved.settings.motion,saved.settings.motion!==null);
let audio,view,ball;
const timer=new Timer(saved,{audio:()=>audio?.recordState()||{source:'none',output:'页面恢复前未播放'}});
const recordView=()=>{renderRecords(timer.inspect(),filter,storage.inspect().available);view?.renderTimer();};
view=createView(timer,cat,storage,recordView);
function persist(replaceRecords=false) {
  const envelope=timer.serialize();storage.save(envelope,{replaceRecords});timer.records=envelope.records;lastSave=Date.now();
}
timer.onChange=(type,detail)=>{
  persist(type==='clear');
  if(type!=='activity')view.render();
  audio?.sync();
  if(type==='finish')notify(meta[detail.record.kind].name+(detail.record.status==='completed'?'已完成':'已结束')+(storage.inspect().available?'，已保存记录。':'，记录仅在本页暂存。'));
};
view.render();
let audioCatalog={schemaVersion:1,audio:[],links:[]};
try{audioCatalog=await loadAudioCatalog(new URL('../assets/audio/catalog.json',import.meta.url));}catch{notice('声音素材清单无法读取，现有合成噪声与本地音乐仍可使用。');}
mountCatalog(audioCatalog);
audio=createAudioController(()=>timer.inspect(),synthesis,timer.settings.audio,settings=>{timer.settings.audio=settings;persist();},audioCatalog);
ball=createBallScheduler(cat,()=>timer.inspect(),data);
persist();
if(saved.session)notify(timer.session?(timer.status==='running'?'本轮已恢复，离开页面的时间已计入。':'本轮已恢复暂停，准备好后继续。'):'本轮在离开页面期间到期，已保存记录。');
function primary() {
  if(timer.tick())return;
  if(['completed','ended'].includes(timer.status)){timer.reset();return;}
  if(!timer.session){timer.start($('activity-input').value);return;}
  if(timer.status==='running')timer.pause();else timer.resume();
}
function closeConfirm() {$('confirm-dialog').close();confirmation=null;}
function confirmAction(title,body,label,action,cancel='保留本轮') {
  if($('confirm-dialog').open)return;
  $('confirm-title').textContent=title;$('confirm-body').textContent=body;$('confirm-accept').textContent=label;$('confirm-cancel').textContent=cancel;
  confirmation=action;$('confirm-dialog').showModal();
}
function showRecords(on) {
  const changed=$('record-view').hidden===on;
  $('timer-view').hidden=on;$('record-view').hidden=!on;if(on)recordView();
  // 切页后接续键盘任务；重复选择当前模式不抢走焦点，也不触发按钮。
  if(changed)(on?$('back-timer'):$('primary-action')).focus({preventScroll:true});
}
function requestKind(next) {
  timer.tick();if(next===timer.kind){showRecords(false);return;}
  if(timer.session)confirmAction('结束本轮并切换？','当前'+meta[timer.kind].name+(timer.status==='paused'?'已暂停。':'仍在计时。')+'结束后保存有效时长，再切换到'+meta[next].name+'。','结束并切换',()=>{timer.finish();timer.switchKind(next);showRecords(false);});
  else{timer.switchKind(next);showRecords(false);}
}
$('primary-action').addEventListener('click',primary);
$('secondary-action').addEventListener('click',()=>{timer.tick();timer.finish();});
document.querySelectorAll('.modes [data-mode]').forEach(b=>b.addEventListener('click',()=>requestKind(b.dataset.mode)));
document.querySelectorAll('.rhythm [data-kind]').forEach(b=>b.addEventListener('click',()=>requestKind(b.dataset.kind)));
$('activity-input').addEventListener('input',()=>timer.activity($('activity-input').value));
$('presets').addEventListener('click',e=>{const b=e.target.closest('[data-minutes]');if(b)timer.duration(Number(b.dataset.minutes));});
$('custom-duration').addEventListener('click',()=>{if(timer.session)return;$('minutes-input').value=timer.settings.durations[timer.kind]/60;$('duration-title').textContent='设置'+meta[timer.kind].name+'时长';$('duration-dialog').showModal();$('minutes-input').focus();});
$('duration-form').addEventListener('submit',e=>{e.preventDefault();if(timer.session||!$('duration-form').reportValidity())return;const n=Number($('minutes-input').value);if(!Number.isInteger(n)||n<1||n>240)return;$('duration-dialog').close();timer.duration(n);});
$('open-sound').addEventListener('click',()=>$('sound-dialog').showModal());
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
$('open-records').addEventListener('click',()=>showRecords(true));$('back-timer').addEventListener('click',()=>showRecords(false));
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});recordView();}));
$('confirm-cancel').addEventListener('click',closeConfirm);$('confirm-dialog').addEventListener('cancel',()=>{confirmation=null;});
$('confirm-accept').addEventListener('click',()=>{const action=confirmation;closeConfirm();action?.();});
$('clear-records').addEventListener('click',()=>confirmAction('清除本机记录？','清除当前浏览器、当前网页地址的全部实际记录。当前计时与时长设置保留，此操作无法撤回。','清除记录',()=>{timer.clearRecords();recordView();notify('本机记录已清除。');},'保留记录'));
$('reduce-motion').addEventListener('change',()=>{timer.settings.motion=$('reduce-motion').checked;cat.setReduced(timer.settings.motion);persist();});
function reconcile(){audio.sync('return');timer.tick();view.renderTimer();persist();}
document.addEventListener('visibilitychange',reconcile);
window.addEventListener('pagehide',e=>{timer.tick();persist();if(!e.persisted)clearInterval(poll);});
window.addEventListener('pageshow',e=>{if(e.persisted){reconcile();view.render();ball.sync();}});
const poll=setInterval(()=>{timer.tick();view.renderTimer();if(timer.session&&Date.now()-lastSave>5000)persist();},200);
window.addEventListener('beforeunload',()=>{timer.tick();persist();});
// 只供工程检查导入；产品界面没有试跑按钮或开发指标。
export const app=Object.freeze({timer,cat,ball,audio,storage,ready:true});
