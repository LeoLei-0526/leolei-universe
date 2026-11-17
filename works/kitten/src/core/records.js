import {meta} from './config.js';
export function validRecord(r) {
  return !!(r && typeof r.id==='string' && r.id.length>0 && meta[r.kind] && r.mode===meta[r.kind].mode && typeof r.activity==='string' && ['completed','early'].includes(r.status) &&
    Number.isFinite(r.startedAt) && r.startedAt>=0 && Number.isFinite(r.endedAt) && r.endedAt>=r.startedAt && Number.isFinite(r.effectiveMs) && r.effectiveMs>=0 &&
    (r.durationMs==null || Number.isFinite(r.durationMs) && r.durationMs>0 && r.effectiveMs<=r.durationMs));
}
export function mergeRecords(...lists) {
  const map=new Map();
  for(const r of lists.flat()) if(validRecord(r)) map.set(r.id,{...r});
  return [...map.values()];
}
