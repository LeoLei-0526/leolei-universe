// 外观是独立偏好，不写入计时、记录、声音或IndexedDB数据。
const $=id=>document.getElementById(id),board=$('preview-board'),key='kitten-pomodoro:appearance:v1';
const palettes={
 warm:['#faf8f3','#fffdf9','#383b35','#62655c','#80513e','#deded4','#eeece4','#f1e9dc','#e6d9c4','#c8b397'],
 sage:['#edf1e9','#f8faf4','#2f4438','#5a6c5e','#46684e','#ced9cd','#e1e8dc','#edf0df','#dce2ce','#bbc7b1'],
 blue:['#edf2f4','#f8fbfc','#30434d','#5d6e77','#42677b','#cedbe0','#dfe9ec','#eef0e5','#dce4df','#b7cac5'],
 rose:['#f5eeea','#fdf8f5','#4b3b3c','#796366','#8b5558','#e1d4d0','#eee1db','#f3e9df','#e8d7ca','#cbb2a6'],
 lavender:['#f0eef5','#faf8fd','#423e53','#6d657d','#6e5b87','#d9d3e3','#e6e1ee','#efe9f2','#e0d5e5','#bfb0cc']
};
const scenes=[{id:'sea',name:'海边',note:'潮水很远，留一片柔软沙地',color:'blue'},{id:'meadow',name:'草原',note:'在草甸边，找一块平整石台',color:'sage'},{id:'window',name:'书桌窗前',note:'暖木桌面，窗外是静静的绿',color:'warm'},{id:'forest',name:'森林',note:'薄雾与树影，林间石台上',color:'sage'}];
const colors=[['warm','暖白','默认'],['sage','鼠尾草',''],['blue','雾蓝',''],['rose','陶粉',''],['lavender','浅紫','']];
let selected={type:'color',id:'warm'},storageOK=true;
let raw=null;try{raw=localStorage.getItem(key);}catch{storageOK=false;}
try{const saved=JSON.parse(raw||'null');if(saved?.version===1&&((saved.type==='color'&&colors.some(([id])=>id===saved.id))||(saved.type==='scene'&&scenes.some(s=>s.id===saved.id))))selected={type:saved.type,id:saved.id};}catch{/* 损坏/未知偏好保留原值，画面回到默认；不误报浏览器禁止保存。 */}
const world=document.createElement('div');world.className='world-environment';world.setAttribute('aria-hidden','true');document.body.prepend(world);
const open=document.createElement('button');open.id='open-appearance';open.type='button';open.setAttribute('aria-haspopup','dialog');open.setAttribute('aria-expanded','false');open.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="16" cy="9" r="2"/><path d="m3 16 5-5 6 7m-2-2 3-3 6 6"/></svg><span>外观</span>';$('open-sound').after(open);
const dialog=document.createElement('dialog');dialog.id='appearance-dialog';dialog.className='appearance-dialog';dialog.setAttribute('aria-labelledby','appearance-title');
dialog.innerHTML='<div class="appearance-heading"><div><h2 id="appearance-title">换个地方，继续眼前的事</h2><p>场景与声音分别记住，随时可以换。</p></div><button class="panel-close" id="appearance-close" aria-label="关闭外观设置">×</button></div><div class="appearance-tabs" role="tablist" aria-label="外观类别"><button role="tab" id="appearance-scene-tab" aria-controls="appearance-scenes" aria-selected="true" data-appearance-tab="scene">场景</button><button role="tab" id="appearance-color-tab" aria-controls="appearance-colors" aria-selected="false" tabindex="-1" data-appearance-tab="color">纯色配色</button></div><div class="appearance-body"><section id="appearance-scenes" role="tabpanel" aria-labelledby="appearance-scene-tab"><div class="appearance-scene-grid"></div></section><section id="appearance-colors" role="tabpanel" aria-labelledby="appearance-color-tab" hidden><p class="appearance-intro">少一点景物，留一点喜欢的颜色。</p><div class="appearance-color-grid"></div></section></div><div class="appearance-footer"><div><span>当前外观</span><strong id="appearance-current"></strong><small id="appearance-save" role="status"></small></div><button id="appearance-reset">恢复默认</button></div>';
document.body.append(dialog);
const sceneURL=id=>new URL('../../assets/scenes/'+id+'.png',import.meta.url).href;
for(const scene of scenes){const b=document.createElement('button');b.className='appearance-scene';b.type='button';b.dataset.appearanceId=scene.id;b.dataset.appearanceType='scene';b.setAttribute('aria-pressed','false');b.innerHTML='<span class="appearance-scene-photo"><img src="'+sceneURL(scene.id)+'" alt="" loading="eager"><span class="appearance-selection-check" aria-hidden="true">✓</span></span><span class="appearance-scene-title">'+scene.name+'</span><small>'+scene.note+'</small>';b.addEventListener('click',()=>choose('scene',scene.id));dialog.querySelector('.appearance-scene-grid').append(b);}
for(const [id,name,note] of colors){const b=document.createElement('button');b.className='appearance-color';b.type='button';b.dataset.appearanceId=id;b.dataset.appearanceType='color';b.style.setProperty('--swatch',palettes[id][0]);b.style.setProperty('--swatch-accent',palettes[id][4]);b.setAttribute('aria-pressed','false');b.innerHTML='<span class="color-swatch" aria-hidden="true"><i></i><span>✓</span></span><span>'+name+(note?'<small>'+note+'</small>':'')+'</span>';b.addEventListener('click',()=>choose('color',id));dialog.querySelector('.appearance-color-grid').append(b);}
function showTab(type){document.querySelectorAll('[data-appearance-tab]').forEach(b=>{const on=b.dataset.appearanceTab===type;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});$('appearance-scenes').hidden=type!=='scene';$('appearance-colors').hidden=type!=='color';}
dialog.querySelectorAll('[data-appearance-tab]').forEach(b=>{b.addEventListener('click',()=>showTab(b.dataset.appearanceTab));b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const type=e.key==='Home'?'scene':e.key==='End'?'color':b.dataset.appearanceTab==='scene'?'color':'scene';showTab(type);dialog.querySelector('[data-appearance-tab="'+type+'"]').focus();});});
function choose(type,id){selected={type,id};try{localStorage.setItem(key,JSON.stringify({version:1,...selected}));storageOK=true;}catch{storageOK=false;}apply();}
function apply(){
 const scene=scenes.find(s=>s.id===selected.id),paletteId=selected.type==='scene'?scene.color:selected.id;
 const night=board.classList.contains('night');let p=[...palettes[paletteId]];
 if(selected.type==='color'&&selected.id==='warm'&&board.classList.contains('meditation'))p=[...palettes.sage];
 if(night)p=['#1e2b29','#24322e','#f2f0e8','#bbc7bf','#d5dfca','#52645c','#2d3c37','#e5e5d8','#c9d2be','#9bab96'];
 const vars=['paper','surface','ink','muted','accent','line','soft','ball-light','ball-mid','ball-dark'];
 for(const node of [document.body,board])vars.forEach((name,i)=>node.style.setProperty('--'+name,p[i]));
 document.body.style.setProperty('--focus-ring',p[4]);board.style.setProperty('--focus-ring',p[4]);
 document.body.dataset.appearanceType=selected.type;document.body.dataset.appearanceId=selected.id;document.body.dataset.appearanceNight=String(night);
 world.style.backgroundImage=selected.type==='scene'?'url("'+sceneURL(selected.id)+'")':'none';
 $('appearance-current').textContent=selected.type==='scene'?scene.name:colors.find(([id])=>id===selected.id)[1];
 $('appearance-save').textContent=storageOK?'已在本机记住':'仅本次生效，浏览器未允许保存';
 for(const b of dialog.querySelectorAll('[data-appearance-id]'))b.setAttribute('aria-pressed',String(b.dataset.appearanceId===selected.id&&b.dataset.appearanceType===selected.type));
 $('appearance-reset').disabled=selected.type==='color'&&selected.id==='warm';
 open.setAttribute('aria-label','外观，当前'+$('appearance-current').textContent+'，打开外观设置');
}
open.addEventListener('click',()=>{showTab(selected.type);dialog.showModal();open.setAttribute('aria-expanded','true');});
$('appearance-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{open.setAttribute('aria-expanded','false');open.focus();});
$('appearance-reset').addEventListener('click',()=>{choose('color','warm');showTab('color');});
new MutationObserver(apply).observe(board,{attributes:true,attributeFilter:['class']});
apply();
