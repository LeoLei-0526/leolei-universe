// 网页专用完整像素帧播放器；新增playing/meditating，不移动或扭曲整张猫图。
export function createCatPlayer(data) {
 'use strict';
 const $=id=>document.getElementById(id),pet=$('pet-target'),scene=$('cat-scene'),board=$('preview-board'),canvas=$('pet-frames'),ctx=canvas.getContext('2d');
 const media=matchMedia('(prefers-reduced-motion: reduce)'),actions=data.actions||{},images=new Map();
 let ready=false,reduced=media.matches,explicit=false,state={},stateKey='',base='idle',action='idle',frame=0,elapsed=0,managed=false;
 let raf=0,lastTime=null,replyTimer=0,lastPetAt=-10000,drawCount=0,changedFrames=0,cycles=0,starts=0,loadError=null,registration=null;
 const history=[],canPlay=()=>ready&&!reduced&&!document.hidden&&state.status!=='paused',sequence=()=>actions[action];
 const record=(type,detail={})=>{history.push({type,at:performance.now(),...detail});if(history.length>200)history.shift();};
 function stop(){if(raf)cancelAnimationFrame(raf);raf=0;lastTime=null;}
 function fitRegistered(s){
  pet.classList.toggle('is-lying',action==='sleep');for(const k of ['width','height','left','bottom'])pet.style.removeProperty(k);
  const css=getComputedStyle(pet),w=parseFloat(css.width),h=parseFloat(css.height),left=parseFloat(css.left),bottom=parseFloat(css.bottom),ref=action==='sleep'?actions.sleep:actions.idle;
  const refScale=Math.min(w/ref.canvas[0],h/ref.canvas[1]),refW=ref.canvas[0]*refScale;
  const refAnchor=ref.baseline||[ref.canvas[0]/2,ref.canvas[1]-16],anchor=s.baseline||[s.canvas[0]/2,s.canvas[1]-16];
  const center=left+(w-refW)/2+refAnchor[0]*refScale,scale=h/s.canvas[1],newW=s.canvas[0]*scale;
  const newLeft=center-anchor[0]*scale,newBottom=bottom+(ref.canvas[1]-refAnchor[1])*refScale-(s.canvas[1]-anchor[1])*scale;
  Object.assign(pet.style,{width:newW+'px',height:h+'px',left:newLeft+'px',bottom:newBottom+'px'});registration={scale,left:newLeft,bottom:newBottom,width:newW,height:h};
 }
 function draw(){
  if(!ready||!sequence())return false;const s=sequence(),f=s.frames[frame],img=images.get(f.image);if(!img?.complete||!img.naturalWidth)return false;
  if(canvas.width!==s.canvas[0])canvas.width=s.canvas[0];if(canvas.height!==s.canvas[1])canvas.height=s.canvas[1];fitRegistered(s);
  ctx.clearRect(0,0,canvas.width,canvas.height);const r=f.rect||[0,0,img.naturalWidth,img.naturalHeight];ctx.drawImage(img,...r,0,0,canvas.width,canvas.height);
  pet.classList.add('has-frame-assets');pet.dataset.animation=action;pet.dataset.frame=String(frame);drawCount++;
  window.dispatchEvent(new CustomEvent('pomodoro-pet-frame',{detail:{action,frame,managed}}));return true;
 }
 function select(name,restart=false){if(!actions[name])return false;if(action===name&&!restart)return true;action=name;frame=reduced?(actions[name].staticFrame||0):0;elapsed=0;lastTime=null;draw();return true;}
 function advance(dt){
  elapsed+=dt;let guard=0;
  while(sequence()&&elapsed>=sequence().frames[frame].durationMs&&guard++<100){
   elapsed-=sequence().frames[frame].durationMs;
   if(frame+1<sequence().frames.length)frame++;else if(sequence().loop){frame=0;cycles++;}else{action=base;frame=0;elapsed=0;}
   changedFrames++;draw();
  }
 }
 function tick(now){raf=0;if(!canPlay()||managed){lastTime=null;return;}if(lastTime!==null)advance(Math.min(250,Math.max(0,now-lastTime)));lastTime=now;raf=requestAnimationFrame(tick);}
 function resume(){if(!canPlay()||managed||raf||!sequence()||sequence().frames.length<2)return;starts++;lastTime=null;raf=requestAnimationFrame(tick);}
 function clearReply(){clearTimeout(replyTimer);replyTimer=0;scene.classList.remove('has-pet-response');$('pet-caption').textContent='';}
 function respond(){
  const now=performance.now();if(now-lastPetAt<600)return false;lastPetAt=now;clearReply();
  const calm=state.mode==='sleep'||state.mode==='meditate'||['short','long'].includes(state.kind);
  $('pet-caption').textContent=calm?'陪它静静待着。':'嗯，我在这里。';scene.classList.add('has-pet-response');
  if(!calm&&canPlay()&&!managed){select('waving',true);resume();}replyTimer=setTimeout(clearReply,2400);return true;
 }
 function setState(next){
  const key=[next.mode,next.kind,next.status].join('/');if(key===stateKey)return;const oldStatus=state.status;state={...next};stateKey=key;clearReply();
  const nextBase=next.mode==='sleep'||['short','long'].includes(next.kind)?'sleep':next.mode==='meditate'?'meditating':'idle';
  if(nextBase!==base){managed=false;stop();base=nextBase;select(base,true);}else if(action==='waving'&&next.status!=='running'){managed=false;select(base,true);}
  pet.classList.toggle('is-lying',base==='sleep');pet.classList.toggle('is-sleeping',next.mode==='sleep');pet.classList.toggle('is-resting',['short','long'].includes(next.kind));pet.dataset.pose=base;
  pet.querySelector('.pose-sit').setAttribute('aria-hidden',String(base==='sleep'));pet.querySelector('.pose-sleep').setAttribute('aria-hidden',String(base!=='sleep'));
  $('pet-sub').textContent='';$('pet-hint').textContent=next.mode==='meditate'?'一起静静呼吸':base==='sleep'?'陪它静静待着':'摸摸它';
  pet.setAttribute('aria-label',base==='meditating'?'仰头闭眼的小猫，安静陪你冥想':base==='sleep'?'轻轻陪着休息的小猫，不唤醒它':'摸摸小猫，获得无声回应');
  if(next.status==='paused')stop();else if(oldStatus==='paused')record('resumed');
  if(reduced&&ready){managed=false;stop();select(base,true);frame=actions[base]?.staticFrame||0;elapsed=0;draw();}resume();
 }
 function setReduced(on,chosen=true){const changed=reduced!==!!on;reduced=!!on;explicit=chosen;$('reduce-motion').checked=reduced;board.dataset.reduced=String(reduced);pet.classList.toggle('is-motion-off',reduced);if(!changed)return;clearReply();managed=false;stop();select(base,true);if(ready){frame=actions[base]?.staticFrame||0;elapsed=0;draw();}resume();}
 // 编排器按真实帧序号逐帧展示，并与球的接触路径共用时序。没有截图位移伪动作。
 function showFrame(name,index){
  if(!canPlay()||!actions[name]?.frames[index])return false;stop();if(action!==name||frame!==index)changedFrames++;managed=true;action=name;frame=index;elapsed=0;record('pose',{action,frame});return draw();
 }
 function suspend(){stop();managed=true;record('suspended',{action,frame});}
 function release(){managed=false;stop();select(base,true);resume();}
 async function load(){
  if(!data.approved||!['idle','waving','sleep'].every(n=>actions[n]?.frames?.length))return;
  try{const keys=new Set(Object.values(actions).flatMap(s=>s.frames.map(f=>f.image)));await Promise.all([...keys].map(async key=>{const img=new Image();img.src=data.images[key];await img.decode();images.set(key,img);}));ready=true;action=actions[base]?base:'idle';frame=reduced?(actions[action].staticFrame||0):0;elapsed=0;draw();resume();window.dispatchEvent(new Event('petassetsready'));}
  catch(e){loadError=e.message;ready=false;stop();pet.classList.remove('has-frame-assets');}
 }
 pet.addEventListener('click',respond);$('pet-hint').addEventListener('click',respond);
 document.addEventListener('visibilitychange',()=>{pet.classList.toggle('is-suspended',document.hidden);board.classList.toggle('is-page-hidden',document.hidden);if(document.hidden)stop();else resume();});
 media.addEventListener('change',e=>{if(!explicit){setReduced(e.matches,false);window.dispatchEvent(new Event('petmotionchange'));}});
 window.addEventListener('resize',()=>draw());
 const api=Object.freeze({setState,setReduced,isReduced:()=>reduced,respond,showFrame,suspend,release,
  inspect:()=>({ready,reduced,hidden:document.hidden,action,base,frame,elapsedMs:elapsed,playing:!!raf,managed,drawCount,changedFrames,cycles,starts,stateKey,decodedImages:images.size,loadError,availableActions:Object.keys(actions),canvas:actions[action]?.canvas,baseline:actions[action]?.baseline,registration,history:history.map(e=>({...e}))})});load();return api;
}