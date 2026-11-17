// 数据清单只列经审核、已复制入本工程的音频；外部资料不会成为网页播放音源。
const categories=new Set(['wind','rain','grassland','ocean','meditation','stream','forest']);
const idPattern=/^[a-z][a-z0-9_-]{2,63}$/;
export const isAssetSource=source=>typeof source==='string'&&/^asset:[a-z][a-z0-9_-]{2,63}$/.test(source);
export const isAudioSource=source=>['none','pink','brown','local'].includes(source)||isAssetSource(source);
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
function trustedURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}
export function formatAudioDuration(seconds){const total=Math.round(seconds);return Math.floor(total/60)+'分'+String(total%60).padStart(2,'0')+'秒';}
export function normalizeCatalog(raw) {
  if(raw?.schemaVersion!==1||!Array.isArray(raw.audio)||!Array.isArray(raw.links))throw Error('音频清单格式不匹配');
  const ids=new Set(),audio=[],links=[];
  for(const item of raw.audio){
    if(typeof item.id!=='string'||!idPattern.test(item.id)||ids.has(item.id))throw Error('音频id重复或无效');ids.add(item.id);
    if(!['recording','music','guide'].includes(item.kind)||!categories.has(item.category)||!nonempty(item.name))throw Error('音频类型、类别或名称无效');
    if(item.approved!==true||!nonempty(item.license?.attribution)||!nonempty(item.author)||!trustedURL(item.sourceURL))throw Error('音频缺少采用批准或来源/署名信息');
    // 用户指定的本机引导单独校验；技术采用不等于取得公开内置或再分发许可。
    if(item.origin?.type==='user-import'){
      const origin=item.origin,license=item.license;
      if(item.kind!=='guide'||item.category!=='meditation'||origin.scope!=='local-personal'||origin.userRequested!==true||!nonempty(origin.sourceTitle)||origin.handoffSHA256!==item.sha256||!trustedURL(item.authorURL)||item.productEmbedded!==false||license.embeddable!==false||license.name!=='未声明开放许可'||license.openLicenseFound!==false||license.commercialUsePermissionVerified!==false||license.publicRedistributionPermissionVerified!==false)throw Error('用户指定素材缺少明确的本机用途、交接校验或来源事实');
    }else if(item.origin!=null||item.productEmbedded!==true||item.license.embeddable!==true||!nonempty(item.license.name)||!trustedURL(item.license.url))throw Error('音频缺少公开内置授权信息');
    if(!/^\.\/assets\/audio\/files\/[a-z0-9_-]+\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(item.file)||!/^[a-f0-9]{64}$/i.test(item.sha256)||!Number.isFinite(item.durationSeconds)||item.durationSeconds<=0)throw Error('音频文件、校验值或时长无效');
    const playback=item.playback;
    if(!playback||typeof playback.loop!=='boolean'||!Number.isFinite(playback.gain)||playback.gain<=0||playback.gain>1||!Number.isFinite(playback.fadeOutSeconds)||playback.fadeOutSeconds<0||playback.fadeOutSeconds>15)throw Error('音频播放建议无效');
    if(item.kind==='guide'&&(item.category!=='meditation'||playback.loop))throw Error('人声引导须归入冥想且不循环');
    audio.push({...item,name:item.name.trim(),playback:{...playback},license:{...item.license}});
  }
  for(const item of raw.links){
    if(typeof item.id!=='string'||!idPattern.test(item.id)||ids.has(item.id)||item.approved!==true||!['guide','music','recording'].includes(item.kind)||!nonempty(item.name)||!nonempty(item.publisher)||!trustedURL(item.url))throw Error('外部参考缺少审核或可信发布入口');ids.add(item.id);
    if(item.durationSeconds!=null&&(!Number.isFinite(item.durationSeconds)||item.durationSeconds<=0))throw Error('外部参考时长无效');
    if(item.sourcePage!=null&&!trustedURL(item.sourcePage))throw Error('外部参考发布来源无效');
    links.push({...item});
  }
  return {schemaVersion:1,audio,links};
}
export async function loadAudioCatalog(url,fetcher=fetch){const r=await fetcher(url);if(!r.ok)throw Error('素材清单无法读取');return normalizeCatalog(await r.json());}
export function mountCatalog(catalog) {
  const select=document.getElementById('pa-source');
  for(const [kind,title]of [['recording','自然录音'],['music','冥想音乐'],['guide','冥想引导']]){
    const items=catalog.audio.filter(x=>x.kind===kind);if(!items.length)continue;
    const group=document.createElement('optgroup');group.label=title;
    for(const item of items){const option=document.createElement('option');option.value='asset:'+item.id;option.textContent=item.name+(item.kind==='guide'?' · '+formatAudioDuration(item.durationSeconds):'');group.append(option);}select.append(group);
  }
  const references=document.getElementById('pa-references'),list=document.getElementById('pa-reference-list');
  references.hidden=catalog.links.length===0;
  const label={guide:'引导',music:'音乐参考',recording:'录音参考'};
  for(const item of catalog.links){
    const p=document.createElement('p'),a=document.createElement('a');a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=item.name+' ↗';
    const text=document.createElement('span');text.textContent=' · '+label[item.kind]+' · '+item.publisher+(item.language?' · '+item.language:'')+(item.durationSeconds?' · '+Math.round(item.durationSeconds/60*10)/10+'分钟':'')+(item.accessNote?' · '+item.accessNote:'');
    p.append(a,text);
    if(item.sourcePage&&item.sourcePage!==item.url){const source=document.createElement('a');source.href=item.sourcePage;source.target='_blank';source.rel='noopener noreferrer';source.textContent=' · 发布来源 ↗';p.append(source);}
    list.append(p);
  }
}
