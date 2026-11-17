import {defaults,meta} from './config.js';
import {mergeRecords} from './records.js';
// 日期锚点是计时真值；tick只触发核对，不累计200ms或依赖动画帧。
export class Timer {
  constructor(saved={}, {now=Date.now,audio=()=>null,onChange=()=>{}}={}) {
    this.now=now;this.audio=audio;this.onChange=onChange;
    this.settings=saved.settings||defaults();this.kind=saved.kind||'focus';this.status=saved.status||'ready';
    this.session=saved.session||null;this.records=mergeRecords(saved.records||[]);this.summary=saved.summary||null;
    this.tick();
  }
  effective(now=this.now()) {const s=this.session;return s?Math.min(s.durationMs,s.elapsedMs+(this.status==='running'?Math.max(0,now-s.segmentStart):0)):0;}
  inspect() {return {kind:this.kind,status:this.status,settings:this.settings,session:this.session?{...this.session,effectiveMs:this.effective()}:null,records:this.records,summary:this.summary};}
  serialize() {return {version:2,settings:this.settings,kind:this.kind,status:this.status,session:this.session?{...this.session}:null,records:this.records,summary:this.summary};}
  changed(type,detail={}) {this.onChange(type,detail);}
  start(activity,durationMs=this.settings.durations[this.kind]*1000) {
    if(this.session)return;
    if(!Number.isFinite(durationMs)||durationMs<1000||durationMs>14400000)throw new RangeError('计时时长超出范围');
    const now=this.now(),name=String(activity||this.settings.tasks[this.kind]||meta[this.kind].name).trim().slice(0,64)||meta[this.kind].name;
    this.settings.tasks[this.kind]=name;
    this.session={id:globalThis.crypto?.randomUUID?.()||now+'-'+Math.random().toString(36).slice(2),kind:this.kind,mode:meta[this.kind].mode,activity:name,startedAt:now,durationMs,elapsedMs:0,segmentStart:now};
    this.status='running';this.summary=null;this.changed('start');
  }
  pause() {
    if(this.status!=='running'||!this.session)return;
    if(this.tick())return;
    this.session.elapsedMs=this.effective();this.session.segmentStart=null;this.status='paused';this.changed('pause');
  }
  resume() {if(this.status!=='paused'||!this.session)return;this.session.segmentStart=this.now();this.status='running';this.changed('resume');}
  finish(result='early') {
    const s=this.session;if(!s)return;
    const now=this.now(),elapsed=this.effective(now),done=elapsed>=s.durationMs;
    const r={id:s.id,kind:s.kind,mode:s.mode,activity:s.activity,startedAt:s.startedAt,endedAt:done&&this.status==='running'?s.segmentStart+s.durationMs-s.elapsedMs:now,effectiveMs:done?s.durationMs:elapsed,durationMs:s.durationMs,status:done||result==='completed'?'completed':'early',audio:this.audio()};
    this.records=mergeRecords(this.records,[r]);this.summary={...r,remainingMs:Math.max(0,r.durationMs-r.effectiveMs)};this.session=null;this.status=r.status==='completed'?'completed':'ended';this.changed('finish',{record:r});return r;
  }
  tick() {if(this.session&&this.status==='running'&&this.effective()>=this.session.durationMs){this.finish('completed');return true;}return false;}
  reset() {if(this.session)return;this.status='ready';this.summary=null;this.changed('reset');}
  switchKind(kind) {if(this.session||!meta[kind])return;this.kind=kind;this.status='ready';this.summary=null;this.changed('switch');}
  duration(minutes) {if(this.session||!Number.isInteger(minutes)||minutes<1||minutes>240)return;this.settings.durations[this.kind]=minutes*60;this.changed('settings');}
  activity(text) {if(this.session||this.status!=='ready')return;this.settings.tasks[this.kind]=text.slice(0,64);this.changed('activity');}
  clearRecords() {this.records=[];this.changed('clear');}
}
