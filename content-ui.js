/* One source of content for category navigation, stars and reading panels. */
(()=>{
 const data=window.PORTFOLIO_DATA,$=s=>document.querySelector(s);
 const regions=[
  {name:'产品 / 工具设计',slug:'products',eyebrow:'PRODUCTS & TOOLS',copy:'把想法，做成日常。',position:[-6.2,.2,2.8],radius:4.8,flatten:.85,angle:-.2,temperature:0},
  {name:'影像 / 叙事',slug:'stories',eyebrow:'IMAGES & STORIES',copy:'让片刻，留下一点回声。',position:[5.8,.2,-4.2],radius:4.1,flatten:.65,angle:-.65,temperature:.12},
  {name:'研究 / 实验',slug:'experiments',eyebrow:'RESEARCH & EXPERIMENTS',copy:'让好奇，走得更远一点。',position:[5.2,.2,5.2],radius:3.7,flatten:.9,angle:.6,temperature:.32}
 ];
 // Keep content anchors inside the portrait viewport, with space around the heart.
 if(innerWidth<650){regions.forEach(r=>r.position[0]*=.55);regions[0].position[2]-=4.3;regions[2].position[2]+=1.8;}
 const visible=data.projects.filter(p=>p.visible),counts=[0,0,0],originalOrigins=[[-4.5,.2,4.6],[6,.2,-5],[7,.2,5]];
 const stars=visible.map(p=>{const region=regions.findIndex(r=>r.slug===p.category),r=regions[region],index=counts[region]++;
  const angle=index*2.39996-.7,rad=Math.min(r.radius*.58,1.6+Math.sqrt(index)*.68);
  // Translate authored offsets with the category; the saved content remains unchanged.
  const position=p.position?p.position.map((v,j)=>v-originalOrigins[region][j]+r.position[j]):[r.position[0]+Math.cos(angle)*rad,r.position[1]+Math.sin(index*1.7)*.75,r.position[2]+Math.sin(angle)*rad*.65];
  const color=[1,3,5].map(start=>parseInt(p.color.slice(start,start+2),16)/255);
  return {...p,position,color,region};
 });
 window.GALAXY_CONTENT={stars,regions};
 document.title=data.site.title+' · 在星河里慢慢探索';$('.wordmark').lastChild.textContent=' '+data.site.title;
 $('.overview-intro h1').textContent=data.site.tagline;$('.overview-intro p').textContent=data.site.subtitle;
 $('#universe-heart strong').textContent=data.site.title;$('#universe-heart').setAttribute('aria-label',data.site.title+'，关于我');
 $('#about-title').textContent=data.site.title;$('.about-lead').textContent=data.site.intro;$('#about-copy').replaceChildren(...data.site.description.split(/\n\s*\n/).filter(Boolean).map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
 $('.about-note').hidden=true;$('.example-note').textContent=visible.some(p=>p.demo)?'含示例内容 · 探索原型':'LeoLei · 作品与日常';
 let current=-1,syncing=false;
 const emit=(type,detail)=>window.dispatchEvent(new CustomEvent(type,{detail}));
 $('#nav-about').onclick=()=>emit('universe:heart');$('#nav-work').onclick=()=>emit('universe:enter',{index:0});
 const members=()=>stars.map((s,i)=>s.region===current?i:-1).filter(i=>i>=0);
 function save(project=-1){if(syncing)return;const hash=current<0?'':regions[current].slug+(project>=0?'/'+stars[project].id:'');if(location.hash.slice(1)!==hash)history.pushState(null,'',location.pathname+location.search+(hash?'#'+hash:''));}
 function closeDirectory(){$('#project-directory').hidden=true;$('#project-list-toggle').setAttribute('aria-expanded','false');}
 function directory(){const list=members(),host=$('#project-directory');host.replaceChildren();const heading=document.createElement('div');heading.className='index-heading';heading.textContent='项目星光　'+String(list.length).padStart(2,'0');host.append(heading);
  list.forEach((index,j)=>{const p=stars[index],b=document.createElement('button');b.dataset.project=index;const number=document.createElement('span'),text=document.createElement('span'),name=document.createElement('strong'),kind=document.createElement('small'),arrow=document.createElement('span');number.className='project-number';number.textContent=String(j+1).padStart(2,'0');name.textContent=p.name;kind.textContent=p.kind;arrow.textContent='↗';arrow.className='arrow';text.append(name,kind);b.append(number,text,arrow);b.onclick=()=>emit('galaxy:select',{index});host.append(b);});
 }
 window.addEventListener('universe:region',e=>{current=e.detail.index;const inside=current>=0,r=regions[current],list=members(),has=list.length>0;document.body.dataset.level=inside?'region':'universe';
  $('.overview-intro').hidden=inside;$('.region-intro').hidden=!inside;$('#crumb-region').hidden=!inside;
  $('#project-list-toggle').hidden=!inside||!has;$('#empty-region').hidden=!inside||has;closeDirectory();directory();
  if(inside){$('#region-title').textContent=r.name;$('#region-eyebrow').textContent=r.eyebrow;$('#region-copy').textContent=r.copy;$('#region-count').textContent=has?String(list.length).padStart(2,'0')+' 个项目'+(list.some(i=>stars[i].demo)?' · 含示例内容':''):'待放入作品';$('#crumb-region').textContent='/　'+r.name;$('#start-explore').hidden=!has;$('#restore-region').hidden=!has;}
  $('.hint').textContent=inside?'对准星光滚动靠近 · 点击阅读 · 缩小返回全景':'对准一片星光滚动靠近 · 也可点击类别';
  document.querySelectorAll('[data-region]').forEach(b=>b.setAttribute('aria-current',String(Number(b.dataset.region)===current)));
  $('#navigation-status').textContent=inside?'已进入'+r.name+'星系':'已返回宇宙全景';save();
  if(inside&&!e.detail.passive)$('#back-universe').focus({preventScroll:true});
 });
 document.querySelectorAll('[data-region]').forEach(b=>b.onclick=()=>emit('universe:enter',{index:Number(b.dataset.region)}));
 $('#back-universe').onclick=()=>emit('universe:exit');$('#restore-region').onclick=()=>emit('universe:recenter');
 $('#start-explore').onclick=()=>{const index=members()[0];if(index!==undefined)emit('galaxy:select',{index});};
 document.querySelectorAll('a[href="#"]').forEach(a=>{if(a.id!=='project-link')a.onclick=e=>{e.preventDefault();emit('universe:exit');};});
 $('#project-list-toggle').onclick=()=>{const open=$('#project-directory').hidden;$('#project-directory').hidden=!open;$('#project-list-toggle').setAttribute('aria-expanded',String(open));};
 window.addEventListener('galaxy:focus',e=>{closeDirectory();save(e.detail.index);$('#navigation-status').textContent='正在阅读'+stars[e.detail.index].name;});
 window.addEventListener('galaxy:leave',e=>{if(e.detail?.restoring!==false)save();$('#navigation-status').textContent='已返回星系';});
 window.addEventListener('universe:heart-open',()=>{if(!syncing&&location.hash!=='#about')history.pushState(null,'',location.pathname+location.search+'#about');$('#navigation-status').textContent='关于'+data.site.title;});
 window.addEventListener('universe:heart-close',e=>{if(e.detail.restore)save();});
 function restore(){syncing=true;try{const [slug,id]=decodeURIComponent(location.hash.slice(1)).split('/'),i=regions.findIndex(r=>r.slug===slug);if(slug==='about')emit('universe:heart');else if(i<0)emit('universe:exit');else{emit('universe:enter',{index:i});let index=stars.findIndex(s=>s.id===id&&s.region===i);if(index<0&&/^\d+$/.test(id||''))index=stars.map((s,j)=>s.region===i?j:-1).filter(j=>j>=0)[Number(id)-1]??-1;if(index>=0)emit('galaxy:select',{index});}}finally{syncing=false;}}
 window.addEventListener('popstate',restore);window.addEventListener('universe:ready',restore);
})();

