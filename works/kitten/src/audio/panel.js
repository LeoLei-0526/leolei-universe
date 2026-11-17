import {soundModes,soundModeDescriptions} from './preferences.js';
import {formatAudioDuration} from './catalog.js';

export function createSoundPanel(api,catalog) {
  const $=id=>document.getElementById(id),tabs=[...document.querySelectorAll('[data-sound-tab]')];
  const labels={none:'保持安静',pink:'柔和噪声',brown:'低沉噪声',local:'我的本地音频',...Object.fromEntries(catalog.audio.map(x=>['asset:'+x.id,x.name]))};
  const items=new Map(catalog.audio.map(x=>['asset:'+x.id,x]));
  const sourceCategory=source=>source==='local'?'local':items.get(source)?.kind==='guide'?'meditation':items.get(source)?.kind==='music'?'music':'nature';
  const cards=[...catalog.audio.map(x=>({source:'asset:'+x.id,name:x.name,category:sourceCategory('asset:'+x.id),note:x.kind==='guide'?'人声引导 · '+formatAudioDuration(x.durationSeconds)+' · 不循环':x.kind==='music'?'轻音乐 · 完整播放':'自然录音 · 循环'})),{source:'pink',name:'柔和噪声',category:'nature',note:'合成粉红噪声'},{source:'brown',name:'低沉噪声',category:'nature',note:'合成棕色噪声'},{source:'local',name:'我的本地音频',category:'local',note:'按模式保存文件 · 不上传'}];
  const paths={nature:'M2 8c4-4 6 4 10 0s6 4 10 0M2 13c4-4 6 4 10 0s6 4 10 0M2 18c4-4 6 4 10 0s6 4 10 0',music:'M9 17V5l11-2v12M9 8l11-2M9 17c0 2-5 4-6 1s5-4 6-1Zm11-2c0 2-5 4-6 1s5-4 6-1Z',meditation:'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Zm-6 8a6 6 0 0 0 12 0M12 17v4m-4 0h8',local:'M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6'};
  let editing=null,draftSource=null,category='nature',activeTab='play';
  const rowNodes=new Map();
  const text=(el,value)=>{if(el.textContent!==value)el.textContent=value;};
  const stop=reason=>api.stopPreview?.(reason,true);
  const localName=(s,id)=>s.profiles[id]?.localName||(id===s.activeProfile?s.local?.filename:'')||'';
  const sourceName=(source,s,id)=>source==='local'?(localName(s,id)||labels.local):labels[source]||source;
  function preview(source,id){api.previewSource?.(source,id);}
  // 本机人声引导的“使用”只保存选择；即使正在计时，也由用户另点播放。
  function holdNewGuide(source){if(items.get(source)?.origin?.type==='user-import')api.pause();}
  function tab(name,focus=false) {
    if(activeTab!==name)stop('tab-change');activeTab=name;
    for(const button of tabs){const on=button.dataset.soundTab===name;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;$('sound-page-'+button.dataset.soundTab).hidden=!on;if(on&&focus)button.focus();}
  }
  for(const button of tabs){button.addEventListener('click',()=>tab(button.dataset.soundTab));button.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=tabs.indexOf(button),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tab(tabs[next].dataset.soundTab,true);
  });}
  $('pa-open-profiles').addEventListener('click',()=>{tab('profiles');$('sound-tab-profiles').focus();});
  $('pa-stop-preview').addEventListener('click',()=>stop('user-stop'));
  $('sound-dialog').addEventListener('close',()=>stop('dialog-close'));
  for(const item of cards){
    // A plain group contains two sibling buttons; neither action is nested in another button.
    const row=document.createElement('div');row.className='source-option';row.dataset.audioSource=item.source;row.dataset.sourceCategory=item.category;row.setAttribute('role','group');row.setAttribute('aria-label',item.name);
    const head=document.createElement('div');head.className='source-option-heading';
    const icon=document.createElement('span');icon.className='source-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="'+paths[item.category]+'"/></svg>';
    const copy=document.createElement('div');copy.className='source-copy';const name=document.createElement('span');name.className='source-name';name.textContent=item.name;const note=document.createElement('small');note.textContent=item.note;copy.append(name,note);head.append(icon,copy);
    const asset=items.get(item.source);
    if(asset?.origin?.type==='user-import'){
      const links=document.createElement('small');
      for(const [href,label]of [[asset.authorURL,asset.author+' ↗'],[asset.sourceURL,'B站来源 ↗']]){if(links.childNodes.length)links.append(' · ');const a=document.createElement('a');a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;links.append(a);}
      copy.append(links);
    }
    const actions=document.createElement('div');actions.className='source-option-actions';const listen=document.createElement('button');listen.type='button';listen.className='source-listen';listen.dataset.previewSource=item.source;listen.textContent='▶ 试听';listen.addEventListener('click',()=>preview(item.source,api.inspect().activeProfile));
    const use=document.createElement('button');use.type='button';use.className='source-use';use.dataset.useSource=item.source;use.textContent='使用';use.addEventListener('click',()=>{const s=api.inspect();if(item.source==='local'&&!localName(s,s.activeProfile)){$('pa-file').click();return;}api.choose(item.source);holdNewGuide(item.source);});actions.append(listen,use);row.append(head,actions);$('pa-source-cards').append(row);rowNodes.set(item.source,{row,name,note,listen,use});
  }
  function showCategory(name){if(category!==name)stop('category-change');category=name;for(const button of document.querySelectorAll('[data-sound-category]'))button.setAttribute('aria-pressed',String(button.dataset.soundCategory===name));for(const row of $('pa-source-cards').children)row.hidden=row.dataset.sourceCategory!==name;}
  for(const button of document.querySelectorAll('[data-sound-category]'))button.addEventListener('click',()=>showCategory(button.dataset.soundCategory));
  $('pa-quiet').addEventListener('click',()=>api.choose('none'));
  for(const [id,name] of Object.entries(soundModes)){
    const row=document.createElement('button');row.type='button';row.className='sound-profile-row';row.dataset.profile=id;row.setAttribute('aria-expanded','false');row.setAttribute('aria-controls','pa-profile-editor');
    const icon=document.createElement('span');icon.className='sound-profile-icon';icon.textContent={focus:'专',rest:'歇',sleep:'夜',meditate:'静'}[id];
    const label=document.createElement('span');label.className='sound-profile-label';label.append(document.createTextNode(name));const description=document.createElement('span');description.className='sound-profile-description';description.textContent=soundModeDescriptions[id];const summary=document.createElement('small');summary.id='pa-profile-summary-'+id;label.append(description,summary);
    const edit=document.createElement('span');edit.textContent='设置 ↗';row.append(icon,label,edit);row.addEventListener('click',()=>{stop('profile-change');editing=editing===id?null:id;draftSource=editing?api.inspect().profiles[editing].source:null;render(api.inspect());if(editing)$('pa-profile-editor').scrollIntoView({block:'nearest'});});$('pa-profile-list').append(row);
  }
  $('pa-profile-source').replaceChildren(...[...$('pa-source').children].map(x=>x.cloneNode(true)));
  $('pa-profile-source').addEventListener('change',e=>{draftSource=e.target.value;stop('profile-source-change');render(api.inspect());});
  $('pa-profile-preview').addEventListener('click',()=>{if(editing)preview(draftSource,editing);});
  $('pa-profile-use').addEventListener('click',()=>{if(editing){stop('profile-use');api.setProfile(editing,{source:draftSource});if(editing===api.inspect().activeProfile)holdNewGuide(draftSource);}});
  $('pa-profile-volume').addEventListener('input',e=>{if(editing)api.setProfile(editing,{volume:Number(e.target.value)/100});});
  $('pa-profile-auto').addEventListener('change',e=>{if(editing)api.setProfile(editing,{autoPlay:e.target.checked});});
  $('pa-profile-file').addEventListener('change',e=>{if(editing&&e.target.files[0]){draftSource='local';api.setProfileFile(editing,e.target.files[0]);}e.target.value='';});
  $('pa-auto-start').addEventListener('change',e=>api.setAutoPlay(e.target.checked));
  $('pa-recommend').addEventListener('click',()=>{stop('recommendations');draftSource=null;api.applyRecommendations();$('pa-profile-feedback').textContent='已为专注、专注间歇、睡前陪伴和冥想保存搭配。开始时自动播放，也可先试听再调整。';});
  const picker=$('pa-picker'),volumeControl=$('pa-volume').closest('label'),muteControl=$('pa-mute').closest('label'),controls=$('pa-pause').parentElement;
  const footer=document.createElement('div');footer.className='source-selection-footer';
  const current=document.createElement('div');current.className='source-current';const currentLabel=document.createElement('small');currentLabel.textContent='本模式已使用';const currentName=document.createElement('span');currentName.id='source-current-name';current.append(currentLabel,currentName);footer.append(current);picker.querySelector('.sound-picker-content').append($('pa-local'),footer);
  function pickerTitle(s){text($('pa-picker-title'),picker.open?'选择'+soundModes[s.activeProfile]+'的声音':'换个声音');text($('pa-picker-back'),picker.open?'← 返回播放':'＋');}
  picker.addEventListener('toggle',()=>{
    const s=api.inspect();pickerTitle(s);
    if(picker.open){footer.append(volumeControl,muteControl);showCategory(s.selected==='none'&&s.activeProfile==='meditate'?'meditation':sourceCategory(s.selected));$('pomodoro-audio-panel').scrollTop=0;}
    else{stop('picker-close');$('pa-auto-start').closest('label').before(volumeControl);controls.append(muteControl);}
  });
  function previewButton(button,source,id,s){
    const p=s.preview||{},on=!!p.active&&p.source===source&&p.profile===id,missing=source==='local'&&!localName(s,id);
    text(button,on?(p.loading?'■ 取消试听':'■ 停止试听'):'▶ 试听');button.setAttribute('aria-pressed',String(on));button.setAttribute('aria-label',(on?'停止试听 ':'试听 ')+sourceName(source,s,id)+'，'+soundModes[id]);button.disabled=!api.previewSource||source==='none'||missing;
    return on;
  }
  function render(s) {
    const item=items.get(s.selected),profile=s.profiles[s.activeProfile],p=s.preview||{};
    text($('pa-current-mode'),soundModes[s.activeProfile]+'的声音');text($('pa-current-mode-note'),soundModeDescriptions[s.activeProfile]);pickerTitle(s);
    text($('pa-track-title'),s.selected==='none'?'暂时留白':sourceName(s.selected,s,s.activeProfile));
    text($('pa-track-category'),item?.kind==='guide'?'冥想引导 · 人声引导':item?.kind==='music'?'轻音乐':item?'自然声':s.selected==='local'?'我的音频':s.selected==='none'?'安静陪伴':'合成噪声');
    text($('pa-track-detail'),s.selected==='none'?'先试听，喜欢再使用。':item?.kind==='guide'?formatAudioDuration(item.durationSeconds)+' · 不循环 · 本轮结束后停止':item?.playback.loop||['pink','brown'].includes(s.selected)?'循环陪伴 · 本轮结束后停止':'完整播放 · 本轮结束后停止');
    $('pa-play').hidden=!!s.backgroundVoices||s.pending;$('pa-pause').hidden=!s.backgroundVoices&&!s.pending;if(p.active)$('pa-play').disabled=true;$('pa-auto-start').checked=profile.autoPlay;
    text(currentName,s.selected==='none'?'保持安静':sourceName(s.selected,s,s.activeProfile));
    for(const item of cards){const n=rowNodes.get(item.source),used=item.source===s.selected,on=previewButton(n.listen,item.source,s.activeProfile,s),hasFile=!!localName(s,s.activeProfile);n.row.classList.toggle('is-used',used);n.row.classList.toggle('is-previewing',on);n.use.setAttribute('aria-pressed',String(used));text(n.use,item.source==='local'&&!hasFile?'选择文件':used?'✓ 已使用':'使用');n.use.setAttribute('aria-label',(item.source==='local'&&!hasFile?'选择本模式的文件':used?'已使用 ':'使用 ')+sourceName(item.source,s,s.activeProfile));if(item.source==='local'){text(n.name,hasFile?localName(s,s.activeProfile):item.name);text(n.note,hasFile?'本模式已保存 · 不上传':'先选择本模式的文件，再试听');}}
    $('pa-quiet').setAttribute('aria-pressed',String(s.selected==='none'));
    const previewName=p.source?sourceName(p.source,s,p.profile||s.activeProfile):'',silent=s.muted||s.volume===0;
    $('pa-preview-notice').hidden=!p.active&&!p.error&&!silent;$('pa-stop-preview').hidden=!p.active;
    text($('pa-preview-label'),p.active?(p.loading?'正在准备试听 · ':'正在试听 · ')+previewName:p.error?'试听未能播放':'声音已静音');
    text($('pa-preview-detail'),p.error|| (silent?'已静音；取消主静音或调高音量后可听到声音。':p.loading?'可以随时取消，不更改偏好。':'10秒自动停止，不更改已使用的声音。'));
    for(const [id,pr] of Object.entries(s.profiles)){text($('pa-profile-summary-'+id),sourceName(pr.source,s,id)+' · '+Math.round(pr.volume*100)+'%'+(pr.autoPlay?' · 自动播放':' · 手动播放'));document.querySelector('[data-profile="'+id+'"]').setAttribute('aria-expanded',String(id===editing));}
    $('pa-profile-editor').hidden=!editing;
    if(editing){const pr=s.profiles[editing];if(draftSource===null)draftSource=pr.source;const chosen=draftSource===pr.source,missing=draftSource==='local'&&!localName(s,editing);text($('pa-profile-editor-title'),soundModes[editing]+'偏好');text($('pa-profile-description'),soundModeDescriptions[editing]);$('pa-profile-source').value=draftSource;text($('pa-profile-source-name'),sourceName(draftSource,s,editing));text($('pa-profile-source-note'),chosen?'已使用的声音':'尚未保存 · 试听不会应用到这个模式');$('pa-profile-use').disabled=chosen||missing;text($('pa-profile-use'),chosen?'✓ 已使用':'使用此声音');previewButton($('pa-profile-preview'),draftSource,editing,s);$('pa-profile-volume').value=Math.round(pr.volume*100);$('pa-profile-volume-value').value=Math.round(pr.volume*100)+'%';$('pa-profile-auto').checked=pr.autoPlay;$('pa-profile-local').hidden=draftSource!=='local';$('pa-profile-local-help').hidden=!missing;}
  }
  showCategory(category);render(api.inspect());return {render};
}
