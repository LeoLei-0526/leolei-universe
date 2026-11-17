// 一个可取消调度器负责猫的真实像素帧与球；计时、记录和音频引擎保持独立。
export function createBallScheduler(pet, core, data) {
 'use strict';
 const $=id=>document.getElementById(id),board=$('preview-board'),stage=$('ball-stage'),ball=$('time-ball'),home=$('ball-home'),shadow=$('toy-shadow');
 const plan=data.choreography||{},active=new Set(),seen=new Set();
 // 恢复当前页面的会话不重播入场；新会话只保留当前一个标记。
 if(core().session?.id)seen.add(core().session.id);
 const contacts=[],phrases=[],pauses=[],history=[];let epoch=0,previous=null,phase='home',point=null,waitHandle=null,loopActive=false,busy=false,queuedManual=false;
 let introCount=0,autoCount=0,manualCount=0,cancelCount=0,lastGesture=null,nextLongPause=2+Math.floor(Math.random()*2),sincePause=0;
 const random=(lo,hi)=>lo+Math.random()*(hi-lo),width=()=>ball.offsetWidth||parseFloat(getComputedStyle(ball).width)||320;
 const canLoop=()=>{const s=core();return s.kind==='focus'&&s.status==='running'&&s.session&&pet.inspect().ready&&!pet.isReduced()&&!document.hidden&&!$('timer-view').hidden&&plan.ready&&plan.gestures?.length>1;};
 const record=(type,detail={})=>{history.push({type,at:performance.now(),epoch,...detail});if(history.length>400)history.shift();};
 function geometry(){
  const s=stage.getBoundingClientRect(),h=home.getBoundingClientRect(),c=$('pet-frames').getBoundingClientRect(),canvas=$('pet-frames');
  const nw=canvas.width||448,nh=canvas.height||544,scale=Math.min(c.width/nw,c.height/nh),paintW=nw*scale,paintH=nh*scale,left=c.left-s.left+(c.width-paintW)/2,top=c.bottom-s.top-paintH;
  const baseline=pet.inspect().baseline||[nw/2,nh-16],floor=top+baseline[1]*scale,r=22;
  return {home:{x:h.left-s.left+h.width/2,y:h.top-s.top+h.height/2,size:h.width},rest:{x:Math.min(s.width-r-8,left+paintW+25),y:floor-r,size:44},scale,paint:{left,top,width:paintW,height:paintH},floor,maxX:s.width-r-8,above:Math.max(22,top-32)};
 }
 function sourcePoint(xy){const g=geometry();return {x:g.paint.left+xy[0]*g.scale,y:g.paint.top+xy[1]*g.scale};}
 function place(p){point={...p};ball.style.transform='translate('+(p.x-p.size/2)+'px,'+(p.y-p.size/2)+'px) scale('+p.size/width()+')';shadow.style.left=(p.x-25)+'px';shadow.style.top=(p.y+p.size/2-1)+'px';}
 function capture(){const m=new DOMMatrixReadOnly(getComputedStyle(ball).transform),size=width()*Math.abs(m.a);return {x:m.e+size/2,y:m.f+size/2,size};}
 function setPhase(v){phase=v;board.dataset.ballPhase=v;record('phase',{phase:v});}
 function controls(){const s=core(),toy=s.status!=='ready';ball.disabled=toy&&(s.kind!=='focus'||s.status!=='running');ball.setAttribute('aria-label',toy?(pet.isReduced()?'轻轻陪着小猫，获得静态回应':'轻轻拨球，让小猫下一轮回应你'):'点击时间球，开始这一轮');$('pet-target').disabled=s.status==='paused';$('pet-hint').disabled=s.status==='paused';if(s.kind==='focus'&&s.status==='running')$('pet-hint').textContent=pet.isReduced()?'轻轻陪着它':'轻轻拨球';}
 function cancel(){
  if(loopActive||active.size||waitHandle)cancelCount++;if(active.size)place(capture());epoch++;for(const a of active)a.cancel();active.clear();
  if(waitHandle){const h=waitHandle;waitHandle=null;clearTimeout(h.id);h.reject(Error('cancelled'));}loopActive=false;busy=false;queuedManual=false;record('cancel');
 }
 function wait(ms,token){return new Promise((resolve,reject)=>{if(token!==epoch)return reject(Error('cancelled'));const h={reject,resolve:()=>{if(waitHandle===h)waitHandle=null;token===epoch?resolve():reject(Error('cancelled'));}};h.id=setTimeout(h.resolve,ms);waitHandle=h;});}
 function wake(){if(waitHandle){const h=waitHandle;clearTimeout(h.id);h.resolve();}}
 async function move(points,duration,token,easing='cubic-bezier(.3,.04,.3,1)'){
  if(token!==epoch)throw Error('cancelled');const a=ball.animate(points.map(p=>({transform:'translate('+(p.x-p.size/2)+'px,'+(p.y-p.size/2)+'px) scale('+p.size/width()+')',offset:p.offset})),{duration,easing,fill:'forwards'});active.add(a);
  try{await a.finished;if(token!==epoch)throw Error('cancelled');place(points.at(-1));}finally{active.delete(a);a.cancel();}
 }
 function pickGesture(){const choices=plan.gestures.filter(g=>g.id!==lastGesture);const g=choices[Math.floor(Math.random()*choices.length)]||plan.gestures[0];lastGesture=g.id;return g;}
 function stepPoint(step){
  if(step.contact){const p=sourcePoint(step.paw),offset=step.offset||[18,0];return {x:p.x+offset[0],y:p.y+offset[1],size:44};}
  if(step.ball){const p=sourcePoint(step.ball);return {...p,size:44};}return geometry().rest;
 }
 function touch(step,gesture,reason,sessionId){
  const s=pet.inspect(),paw=sourcePoint(step.paw),b=capture(),pixel=$('pet-frames').getContext('2d').getImageData(Math.round(step.paw[0]),Math.round(step.paw[1]),1,1).data;
  if(s.action!==gesture.action||s.frame!==step.frame||pixel[3]<80||Math.hypot(b.x-paw.x,b.y-paw.y)>b.size/2)throw Error('接触帧/像素未对齐：'+gesture.id);
  const contact={reason,gesture:gesture.id,action:s.action,frame:s.frame,at:performance.now(),pawSource:step.paw,paw,ball:b,pawAlpha:pixel[3],overlapPx:b.size/2-Math.hypot(b.x-paw.x,b.y-paw.y),sessionId};contacts.push(contact);if(contacts.length>300)contacts.shift();
  record('contact',{reason,gesture:gesture.id,frame:s.frame});window.dispatchEvent(new CustomEvent('pomodoro-ball-contact',{detail:{reason,gesture:gesture.id}}));
 }
 async function perform(gesture,reason,token){
  busy=true;const s=core(),speed=random(.94,1.08),began=performance.now();let sent=false;
  for(const step of gesture.steps){
   if(token!==epoch||!canLoop())throw Error('cancelled');if(!pet.showFrame(gesture.action,step.frame))throw Error('动作帧不可用');setPhase(step.contact?'reaching':(step.phase||'playing'));
   const target=stepPoint(step),duration=Math.max(120,Math.round(step.durationMs*speed));
   const distance=Math.hypot(target.x-point.x,target.y-point.y);if(distance>1)await move([point,target],Math.max(70,duration-(step.contact?140:50)),token,'cubic-bezier(.24,0,.45,1)');
   if(step.contact){setPhase('contact');touch(step,gesture,sent?'auto':reason,s.session.id);sent=true;await wait(Math.min(140,duration),token);}else await wait(distance>1?50:duration,token);
  }
  if(reason==='manual')manualCount++;else autoCount++;phrases.push({id:gesture.id,action:gesture.action,reason,began,ended:performance.now(),speed});if(phrases.length>150)phrases.shift();sincePause++;busy=false;
 }
 async function run(token,intro){
  loopActive=true;record('loop-start',{intro});controls();
  try{
   if(intro){introCount++;const g=geometry();setPhase('flight');place(g.home);await move([g.home,{x:g.home.x+95,y:g.home.y-60,size:90,offset:.3},{x:g.paint.left-55,y:g.above,size:44,offset:.6},{x:g.maxX,y:g.above,size:44,offset:.82},g.rest],1100,token);}
   else if(point){await move([point,geometry().rest],220,token);}else place(geometry().rest);
   let first=intro;
   while(token===epoch&&canLoop()){
    const gesture=pickGesture();const reason=queuedManual?'manual':first?'start':'auto';queuedManual=false;first=false;
    await perform(gesture,reason,token);
    const long=sincePause>=nextLongPause;const ms=long?random(2800,4200):random(600,1450);
    const watch=gesture.watchFrame??gesture.steps[0].frame;pet.showFrame(gesture.action,watch);setPhase(long?'resting':'watching');
    const pause={kind:long?'natural-long':'observe',began:performance.now(),plannedMs:ms,gesture:gesture.id};pauses.push(pause);if(pauses.length>150)pauses.shift();record('pause-start',{kind:pause.kind,plannedMs:ms});
    if(long){sincePause=0;nextLongPause=2+Math.floor(Math.random()*2);}await wait(ms,token);pause.ended=performance.now();record('pause-end',{kind:pause.kind,actualMs:pause.ended-pause.began});
   }
  }catch(e){if(token===epoch){record('loop-error',{message:e.message});board.dataset.actionError=e.message;pet.release();place(geometry().rest);setPhase('settled');}}
  finally{if(token===epoch){loopActive=false;busy=false;controls();}}
 }
 async function quietDrop(token,intro){
  const g=geometry();if(!intro||pet.isReduced()||document.hidden){place(g.rest);setPhase('settled');return;}introCount++;place(g.home);setPhase('flight');
  try{await move([g.home,{x:g.paint.left-50,y:g.floor+55,size:44,offset:.45},{x:g.rest.x,y:g.floor+55,size:44,offset:.83},g.rest],1350,token);if(token===epoch)setPhase('settled');}catch(_){/* 状态变化取消旧路径 */}
 }
 function sync(){
  const s=core(),id=s.session?.id||null,next={kind:s.kind,status:s.status,id,reduced:pet.isReduced(),hidden:document.hidden||$('timer-view').hidden,ready:pet.inspect().ready};
  if(previous&&Object.keys(next).every(k=>next[k]===previous[k]))return;previous=next;cancel();board.dataset.ballLayout=s.status==='ready'?'home':'toy';board.dataset.ballState=s.status;controls();
  if(next.hidden){pet.suspend();setPhase('suspended');return;}
  if(s.status==='paused'){pet.suspend();setPhase('paused');return;}
  if(s.status==='ready'){pet.release();place(geometry().home);setPhase('home');return;}
  if(!next.ready){place(geometry().rest);setPhase('waiting-assets');return;}
  const intro=s.status==='running'&&id&&!seen.has(id);if(intro){seen.clear();seen.add(id);}
  if(s.kind==='focus'&&s.status==='running'&&!next.reduced&&plan.ready&&plan.gestures?.length>1){run(epoch,intro);return;}
  pet.release();if(s.status==='running'&&s.kind!=='focus'){quietDrop(epoch,intro);return;}place(geometry().rest);setPhase('settled');
 }
 function manual(){if(pet.isReduced()){pet.respond();return;}if(!canLoop())return;if(!queuedManual){queuedManual=true;record('manual-request');}if(!busy)wake();}
 ball.addEventListener('click',()=>{if(core().status==='ready')$('primary-action').click();else manual();});
 document.addEventListener('click',e=>{if(!e.target.closest('#pet-target,#pet-hint'))return;const s=core();if(s.kind==='focus'&&s.status==='running'){e.preventDefault();e.stopImmediatePropagation();manual();}},true);
 new MutationObserver(sync).observe(board,{attributes:true,attributeFilter:['data-status','data-kind','data-reduced']});new MutationObserver(sync).observe($('timer-view'),{attributes:true,attributeFilter:['hidden']});
 document.addEventListener('visibilitychange',sync);window.addEventListener('petassetsready',sync);
 window.addEventListener('pagehide',()=>{cancel();pet.suspend();previous=null;});
 window.addEventListener('resize',()=>{previous=null;sync();});
 const api=Object.freeze({sync,inspect:()=>({phase,busy,loopActive,queuedManual,epoch,introCount,autoCount,manualCount,cancelCount,point:point&&capture(),geometry:$('timer-view').hidden?null:geometry(),activeAnimations:active.size,pendingWait:!!waitHandle,planReady:!!plan.ready,contacts:contacts.map(c=>({...c})),phrases:phrases.map(c=>({...c})),pauses:pauses.map(c=>({...c})),history:history.map(c=>({...c})),state:previous})});sync();return api;
}
