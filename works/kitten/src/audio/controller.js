import {isAssetSource,formatAudioDuration} from './catalog.js';
import {normalizeAudioPreferences,normalizeProfile,recommendedProfiles,soundMode,soundModes} from './preferences.js';
import {createLocalLibrary} from './local-library.js';
import {createSoundPanel} from './panel.js';
export function createAudioController(appCore, synth, savedSettings, saveSettings, catalog={audio:[],links:[]}) {
  const $ = id => document.getElementById(id), panel = $('pomodoro-audio-panel');
  if (!panel) throw Error("声音面板不存在");
  const preferences=normalizeAudioPreferences(savedSettings,appCore().kind),profiles=preferences.profiles,library=createLocalLibrary(),localFiles=new Map();
  let activeProfile=soundMode(appCore().kind),soundPanel,fileSaveNote='保存在当前浏览器，不上传。';
  let ctx, master, analyser, selected = profiles[activeProfile].source, volume = profiles[activeProfile].volume, muted = preferences.muted;
  let contactEnabled = preferences.contactEnabled, endEnabled = preferences.endEnabled, armed = false, manual = false;
  let background = null, cue = null, bgEpoch = 0, cueEpoch = 0, pendingKey = null;
  let deadlineTimer = null, last = null, noiseOffset = 0;
  // 试听有独立声部；恢复上下文只来自最初真实播放的背景，绝不来自上一段试听。
  let previewJob=null, previewRestore=null, previewError='';
  let media = null, mediaNode = null, mediaURL = null, mediaReady = false, fileVersion = 0, fileLoadTimer=0, filename = '';
  let loading = false, error = '', message = '', disposed = false, lastContact = -Infinity;
  const buffers = new Map(), expired = new Set(), notified = new Set(), log = [];
  const assetSources = new Map(catalog.audio.map(item=>['asset:'+item.id,item]));
  let assetMedia=null,assetNode=null,assetReady=false,assetVersion=0,assetLoadTimer=0;
  const counts = { backgroundStarts: 0, contact: 0, end: 0, previewContact: 0, previewEnd: 0 };
  const labels = { none: '无声音', pink: '柔和噪声（合成）', brown: '低沉噪声（合成）', local: '本地音乐' };
  for(const [key,item]of assetSources)labels[key]=item.name;
  for(const p of Object.values(profiles))if(isAssetSource(p.source)&&!assetSources.has(p.source))p.source='none';
  selected=profiles[activeProfile].source;
  const usesMedia=source=>source==='local'||isAssetSource(source);
  const playableMedia=()=>selected==='local'?mediaReady:isAssetSource(selected)?assetReady:true;
  function remember() { profiles[activeProfile]={...profiles[activeProfile],source:selected,volume};saveSettings({source:selected,volume,muted,contactEnabled,endEnabled,profiles:Object.fromEntries(Object.entries(profiles).map(([id,p])=>[id,{...p}]))}); }
  function record(type, detail = {}) { log.push({ type, at: Date.now(), ...detail }); if (log.length > 70) log.shift(); }
  function core() {
    const s = appCore(), a = s.session;
    return { kind: s.kind, status: s.status, id: a?.id || null,
      deadline: a && s.status === 'running' ? a.segmentStart + a.durationMs - a.elapsedMs : null,
      durationMs: a?.durationMs || null };
  }
  function stateKey(s) { return `${selected}|${fileVersion}|${s.id || 'manual'}|${s.deadline || 0}`; }
  function update() {
    if (disposed) return;
    const s = core(), isNoise = selected === 'pink' || selected === 'brown', asset=assetSources.get(selected);
    $('pa-mute').checked = muted; $('pa-source').value = selected;
    $('pa-local').hidden = selected !== 'local';
    $('pa-attribution').hidden = !asset;
    if(asset){
      const personal=asset.origin?.type==='user-import';
      const text=asset.license.attribution+' · '+(asset.kind==='guide'?'冥想引导 / 人声引导':asset.kind==='recording'?'实际环境录音':'音乐')+' · '+(asset.kind==='guide'?formatAudioDuration(asset.durationSeconds):Math.round(asset.durationSeconds/60*10)/10+'分钟')+(asset.playback.loop?' · 循环播放':' · 不循环')+(asset.playback.loopNote?' · '+asset.playback.loopNote:'')+(asset.usageNote?' · '+asset.usageNote:'');
      if($('pa-attribution-text').textContent!==text)$('pa-attribution-text').textContent=text;
      $('pa-source-link').href=asset.sourceURL;$('pa-source-link').textContent=personal?'B站来源 ↗':'原作者与来源 ↗';
      $('pa-author-link').hidden=!personal;$('pa-author-separator').hidden=!personal;
      if(personal){$('pa-author-link').href=asset.authorURL;$('pa-author-link').textContent=asset.author+' ↗';}
      $('pa-license-link').hidden=personal;$('pa-license-separator').hidden=personal;
      if(personal)$('pa-license-link').removeAttribute('href');else $('pa-license-link').href=asset.license.url;
    }
    $('pa-filename').textContent = filename || '尚未选择文件';
    $('pa-volume-value').value = Math.round(volume * 100) + '%';
    $('pa-volume').value = String(Math.round(volume * 100));
    $('pa-contact-enabled').checked = contactEnabled; $('pa-end-enabled').checked = endEnabled;
    $('pa-play').disabled = selected === 'none' || loading || !playableMedia() || s.status === 'paused';
    $('pa-pause').disabled = !background && !pendingKey && !previewJob;
    $('pa-stop').disabled = !background && !pendingKey && !previewJob && !cue && !(media && media.currentTime > 0) && !(assetMedia && assetMedia.currentTime > 0);
    $('pa-preview-environment').disabled = !(isNoise || asset || selected==='local');
    $('pa-preview-environment').textContent=previewJob?'停止试听':'试听 · 10 秒';
    $('pa-preview-contact').disabled = s.kind === 'sleep' || s.kind === 'meditate'; $('pa-preview-end').disabled = s.kind === 'sleep';
    const status = previewJob ? (previewJob.loading?'正在准备试听…':muted||volume===0?'正在试听 · 已静音':'正在试听 · '+(labels[previewJob.source]||'本地音乐')+' · 再点一次停止') : previewError || error || (background ? (ctx?.state !== 'running' ? '等待浏览器恢复声音' : muted || volume === 0 ? '正在运行 · 已静音' : '正在播放'+(s.id?' · 本轮结束后停止':'')) : message || (loading ? '正在准备声音…' : s.status === 'paused' && armed ? '计时暂停，声音也暂停。' : muted ? '已静音。' : selected === 'none' ? '安静计时。' : selected === 'local' && !mediaReady ? '选一首本地音频，替这个模式记住。' : profiles[activeProfile].autoPlay?'已记住，开始本模式时自动播放。':'已记住，点击播放即可。'));
    if ($('pa-status').textContent !== status) $('pa-status').textContent = status;
    panel.dataset.audioState = previewJob ? (previewJob.loading?'loading':'previewing') : error ? 'error' : background ? 'playing' : loading ? 'loading' : 'stopped';
    $('pa-file-note').textContent=fileSaveNote;
    soundPanel?.render(inspect());
  }
  function setMessage(text) { message = text; update(); }
  async function unlock() {
    if (disposed) throw new Error('页面声音已释放');
    if (!ctx) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('浏览器不支持网页音频');
      ctx = new Audio(); master = ctx.createGain(); analyser = ctx.createAnalyser();
      analyser.fftSize = 2048; master.gain.value = muted ? 0 : volume;
      master.connect(analyser); analyser.connect(ctx.destination);
      ctx.addEventListener('statechange', () => { if (ctx.state === 'running') sync(); });
      record('context-created');
    }
    if (ctx.state === 'suspended') await ctx.resume();
    if (ctx.state !== 'running') throw new Error('音频尚未解锁，请再次点击播放');
    return ctx;
  }
  function buffer(kind) {
    if (!buffers.has(kind)) {
      const pcm = synth.make(kind, ctx.sampleRate), b = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
      b.copyToChannel(pcm, 0); buffers.set(kind, b);
    }
    return buffers.get(kind);
  }
  function detach(r) {
    try { r.node?.stop(); } catch (_) { /* 已自然结束 */ }
    try { r.node?.disconnect(); r.gain?.disconnect(); } catch (_) { /* 已释放 */ }
  }
  function stopCue() {
    cueEpoch++;
    if (cue) { const c = cue; cue = null; if (ctx) c.gain.gain.setValueAtTime(0, ctx.currentTime); detach(c); }
  }
  function stopBackground(reset = false, reason = 'stop') {
    const wasPending = !!pendingKey;
    bgEpoch++; pendingKey = null; clearTimeout(deadlineTimer); deadlineTimer = null;
    const r = background; background = null;
    if (r && ctx) {
      r.gain.gain.cancelScheduledValues(ctx.currentTime); r.gain.gain.setValueAtTime(0, ctx.currentTime);
      if (!usesMedia(r.source)) noiseOffset = (r.offset + Math.max(0, ctx.currentTime - r.started)) % r.node.buffer.duration;
      detach(r);
    }
    if (media) { media.pause(); try { mediaNode?.disconnect(); } catch (_) {} if (reset) { try { media.currentTime = 0; } catch (_) {} } }
    if(assetMedia){assetMedia.pause();try{assetNode?.disconnect();}catch(_){}if(reset){try{assetMedia.currentTime=0;}catch(_){}}}
    if (reset) noiseOffset = 0;
    if (r || wasPending) record('background-stop', { reason });
  }
  function canBackground(s) {
    if (disposed || previewJob || !armed || selected === 'none' || loading || error || !playableMedia()) return false;
    if (s.id) return s.status === 'running' && s.deadline > Date.now() && !expired.has(s.id);
    return manual;
  }
  function schedule(r, s) {
    if (!s.deadline) return;
    const remaining = (s.deadline - Date.now()) / 1000;
    if (remaining <= 0) { complete(s, 'late'); return; }
    const stopAt = ctx.currentTime + remaining, fade = Math.min(Math.max(s.kind === 'sleep' ? 1.25 : .18,assetSources.get(r.source)?.playback.fadeOutSeconds||0), remaining), level=r.level;
    // 极短剩余时间也不留下到期之后的增益恢复点。
    r.gain.gain.cancelScheduledValues(ctx.currentTime);
    r.gain.gain.setValueAtTime(0, ctx.currentTime);
    r.gain.gain.linearRampToValueAtTime(level, Math.min(ctx.currentTime + .035, stopAt - .001));
    r.gain.gain.setValueAtTime(level, Math.max(ctx.currentTime, Math.min(stopAt - .001, Math.max(ctx.currentTime + .035, stopAt - fade))));
    r.gain.gain.linearRampToValueAtTime(0, stopAt);
    if (r.node) r.node.stop(stopAt);
    r.stopAtAudioTime = stopAt; r.fadeSeconds = fade;
    deadlineTimer = setTimeout(() => {
      if (background === r && r.epoch === bgEpoch) {
        const now = core();
        if (now.id && now.id !== s.id) return;
        complete(s, 'deadline');
      }
    }, Math.max(0, s.deadline - Date.now()));
  }
  async function startBackground(s) {
    const key = stateKey(s);
    if (background?.key === key || pendingKey === key) return;
    stopBackground(false, 'replace'); const epoch = bgEpoch; pendingKey = key; error = ''; message = ''; update();
    try {
      await unlock();
      if (epoch !== bgEpoch || !canBackground(core()) || stateKey(core()) !== key) return;
      const level=assetSources.get(selected)?.playback.gain||1;
      const gain = ctx.createGain(); gain.gain.setValueAtTime(0, ctx.currentTime); gain.gain.linearRampToValueAtTime(level, ctx.currentTime + .035); gain.connect(master);
      const r = { key, epoch, source: selected, gain, level, started: ctx.currentTime, offset: noiseOffset, sessionId: s.id, deadline: s.deadline };
      background = r;
      if (usesMedia(selected)) {
        const element=selected==='local'?media:assetMedia;
        if (element.ended) element.currentTime = 0;
        if(selected==='local'){if(!mediaNode)mediaNode=ctx.createMediaElementSource(media);mediaNode.connect(gain);media.loop=false;}
        else{if(!assetNode)assetNode=ctx.createMediaElementSource(assetMedia);assetNode.connect(gain);assetMedia.loop=assetSources.get(selected).playback.loop;}
        await element.play();
        if (epoch !== bgEpoch || background !== r) return;
      } else {
        r.node = ctx.createBufferSource(); r.node.buffer = buffer(selected); r.node.loop = true; r.node.connect(gain);
        r.node.start(0, noiseOffset % r.node.buffer.duration);
      }
      pendingKey = null; counts.backgroundStarts++; record('background-start', { source: selected, sessionId: s.id });
      schedule(r, s); update();
    } catch (e) {
      if (epoch === bgEpoch) { stopBackground(false, 'failed'); armed = false; manual = false; error = '声音无法播放：' + (e.name === 'NotAllowedError' ? '浏览器未允许，请主动点击播放。' : e.message || '文件或浏览器不支持。'); record('play-error', { name: e.name }); update(); }
    } finally { if (epoch === bgEpoch) pendingKey = null; }
  }
  async function playCue(kind, preview = false) {
    const s = core();
    if(previewJob&&!preview)return false;
    if (disposed || document.hidden || muted || volume === 0 || s.kind === 'sleep' || kind === 'contact' && s.kind === 'meditate') { if (preview) setMessage(s.kind === 'sleep' || kind === 'contact' && s.kind === 'meditate' ? '当前模式保持安静，不试听玩球音。' : '先取消主静音并调高网页音量，再试听。'); return false; }
    if (!preview && !(kind === 'contact' ? contactEnabled : endEnabled)) return false;
    stopCue(); const epoch = cueEpoch;
    try {
      await unlock();
      const now = core();
      if (epoch !== cueEpoch || disposed || muted || volume === 0 || document.hidden || now.kind === 'sleep' || kind === 'contact' && now.kind === 'meditate' || (!preview && !(kind === 'contact' ? contactEnabled : endEnabled))) return false;
      const node = ctx.createBufferSource(), gain = ctx.createGain(); node.buffer = buffer(kind); gain.gain.value = .8;
      node.connect(gain); gain.connect(master); const c = { node, gain, kind, preview, epoch }; cue = c;
      node.onended = () => { if (cue === c) { cue = null; detach(c); update(); } };
      node.start(); counts[preview ? kind === 'contact' ? 'previewContact' : 'previewEnd' : kind]++;
      record(preview ? 'preview-cue' : 'cue', { kind, sessionId: now.id }); update(); return true;
    } catch (e) { if (epoch === cueEpoch) { error = '提示音无法播放，请主动点击后重试。'; update(); } return false; }
  }
  function complete(s, reason) {
    if (!s?.id || expired.has(s.id)) return;
    stopPreview('timer-complete',false);
    expired.add(s.id); manual = false; stopBackground(true, reason); stopCue();
    if (expired.size > 200) expired.delete(expired.values().next().value);
    if (notified.size > 200) notified.delete(notified.values().next().value);
    const late = Date.now() - s.deadline;
    const eligible = !document.hidden && reason !== 'return' && late >= -50 && late < 1200 && s.kind !== 'sleep';
    if (!notified.has(s.id)) { notified.add(s.id); if (eligible && endEnabled) playCue('end'); }
    message = s.kind === 'sleep' ? '睡眠定时到期，网页保持安静，不响铃。' : '本轮到期，网页声音已停止。';
    record('deadline-stop', { sessionId: s.id, kind: s.kind, reason, lateMs: late, promptEligible: eligible }); update();
  }
  function sync(reason = 'sync') {
    if (disposed) return;
    const s = core(), prev = last;
    if(previewJob && previewRestore && !samePreviewContext(previewRestore,s)){
      const saved=previewRestore,pausedSame=s.id===saved.timer.id&&s.kind===saved.timer.kind&&s.status==='paused'&&saved.timer.status==='running';
      stopPreview('timer-or-mode-change',false);
      if(pausedSame&&saved.playing)armed=saved.armed;
    }
    if (prev?.id && s.id !== prev.id) {
      if (s.status === 'completed' && prev.deadline) complete(prev, reason);
      else { stopCue(); stopBackground(true, 'session-ended-or-switched'); manual = false; message = ''; }
    }
    if (prev && (s.kind !== prev.kind || (s.id && s.id !== prev.id))) {
      stopCue(); stopBackground(true, 'new-session'); manual = false; message = ''; error = '';
    }
    if(soundMode(s.kind)!==activeProfile)activateProfile(soundMode(s.kind));
    // 每个新会话采用本模式偏好；本轮手动停止仍保持停止，刷新本身也不出声。
    if(s.id&&s.id!==prev?.id)armed=selected!=='none'&&profiles[activeProfile].autoPlay;
    last = s;
    if (s.id && s.status === 'running' && s.deadline <= Date.now()) { complete(s, reason); return; }
    if (s.status === 'paused') { if (background || pendingKey || cue) { stopBackground(false, 'timer-paused'); stopCue(); } manual = false; message = ''; }
    if (canBackground(s)) startBackground(s);
    else if (background || pendingKey) stopBackground(false, 'not-running');
    update();
  }
  function choose(source) {
    if(!['none','pink','brown','local'].includes(source)&&!assetSources.has(source))return;
    stopPreview('source-change',false);
    previewError='';
    stopBackground(true, 'source-change'); stopCue(); selected = source; error = ''; message = ''; manual = false;
    releaseAsset();releaseFile();fileVersion++;filename='';
    armed = source !== 'none';
    if(assetSources.has(source))loadAsset(source);else if(source==='local')restoreFile();
    remember();sync('source-choice');
  }
  function activateProfile(id,explicit=false) {
    stopPreview('profile-change',false);
    previewError='';
    stopBackground(true,'mode-preference');stopCue();releaseAsset();releaseFile();fileVersion++;filename='';
    activeProfile=id;selected=profiles[id].source;volume=profiles[id].volume;error='';message='';fileSaveNote='保存在当前浏览器，不上传。';manual=false;armed=explicit?selected!=='none':false;
    if(ctx){master.gain.cancelScheduledValues(ctx.currentTime);master.gain.setValueAtTime(muted?0:volume,ctx.currentTime);}
    if(assetSources.has(selected))loadAsset(selected);else if(selected==='local')restoreFile();
    remember();update();
  }
  function setProfile(id,patch) {
    if(!Object.hasOwn(soundModes,id))return;
    if(previewJob)stopPreview('profile-edit',true);
    const next=normalizeProfile({...profiles[id],...patch});if(isAssetSource(next.source)&&!assetSources.has(next.source))return;
    profiles[id]=next;
    if(id===activeProfile){if(next.source!==selected){activateProfile(id,true);sync('profile-edit');}else{setVolume(next.volume);update();}}
    remember();update();
  }
  function setAutoPlay(on) {profiles[activeProfile].autoPlay=!!on;remember();update();}
  function applyRecommendations() {
    Object.assign(profiles,recommendedProfiles(catalog));activateProfile(activeProfile,true);sync('recommended');
  }
  async function restoreFile() {
    const id=activeProfile,version=++fileVersion;loading=true;update();
    try{
      const file=localFiles.get(id)||await library.load(id);
      if(disposed||version!==fileVersion||activeProfile!==id||selected!=='local')return;
      loading=false;
      if(file){localFiles.set(id,file);chooseFile(file,true);}else{message='本模式还没有本地音频，请选择一次。';update();}
    }catch{if(!disposed&&version===fileVersion){loading=false;fileSaveNote='浏览器无法读取已保存的文件，请重新选择；本次仍可播放。';update();}}
  }
  function validFile(file){return !!file?.size&&(file.type.startsWith('audio/')||/\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(file.name));}
  async function saveFile(id,file) {
    localFiles.set(id,file);
    try{await library.save(id,file);if(!disposed&&localFiles.get(id)===file){if(activeProfile===id){fileSaveNote='已记住这首音乐，刷新后也能找回。文件不上传。';update();}else $('pa-profile-feedback').textContent='已为'+soundModes[id]+'保存本地音乐，刷新后也能找回。';}}
    catch{if(!disposed&&localFiles.get(id)===file){if(activeProfile===id){fileSaveNote='浏览器未能保存文件，本次可以播放；刷新后需重新选择。';update();}else $('pa-profile-feedback').textContent=soundModes[id]+'的文件本次可用，但浏览器未能保存，刷新后需重新选择。';}}
  }
  function setProfileFile(id,file) {
    if(!Object.hasOwn(soundModes,id)||!validFile(file)){ $('pa-profile-feedback').textContent='请选择非空的普通音频文件。';return;}
    stopPreview('profile-file-change',true);
    if(id===activeProfile){chooseFile(file);return;}
    profiles[id]={...profiles[id],source:'local',localName:file.name};remember();update();
    saveFile(id,file);$('pa-profile-feedback').textContent='已为'+soundModes[id]+'记住这首音乐。';
  }
  function releaseAsset(){
    assetVersion++;clearTimeout(assetLoadTimer);assetLoadTimer=0;
    if(assetMedia){assetMedia.pause();assetMedia.removeAttribute('src');assetMedia.load();}
    try{assetNode?.disconnect();}catch(_){}
    assetMedia=null;assetNode=null;assetReady=false;loading=false;
  }
  function loadAsset(source){
    const item=assetSources.get(source);if(!item)return;
    const version=assetVersion,element=new Audio();assetMedia=element;assetReady=false;loading=true;element.preload='auto';element.loop=item.playback.loop;
    function fail(text){if(version!==assetVersion||disposed)return;clearTimeout(assetLoadTimer);assetLoadTimer=0;loading=false;assetReady=false;armed=false;stopBackground(true,'asset-error');error='音源无法读取：'+text;record('asset-error',{id:item.id});update();}
    assetLoadTimer=setTimeout(()=>fail('文件读取超时，请重新选择。'),10000);
    element.addEventListener('loadedmetadata',()=>{if(version!==assetVersion||disposed)return;clearTimeout(assetLoadTimer);assetLoadTimer=0;loading=false;assetReady=true;message='';record('asset-ready',{id:item.id,duration:element.duration});sync('asset-ready');},{once:true});
    element.addEventListener('error',()=>fail('文件缺失、损坏或格式不受支持。'));
    element.addEventListener('ended',()=>{if(version!==assetVersion||disposed||element.loop)return;stopBackground(false,'asset-ended');armed=false;manual=false;message='音源已播放结束，不自动循环。';update();});
    element.src=new URL(item.file,document.baseURI).href;element.load();
  }
  function releaseFile() {
    clearTimeout(fileLoadTimer);fileLoadTimer=0;
    if (media) { media.pause(); media.removeAttribute('src'); media.load(); }
    try { mediaNode?.disconnect(); } catch (_) {}
    if (mediaURL) { URL.revokeObjectURL(mediaURL); record('object-url-revoked'); }
    media = null; mediaNode = null; mediaURL = null; mediaReady = false;
  }
  function chooseFile(file,restoring=false) {
    if (!file) return;
    if(!validFile(file)){setMessage('请选择非空的普通音频文件，当前声音保留。');return;}
    stopPreview('file-change',false);
    previewError='';
    stopBackground(true, 'file-change'); stopCue(); releaseFile(); const version = ++fileVersion;
    releaseAsset();
    selected = 'local'; filename = file.name; armed = restoring?armed:true; manual = false; error = ''; message = ''; loading = false;
    profiles[activeProfile].localName=file.name;
    remember();
    if(!restoring)saveFile(activeProfile,file);
    media = new Audio(); media.preload = 'auto'; media.loop = false; const element = media;
    mediaURL = URL.createObjectURL(file); loading = true;
    const timeout = fileLoadTimer = setTimeout(() => failed('文件读取超时，请重新选择。'), 10000);
    function failed(text) {
      if (version !== fileVersion || disposed) return;
      clearTimeout(timeout); loading = false; mediaReady = false; armed = false;
      stopBackground(true, 'file-error'); error = '音频无法读取：' + text; record('file-error', { filename }); update();
    }
    element.addEventListener('loadedmetadata', () => { if (version !== fileVersion || disposed) return; clearTimeout(timeout); loading = false; mediaReady = true; message = ''; record('file-ready', { filename, duration: element.duration }); sync('file-ready'); }, { once: true });
    element.addEventListener('error', () => failed('文件损坏、格式不受支持或不是音频。'));
    element.addEventListener('ended', () => { if (version !== fileVersion || disposed) return; stopBackground(false, 'file-ended'); armed = false; manual = false; message = '歌曲已播放结束，不自动循环。'; update(); });
    element.src = mediaURL; element.load(); update();
  }
  async function play() {
    stopPreview('background-play',false);
    previewError='';
    error = ''; message = ''; const s = core();
    if (s.status === 'paused') { setMessage('计时已暂停，请先继续计时。'); return; }
    if (selected === 'none' || !playableMedia()) { setMessage('请先选择可播放的网页音源或本地文件。'); return; }
    armed = true; manual = !s.id;
    await startBackground(s); update();
  }
  function pause() { stopPreview('background-pause',false);armed = false; manual = false; stopBackground(false, 'user-pause'); stopCue(); setMessage('网页声音已暂停，计时继续。点击播放可恢复声音。'); }
  function stop() { stopPreview('background-stop',false);armed = false; manual = false; stopBackground(true, 'user-stop'); stopCue(); setMessage('网页声音已停止，计时继续。'); }
  function samePreviewContext(saved,s=core()) {
    return !disposed && saved.profile===activeProfile && saved.source===selected && saved.fileVersion===fileVersion &&
      saved.timer.id===s.id && saved.timer.kind===s.kind && saved.timer.status===s.status && saved.timer.deadline===s.deadline &&
      (!s.id || s.status!=='running' || s.deadline>Date.now()&&!expired.has(s.id));
  }
  function releasePreview(job) {
    clearTimeout(job.timer);clearTimeout(job.loadTimer);clearTimeout(job.prepareTimer);
    job.cancelLoad?.();job.cancelLoad=null;
    if(job.element){job.element.onended=null;job.element.onerror=null;job.element.pause();job.element.removeAttribute('src');job.element.load();}
    if(job.node)job.node.onended=null;
    detach(job);
    try{job.mediaNode?.disconnect();}catch(_){}
    if(job.url)URL.revokeObjectURL(job.url);
  }
  function stopPreview(reason='user-stop',restore=true) {
    const job=previewJob,saved=previewRestore;
    previewJob=null;previewRestore=null;
    if(job){releasePreview(job);record('preview-stop',{reason,source:job.source,profile:job.profile});}
    if(!job)return Promise.resolve(false);
    const valid=restore&&saved?.playing&&samePreviewContext(saved);
    if(valid){armed=saved.armed;manual=saved.manual;const pending=startBackground(core());update();return pending.then(()=>true);}
    // 暂停中可以主动试听；结束仍安静，但之后用户继续计时应接续原播放意图。
    if(restore&&saved&&saved.timer.status==='paused'&&samePreviewContext(saved)){armed=saved.armed;manual=false;}
    update();return Promise.resolve(false);
  }
  async function previewSource(source,profileId=activeProfile) {
    if(disposed||document.hidden)return false;
    if(previewJob?.source===source&&previewJob.profile===profileId){await stopPreview('toggle',true);return false;}
    if(!Object.hasOwn(soundModes,profileId)||!['pink','brown','local'].includes(source)&&!assetSources.has(source)){
      previewError='这个声音暂时无法试听。';await stopPreview('invalid-source',true);update();return false;
    }
    if(!previewRestore)previewRestore={playing:!!background&&!pendingKey,armed,manual,source:selected,profile:activeProfile,fileVersion,timer:core()};
    if(previewJob){const old=previewJob;previewJob=null;releasePreview(old);record('preview-stop',{reason:'switch-preview',source:old.source});}
    stopBackground(false,'preview-start');stopCue();armed=false;manual=false;previewError='';
    const job={source,profile:profileId,loading:true,endsAt:0,node:null,gain:null,element:null,mediaNode:null,url:null};
    previewJob=job;record('preview-request',{source,profile:profileId});update();
    const current=()=>previewJob===job&&!disposed;
    job.prepareTimer=setTimeout(()=>{if(current()){previewError='试听加载超时，请稍后重试。';stopPreview('prepare-timeout',true);}},10000);
    try{
      await unlock();if(!current())return false;
      if(!samePreviewContext(previewRestore)){await stopPreview('context-changed',false);return false;}
      const item=assetSources.get(source);
      if(source==='local'||item){
        let url;
        if(source==='local'){
          const file=localFiles.get(profileId)||await library.load(profileId);if(!current())return false;
          if(!file)throw Error('本模式还没有保存本地音乐，请先选择文件。');
          job.url=URL.createObjectURL(file);url=job.url;
        }else url=new URL(item.file,document.baseURI).href;
        const element=job.element=new Audio();element.preload='auto';element.loop=false;
        await new Promise((resolve,reject)=>{
          const cleanup=()=>{clearTimeout(job.loadTimer);element.removeEventListener('canplay',ready);element.removeEventListener('error',failed);job.cancelLoad=null;};
          const ready=()=>{cleanup();resolve();},failed=()=>{cleanup();reject(Error('音频缺失、损坏或格式不受支持，请换一个声音。'));};
          job.cancelLoad=()=>{cleanup();reject(Error('试听已取消'));};
          job.loadTimer=setTimeout(()=>{cleanup();reject(Error('试听加载超时，请稍后重试。'));},10000);
          element.addEventListener('canplay',ready,{once:true});element.addEventListener('error',failed,{once:true});element.src=url;element.load();
        });
        if(!current())return false;
        if(!samePreviewContext(previewRestore)){await stopPreview('context-changed',false);return false;}
        job.gain=ctx.createGain();job.gain.gain.value=item?.playback.gain||1;job.gain.connect(master);
        job.mediaNode=ctx.createMediaElementSource(element);job.mediaNode.connect(job.gain);
        element.onended=()=>{if(current())stopPreview('natural-end',true);};
        element.onerror=()=>{if(current()){previewError='试听中断，已结束试听。';stopPreview('media-error',true);}};
        await element.play();if(!current())return false;
      }else{
        job.gain=ctx.createGain();job.gain.gain.value=1;job.gain.connect(master);
        job.node=ctx.createBufferSource();job.node.buffer=buffer(source);job.node.loop=true;job.node.connect(job.gain);job.node.start();
      }
      clearTimeout(job.prepareTimer);job.loading=false;
      const timerState=core(),limitMs=timerState.status==='running'&&timerState.deadline?Math.min(10000,Math.max(0,timerState.deadline-Date.now())):10000;
      job.endsAt=Date.now()+limitMs;
      // 音频时钟也封顶十秒，后台标签页计时器延迟不会让试听持续漏声。
      job.gain.gain.setValueAtTime(job.gain.gain.value,ctx.currentTime);
      job.gain.gain.setValueAtTime(0,ctx.currentTime+limitMs/1000);
      if(job.node)job.node.stop(ctx.currentTime+limitMs/1000);
      job.timer=setTimeout(()=>{if(current())stopPreview(limitMs<10000?'timer-deadline':'timeout',true);},limitMs);
      record('preview-start',{source,profile:profileId});update();return true;
    }catch(e){
      if(current()){previewError=e.name==='NotAllowedError'?'浏览器未允许试听，请再点击一次。':e.message||'这个声音暂时无法试听。';record('preview-error',{source,detail:previewError});await stopPreview('error',true);update();}
      return false;
    }
  }
  function previewEnvironment(){return previewSource(selected);}
  function setMuted(value) {
    muted = !!value; message = ''; stopCue();
    if (ctx) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(muted ? 0 : volume, ctx.currentTime); }
    record('mute', { muted }); update();
    remember();
  }
  function setVolume(value) {
    volume = Math.max(0, Math.min(1, Number(value) || 0)); message = '';
    if (ctx) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(muted ? 0 : volume, ctx.currentTime); }
    update();
    remember();
  }
  function recordState() {
    const s=inspect();
    return {capturedAt:Date.now(),source:s.selected,sourceKind:assetSources.get(s.selected)?.kind||(['pink','brown'].includes(s.selected)?'synthesized':s.selected==='local'?'user-local':'none'),muted:s.muted,volume:s.volume,contextState:s.audioContextState,backgroundActive:s.backgroundVoices===1,cueActive:s.cueVoices===1,pcmRms:s.output.rms,measurement:'网页主增益之后的实际PCM，不代表扬声器听感'};
  }
  function inspect() {
    let rms = 0, peak = 0;
    if (analyser) { const data = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(data); for (const x of data) { rms += x * x; peak = Math.max(peak, Math.abs(x)); } rms = Math.sqrt(rms / data.length); }
    return { version: 2, selected, volume, muted, contactEnabled, endEnabled, armed, manual, loading, error,activeProfile,profiles:Object.fromEntries(Object.entries(profiles).map(([id,p])=>[id,{...p}])),
      preview:{active:!!previewJob,source:previewJob?.source||null,profile:previewJob?.profile||null,loading:!!previewJob?.loading,error:previewError,remainingMs:previewJob&&!previewJob.loading?Math.max(0,previewJob.endsAt-Date.now()):0},
      audioContextState: ctx?.state || 'uncreated', currentAudioTime: ctx?.currentTime || 0,
      output: { rms, peak, measuredAt: Date.now(), position: 'master增益之后、destination之前的实际PCM采样；不证明扬声器听感' },
      backgroundVoices: background ? 1 : 0, cueVoices: cue ? 1 : 0, pending: !!pendingKey,
      background: background ? { source: background.source, sessionId: background.sessionId, deadline: background.deadline, stopAtAudioTime: background.stopAtAudioTime || null, fadeSeconds: background.fadeSeconds || 0 } : null,
      local: { filename, ready: mediaReady, paused: media?.paused ?? true, currentTime: media?.currentTime || 0, duration: Number.isFinite(media?.duration) ? media.duration : null, loop: media?.loop || false, objectURLActive: !!mediaURL },
      catalog: {audioIds:[...assetSources.keys()],links:catalog.links.length},
      asset: {id:assetSources.get(selected)?.id||null,kind:assetSources.get(selected)?.kind||null,ready:assetReady,paused:assetMedia?.paused??true,currentTime:assetMedia?.currentTime||0,duration:Number.isFinite(assetMedia?.duration)?assetMedia.duration:null,loop:assetMedia?.loop||false},
      timer: core(), counts: { ...counts }, expiredSessionIds: [...expired], events: log.map(e => ({ ...e })), disposed };
  }
  $('pa-source').addEventListener('change', e => choose(e.target.value));
  $('pa-file').addEventListener('change', e => { chooseFile(e.target.files[0]); e.target.value = ''; });
  $('pa-play').addEventListener('click', play); $('pa-pause').addEventListener('click', pause); $('pa-stop').addEventListener('click', stop);
  $('pa-mute').addEventListener('change', e => setMuted(e.target.checked)); $('pa-volume').addEventListener('input', e => setVolume(Number(e.target.value) / 100));
  $('pa-contact-enabled').addEventListener('change', e => { contactEnabled = e.target.checked; if (!contactEnabled) stopCue(); update(); remember(); });
  $('pa-end-enabled').addEventListener('change', e => { endEnabled = e.target.checked; if (!endEnabled) stopCue(); update(); remember(); });
  $('pa-preview-contact').addEventListener('click', () => playCue('contact', true)); $('pa-preview-end').addEventListener('click', () => playCue('end', true));
  $('pa-preview-environment').addEventListener('click', previewEnvironment);
  window.addEventListener('pomodoro-ball-contact', e => {
    if (!['start', 'manual'].includes(e.detail?.reason) || document.hidden || ['sleep','meditate'].includes(core().kind) || !contactEnabled || muted || Date.now() - lastContact < 250) return;
    lastContact = Date.now(); playCue('contact');
  });
  const observer = new MutationObserver(() => sync());
  observer.observe($('preview-board'), { attributes: true, attributeFilter: ['data-status', 'data-kind'] });
  document.addEventListener('click', e => {
    if (e.target.closest('#primary-action') && (selected !== 'none' || endEnabled || contactEnabled)) {
      // 实际用户开始一轮时允许已选音源；刷新本身不发声。
      if (!core().id && core().status === 'ready') armed = selected !== 'none'&&profiles[activeProfile].autoPlay;
      unlock().catch(() => {});
    }
    if (e.target.closest('#primary-action,#secondary-action,#confirm-accept,[data-mode],[data-kind]')) queueMicrotask(() => sync());
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopPreview('page-hidden',true);stopCue(); record('hidden'); }
    else {
      // 捕获阶段先于核心回切处理，先关过期声音；恢复不补播旧提示。
      const s = core(); if (s.id && s.status === 'running' && s.deadline <= Date.now()) complete(s, 'return');
      if (last?.id && last.deadline <= Date.now() && s.status === 'completed') complete(last, 'return');
      sync('return'); record('visible');
    }
  }, true);
  window.addEventListener('pagehide', e => { stopPreview('pagehide',false);manual = false; stopBackground(false, 'pagehide'); stopCue(); record('pagehide'); if (!e.persisted) dispose(); });
  window.addEventListener('pageshow', e => { if (e.persisted) { armed = false; manual = false; stopBackground(false, 'bfcache'); stopCue(); sync('return'); } });
  function dispose() { if (disposed) return; stopPreview('dispose',false);stopBackground(true, 'dispose'); stopCue(); releaseFile(); releaseAsset(); observer.disconnect(); clearInterval(poll); disposed = true; if (ctx) ctx.close().catch(() => {}); }
  const poll = setInterval(sync, 250);
  const api = Object.freeze({ inspect, recordState, sync, play, pause, stop, choose, previewSource, stopPreview, setMuted, setVolume, setAutoPlay,setProfile,setProfileFile,applyRecommendations,dispose });
  last = core();soundPanel=createSoundPanel(api,catalog);if(assetSources.has(selected))loadAsset(selected);else if(selected==='local')restoreFile();update(); record('ready'); return api;
}
