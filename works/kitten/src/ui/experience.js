// 只增强呈现与可访问性；不改变计时、声音偏好、存储或猫球调度。
import {app} from '../main.js';
const $=id=>document.getElementById(id),board=$('preview-board');
$('edit-activity').addEventListener('click',()=>{if(!$('activity-input').readOnly){$('activity-input').focus();$('activity-input').select();}});
function syncPresentation(){
 $('edit-activity').hidden=$('activity-input').readOnly;
 $('open-records').setAttribute('aria-pressed',String(!$('record-view').hidden));
}
new MutationObserver(syncPresentation).observe(board,{attributes:true,attributeFilter:['data-status','data-kind']});
new MutationObserver(syncPresentation).observe($('record-view'),{attributes:true,attributeFilter:['hidden']});
$('sound-dialog').addEventListener('close',()=>$('open-sound').setAttribute('aria-expanded','false'));
$('open-sound').addEventListener('click',()=>$('open-sound').setAttribute('aria-expanded','true'));
syncPresentation();
const soundState=document.createElement('span');soundState.id='header-sound-state';soundState.className='header-sound-state';soundState.setAttribute('aria-hidden','true');$('open-sound').append(soundState);
function syncAudioPresentation(){
 const s=app.audio.inspect();
 const paused=s.selected!=='none'&&((s.timer.status==='paused'&&s.armed)||/已暂停|计时暂停/.test($('pa-status').textContent));
 const text=s.muted?'已静音':s.preview?.active?'试听中':s.backgroundVoices?(s.volume===0?'已静音':'播放中'):(paused?'已暂停':'');
 soundState.textContent=text;$('open-sound').setAttribute('aria-label','声音'+(text?'，'+text:'')+'，打开声音设置');
}
new MutationObserver(syncAudioPresentation).observe($('pa-status'),{childList:true,subtree:true,characterData:true});
syncAudioPresentation();
function syncProfileLabels(){
 for(const row of document.querySelectorAll('[data-profile]')){
  const open=row.getAttribute('aria-expanded')==='true',label=row.lastElementChild,text=open?'收起 ↑':'设置 ↗';if(label.textContent!==text)label.textContent=text;
  if(open&&row.nextElementSibling!==$('pa-profile-editor')){row.after($('pa-profile-editor'));row.scrollIntoView({block:'nearest',inline:'nearest'});}
 }
}
new MutationObserver(syncProfileLabels).observe($('pa-profile-list'),{attributes:true,subtree:true,attributeFilter:['aria-expanded']});
syncProfileLabels();

// 音源的逐项试听、使用与选择器标题统一由声音面板呈现。
