import {isAudioSource} from './catalog.js';

export const soundModes = {focus:'专注',rest:'专注间歇',sleep:'睡前陪伴',meditate:'冥想'};
export const soundModeDescriptions = {focus:'用于这一轮专注',rest:'用于短休息与长休息',sleep:'睡眠模式 · 定时播放，到点停止',meditate:'用于安静的呼吸与冥想'};
export const soundMode = kind => ['short','long','rest'].includes(kind) ? 'rest' : Object.hasOwn(soundModes,kind) ? kind : 'focus';
export function normalizeProfile(raw={}) {
  if(!raw||typeof raw!=='object')raw={};
  return {source:isAudioSource(raw.source)?raw.source:'none',volume:Number.isFinite(raw.volume)?Math.min(1,Math.max(0,raw.volume)):.3,autoPlay:typeof raw.autoPlay==='boolean'?raw.autoPlay:true,localName:typeof raw.localName==='string'?raw.localName.slice(0,200):''};
}
export function normalizeAudioPreferences(raw={},kind='focus') {
  if(!raw||typeof raw!=='object')raw={};
  const profiles=Object.fromEntries(Object.keys(soundModes).map(id=>[id,normalizeProfile(raw.profiles?.[id])]));
  // 旧版本只有一份全局选择，保留到当时的模式；不覆盖其他模式或活动记录。
  if(!raw.profiles)profiles[soundMode(kind)]=normalizeProfile(raw);
  const current=profiles[soundMode(kind)];
  return {source:current.source,volume:current.volume,muted:raw.muted===true,contactEnabled:raw.contactEnabled===true,endEnabled:raw.endEnabled===true,profiles};
}
export function recommendedProfiles(catalog) {
  const options={focus:['wind-nolde',.3],rest:['grassland-prairie',.25],sleep:['waves-atlantic',.22],meditate:['music-cylinder-1',.3]};
  return Object.fromEntries(Object.entries(options).map(([id,[source,volume]])=>[id,normalizeProfile({source:catalog.audio.some(x=>x.id===source)?'asset:'+source:'none',volume})]));
}
