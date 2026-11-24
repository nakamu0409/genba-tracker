// 企業の行動で寄指が通らなかった（寄りが終値+2%より上）あと、場中に寄指の値段まで下がったら買うと得か（2026-11-24 本人の質問）
// 結果：採らない。寄指で買えた +0.25／+0.39／+0.68%（全体比）に対し、場中に指値まで下がって買うと引けで −0.06／±0.00／−0.70%、翌朝の寄りで +0.12／−0.04／−0.79%（そのまま%）。
//   高く始まってから下がってくる日は、売りが強い日。寄りで買えなかったら、その日は追わない
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
const BB='2025-11-14', per=d=>d<SPLIT_DATE?0:d<BB?1:2
const D=loadAll({withSwing:false}); const {stocks,bench}=D; const bi=new Map(bench.map((b,i)=>[b.date,i]))
const G={hit:[[],[],[]],hitC:[[],[],[]],nohit:[[],[],[]],filled:[[],[],[]]}; let miss=0,hitN=0
for(const e of D.events){ if(e.kind!=='buyback'&&e.kind!=='divup')continue
 const st=stocks[e.code],x=st.bars[e.i+1]; if(!x||x.h===x.l)continue; const k=bi.get(x.date); if(k===undefined)continue
 const bOC=(bench[k].c/bench[k].o-1)*100, p=per(e.date)
 if(x.o<=e.limit){G.filled[p].push((x.c/x.o-1)*100-bOC);continue}
 miss++
 if(x.l<=e.limit){hitN++;G.hit[p].push((x.c/e.limit-1)*100); const n=st.bars[e.i+2]; if(n)G.hitC[p].push((n.o/e.limit-1)*100)}
 else G.nohit[p].push((x.c/x.o-1)*100-bOC)}
const s=a=>a.map(z=>`${fmt(mean(z))}%(${z.length})`).join(' ／ ')
console.log('寄指で買えた（寄り→引け、全体比）',s(G.filled))
console.log('寄指で買えなかった',miss,'件のうち、場中に指値まで下がった',hitN)
console.log('  その指値で買って引けで売る（そのまま%）',s(G.hit))
console.log('  その指値で買って翌朝の寄りで売る',s(G.hitC))
