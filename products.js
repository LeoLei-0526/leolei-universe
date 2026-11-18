/* Portfolio reading panel. Data comes from the management page. */
(()=>{
 const $=s=>document.querySelector(s);
 const projects=window.PORTFOLIO_DATA.projects.filter(p=>p.visible);
 const actions=document.createElement('div'),secondary=document.createElement('a');actions.className='project-actions';secondary.id='project-secondary-link';secondary.className='project-link';secondary.target='_blank';secondary.rel='noopener noreferrer';secondary.hidden=true;$('#project-link').before(actions);actions.append($('#project-link'),secondary);
 let current=0;
 const covers={
  focus:'<div class="mock-window"><div class="mock-bar"><span>专注时光</span><span>专注 · 休息</span></div><div class="timer-ring"><div><small>留给眼前这一件事</small><strong>25:00</strong><span>FOCUS ON THE MOMENT</span></div></div><div class="mock-pill">开始专注</div></div>',
  collect:'<div class="mock-window"><div class="mock-bar"><span>拾光盒子</span><span>我的灵感 / 12</span></div><div class="mock-input">＋ 收下一点新灵感</div><div class="note-grid"><div><small>一句话</small><b>让日常<br>多一点留白。</b><span>文字 / 随想</span></div><div><small>视觉线索</small><div class="abstract-art"></div><span>色彩 / 观察</span></div><div><small>一个念头</small><b>把复杂的事<br>做得简单一点。</b><span>产品 / 想法</span></div></div></div>',
  tasks:'<div class="mock-window"><div class="mock-bar"><span>轻舟</span><span>TODAY</span></div><h4>今天，慢慢来。</h4><p class="mock-sub">把重要的事，放在眼前。</p><div class="mock-task done"><i>✓</i><span>整理这周的灵感</span><small>已完成</small></div><div class="mock-task"><i></i><span>画出首页的第一张草图</span><small>进行中</small></div><div class="mock-task"><i></i><span>留十分钟回顾今天</span><small>稍后</small></div></div>'
 };
 function select(index){window.dispatchEvent(new CustomEvent('galaxy:select',{detail:{index}}));}
 document.querySelectorAll('[data-project]').forEach(b=>b.onclick=()=>select(Number(b.dataset.project)));

 function tab(which){for(const name of ['overview','process']){const on=name===which;$('#tab-'+name).setAttribute('aria-selected',String(on));$('#tab-'+name).tabIndex=on?0:-1;$('#'+name+'-panel').hidden=!on;}}
 for(const name of ['overview','process']){
  $('#tab-'+name).onclick=()=>tab(name);
  $('#tab-'+name).onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const other=e.key==='Home'?'overview':e.key==='End'?'process':name==='overview'?'process':'overview';tab(other);$('#tab-'+other).focus();}};
 }
 window.addEventListener('galaxy:focus',e=>{
  current=e.detail.index;const p=projects[current];if(!p)return;
  const story=!p.demo&&p.steps.length===0;$('#star-card').classList.toggle('personal-story',story);$('.project-footer').hidden=projects.filter(x=>x.category===p.category).length<2;
  for(const [id,value]of Object.entries({'project-kind':p.kind,'project-summary':p.summary,'fact-direction':p.direction,'fact-focus':p.focus,'project-problem':p.problem,'project-experience':p.experience,'project-principle':p.principle}))$('#'+id).textContent=value;
  const siblings=projects.filter(x=>x.category===p.category);$('#project-counter').textContent=`PROJECT ${String(siblings.indexOf(p)+1).padStart(2,'0')} / ${String(siblings.length).padStart(2,'0')}`;
  const cover=$('#project-cover');cover.className='cover '+p.theme;cover.style.aspectRatio=p.category==='stories'?'16 / 9':'';cover.replaceChildren();
  if(p.cover){const img=document.createElement('img');img.src=p.cover;img.alt=p.name+'项目封面';cover.append(img);}else if(p.demo&&covers[p.theme]){cover.innerHTML=covers[p.theme];}else{const name=document.createElement('h3');name.textContent=p.name;cover.append(name);}
  cover.setAttribute('aria-label',p.name+'项目封面');$('.cover-caption').textContent=p.cover?(p.id==='kitten-pomodoro'?'实际使用界面 · 小猫番茄钟':'作品画面'):p.demo?'界面草图 · 用于展示内容结构':'作品展示';
  $('.project-tag span:last-child').textContent=p.demo?'示例内容':'作品';$('.content-note').hidden=!p.demo;
  $('#project-link').hidden=!p.link;$('#project-link').href=p.link||'#';$('#project-link').textContent=(p.linkLabel||(p.id==='kitten-pomodoro'?'打开小猫番茄钟':'打开作品'))+' ↗';
  secondary.hidden=!p.secondaryLink;secondary.href=p.secondaryLink||'#';secondary.textContent=(p.secondaryLinkLabel||'查看资料')+' ↗';
  $('.takeaway').hidden=!p.principle;
  $('#next-project').disabled=$('#previous-project').disabled=siblings.length<2;
  $('#process-panel h3').textContent=p.steps.length?'设计思路':'这部分内容正在整理。';
  $('#project-process').replaceChildren(...p.steps.map(([title,body])=>{const li=document.createElement('li'),h=document.createElement('h4'),para=document.createElement('p');h.textContent=title;para.textContent=body;li.append(h,para);return li;}));
  $('.card-scroll').scrollTop=0;tab('overview');
  document.querySelectorAll('[data-project]').forEach(b=>b.setAttribute('aria-current',String(Number(b.dataset.project)===current)));
 });
 window.addEventListener('galaxy:leave',()=>document.querySelectorAll('[data-project]').forEach(b=>b.removeAttribute('aria-current')));
 function cycle(step){const list=projects.map((p,i)=>p.category===projects[current]?.category?i:-1).filter(i=>i>=0);if(list.length)select(list[(list.indexOf(current)+step+list.length)%list.length]);}
 $('#next-project').onclick=()=>cycle(1);
 $('#previous-project').onclick=()=>cycle(-1);
})();
