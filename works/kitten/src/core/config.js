import {normalizeAudioPreferences} from '../audio/preferences.js';
export const meta = {
  focus:{mode:'focus',name:'专注',title:'先做眼前这一件。',start:'开始专注',pause:'暂停专注',resume:'继续专注',presets:[25,45,60]},
  short:{mode:'focus',name:'短休息',title:'离开屏幕，松一口气。',start:'开始短休息',pause:'暂停休息',resume:'继续休息',presets:[5,10,15]},
  long:{mode:'focus',name:'长休息',title:'留一点时间，舒展自己。',start:'开始长休息',pause:'暂停休息',resume:'继续休息',presets:[15,20,30]},
  sleep:{mode:'sleep',name:'睡眠',title:'把今天轻轻放下。',start:'开始睡眠定时',pause:'暂停定时',resume:'继续定时',presets:[15,30,60]},
  meditate:{mode:'meditate',name:'冥想',title:'把注意力，放回此刻。',start:'开始冥想',pause:'暂停冥想',resume:'继续冥想',presets:[5,10,15]}
};
export const modeNames = {focus:'专注',sleep:'睡眠',meditate:'冥想'};
export const defaults = () => ({
  durations:{focus:1500,short:300,long:900,sleep:1800,meditate:600},
  tasks:{focus:'读完《交互设计》第三章',short:'休息片刻',long:'长休息',sleep:'睡前放松',meditate:'晚间冥想'},
  motion:null,
  audio:normalizeAudioPreferences()
});
export const clock = ms => {const s=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
export const span = ms => {const s=Math.max(0,Math.floor(ms/1000));return s<60?s+'秒':Math.floor(s/60)+'分'+String(s%60).padStart(2,'0')+'秒';};
export const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
