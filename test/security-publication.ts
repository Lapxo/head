import { scan, type File, type References } from './pack-literals.ts';
/** Public selection is a positive path inventory, never a dictionary of private names. */
export function publicSelection(files: readonly File[], selected: readonly string[]) {
  const allowed=new Set(selected),seen=new Set<string>();let violations=0;
  for(const f of files){const p=f.path,parts=p.split('/');if(seen.has(p)||!allowed.has(p)||p.startsWith('/')||parts.some(x=>!x||x==='.'||x==='..'||['.bound','.git','.ssh','.config'].includes(x)))violations++;seen.add(p)}
  return violations;
}
export function auditPublication(carried: readonly File[], packed: readonly File[], selected: readonly string[], hosts: ReadonlySet<string>, worlds: ReadonlySet<string>, references?: References) {
  const found=scan(carried,packed,hosts,[],worlds,references);
  return {'literal/host':found['literal/host']!.length,'literal/key':found['literal/key']!.length,'literal/path':found['literal/path']!.length,'literal/org':publicSelection(packed,selected),'package/world-bytes':found['package/world-bytes']!.length};
}
export interface ClaimBlock { readonly text:string; readonly kind:'claim'|'instruction'|'example'|'boundary'; readonly evidence:readonly string[]; readonly limitation?:string }
/** Exact document inventory: additions, edits or unsupported claims cannot inherit an old zero. */
export function uncoveredClaims(readme:string,blocks:readonly ClaimBlock[],paid:ReadonlySet<string>) {
  if(blocks.map(b=>b.text).join('\n\n')!==readme.trimEnd())throw Error('REFUSE·security/readme-inventory');
  return blocks.filter(b=>(b.kind==='claim'&&(!b.evidence.length||b.evidence.some(id=>!paid.has(id))))||(b.kind==='boundary'&&!b.limitation)).length;
}
