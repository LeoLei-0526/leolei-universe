import {meta,modeNames,clock,span} from '../core/config.js';
export function createView(timer,cat,storage,renderRecords) {
  const $=id=>document.getElementById(id),board=$('preview-board'),trial=0;
  const effective=()=>timer.effective(),duration=()=>timer.settings.durations[timer.kind]*1000;
  function renderTimer() {
    const {kind,status,session,summary,settings}=timer.inspect();const storageOK=storage.inspect().available;
    const ms=session ? session.durationMs-effective() : status==='completed' ? 0 : summary ? summary.remainingMs : duration();
    $('timer').textContent=clock(ms); $('timer').classList.toggle('is-long',ms>=6000000);
    if (session) {
      const done=effective(); $('progress-fill').style.width=done/session.durationMs*100+'%';
      $('progress-label').textContent=(session.trial ? '试跑 · ' : '')+'有效进行 '+span(done)+(status==='paused' ? ' · 暂停时间不计入' : ' · 这一轮，慢慢来。');
    } else if (summary) {
      $('progress-fill').style.width=summary.effectiveMs/summary.durationMs*100+'%';
      $('progress-label').textContent=(summary.trial ? '试跑 · ' : '')+'有效进行 '+span(summary.effectiveMs)+' · '+(storageOK ? '已保存到本机记录' : '仅在本页暂存');
    }
    if (!$('active-session').hidden && session) $('active-session').textContent='当前'+meta[kind].name+(status==='paused' ? '已暂停' : '仍在计时')+' · '+session.activity+' · 有效进行 '+span(effective())+'。返回计时可继续操作。';
  }
  function render() {
    const {kind,status,session,summary,settings}=timer.inspect();const storageOK=storage.inspect().available;
    const m=meta[kind], active=!!session, ended=['completed','ended'].includes(status), mode=m.mode;
    board.className='board'+(mode==='sleep' ? ' night' : mode==='meditate' ? ' meditation' : ['short','long'].includes(kind) ? ' break-mode' : status==='paused' ? ' paused' : '');
    board.classList.toggle('is-running',status==='running'); board.classList.toggle('is-page-hidden',document.hidden);
    board.dataset.mode=mode; board.dataset.state=status==='running' ? (kind==='focus' ? 'focus' : kind) : status;
    board.dataset.status=status; board.dataset.kind=kind;
    $('mode-name').textContent=modeNames[mode];
    $('state-name').textContent=ended ? (status==='completed' ? '到时完成' : '提前结束') : status==='paused' ? m.name+' · 已暂停' : status==='running' ? (kind==='sleep' ? '定时中' : m.name+'中') : ['short','long'].includes(kind) ? m.name+' · 准备开始' : '准备开始';
    $('page-title').textContent=ended ? (status==='completed' ? kind==='sleep' ? '今天到这里，好好休息。' : ['short','long'].includes(kind) ? '休息好了，再慢慢开始。' : kind==='meditate' ? '带着这份安静，慢慢继续。' : '这一件，先到这里。' : '今天这一段，也有意义。') : status==='paused' ? (kind==='sleep' ? '安静的时间，先停一下。' : '停一下，也没关系。') : m.title;
    $('timer-caption').textContent=ended ? (status==='completed' ? m.name+'已完成' : m.name+'提前结束 · 剩余时间') : active ? '剩余'+(kind==='sleep' ? '定时' : m.name)+'时间'+(status==='paused' ? ' · 已暂停' : '') : (trial ? trial+'秒试跑 · '+m.name : m.name+'时长');
    $('activity-input').value=active ? session.activity : settings.tasks[kind]; $('activity-input').readOnly=active || ended;
    $('activity-input').setAttribute('aria-label',active || ended ? '当前活动，本轮开始后固定' : '当前活动，可编辑');
    $('duration-row').hidden=active || ended; 
    $('progress').hidden=!active && !ended; $('progress-label').hidden=!active && !ended;
    $('presets').innerHTML=m.presets.map(n => '<button data-minutes="'+n+'" class="'+(!trial && settings.durations[kind]===n*60 ? 'selected' : '')+'" aria-pressed="'+(!trial && settings.durations[kind]===n*60)+'">'+n+' 分钟</button>').join('');
    const custom=!trial && !m.presets.includes(settings.durations[kind]/60);
    $('custom-duration').textContent=custom ? settings.durations[kind]/60+'分钟 · 修改' : '自定义'; $('custom-duration').classList.toggle('selected',custom);
    document.querySelectorAll('[data-trial]').forEach(b => { b.classList.toggle('selected',Number(b.dataset.trial)===trial); b.setAttribute('aria-pressed',String(Number(b.dataset.trial)===trial)); });
    $('primary-label').textContent=ended ? (kind==='sleep' ? '再设一个定时' : '再开始一轮') : status==='running' ? m.pause : status==='paused' ? m.resume : m.start;
    $('primary-icon').innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="'+(status==='running' ? 'M8 5v14M16 5v14' : 'm8 5 11 7-11 7V5Z')+'"/></svg>';
    $('secondary-action').hidden=!active; $('secondary-action').textContent=kind==='sleep' ? '结束定时' : ['short','long'].includes(kind) ? '结束休息' : '提前结束';
    $('quiet-note').textContent=kind==='sleep' ? '网页声音可选'+(ended ? '；本页定时已结束。' : '；到时仅结束本页定时。') : status==='paused' ? '时间停在这里，准备好就继续。' : ended ? '回看记录，或给自己一段休息。' : ['short','long'].includes(kind) ? '喝口水，或看看窗外。' : '声音可选，安静也很好。';
    $('breath').hidden=kind!=='meditate'; $('breath-text').textContent=status==='paused' ? '提示已暂停 · 自然呼吸，慢慢来。' : ended ? '这段冥想已结束 · 自然呼吸。' : '自然呼吸，慢慢来。';
    document.querySelectorAll('.modes [data-mode]').forEach(b => { const on=b.dataset.mode===mode; b.classList.toggle('active',on); b.setAttribute('aria-pressed',String(on)); });
    document.querySelectorAll('.rhythm [data-kind]').forEach(b => { const on=b.dataset.kind===kind; b.classList.toggle('active',on); b.setAttribute('aria-pressed',String(on)); });
    for (const k of ['focus','short','long']) $('rhythm-'+k).textContent=settings.durations[k]/60;
    $('rhythm-mode').textContent=kind==='sleep' ? '睡眠定时 · 音乐可选' : '本次冥想 · 给自己一段安静';
    $('rhythm-foot').textContent=kind==='sleep' ? '网页声音可选；外部音乐由外部播放器控制。' : kind==='meditate' ? '无声也可以，自然呼吸。' : ['short','long'].includes(kind) ? '休息结束后，手动开始下一轮专注。' : '结束后，手动选择一段休息。';
    cat.setState({mode,kind,status}); renderTimer(); if (!$('record-view').hidden) renderRecords();
  }

return {render,renderTimer};
}
