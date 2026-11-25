// 企業の行動の寄指の値段（今は前の日の終値×1.02まで）を変えたらどうか（11/25。先に比べ方を決める）
// 自社株買い（良い条件2つ以上）・増配で、寄指を 終値×1.00／1.01／1.02（今）／1.03／1.05／上限なし にしたときの
//   買えた割合、買えた1回あたりの寄り→引けの全体比%、候補1件あたり（買えなければ0）の%。期間：前半／後半／直近
// 結果（11/25。候補1件あたり・前半／後半／直近）：自社株買い（良い条件2つ以上）+2%（今）+0.251／+0.279／+0.674%、+3% +0.314／+0.292／+0.691%（3つとも少し上）、+5% +0.172／+0.461／+0.880%（前半だけ下）、上限なし +0.101／+0.581／+0.798%。
//   増配は +2%（今）+0.259／+0.195／+0.080% がほぼ一番（+3% +0.249／+0.133／−0.088%）。→ 自社株買いだけ +3% を口座全体で確かめる（study_combined の bbLimit）
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
const BB = '2025-11-14', per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const D = loadAll({ withSwing: false, withSmall: true })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const L = [0, 1, 2, 3, 5, 99]
for (const kind of ['buyback', 'divup']) {
  const G = Object.fromEntries(L.map(l => [l, { per: [[], [], []], fill: [[], [], []] }]))
  for (const e of D.events) {
    if (e.kind !== kind || (kind === 'buyback' && !(e.score >= 2))) continue
    const B = stocks[e.code]?.bars, x = B?.[e.i + 1]; if (!x) continue
    const k = bi.get(x.date); if (k === undefined) continue
    const ex = (x.c / x.o - 1) * 100 - (bench[k].c / bench[k].o - 1) * 100, p = per(e.date), c0 = B[e.i].c
    for (const l of L) { const f = x.o <= c0 * (1 + l / 100); G[l].fill[p].push(f ? 1 : 0); G[l].per[p].push(f ? ex : 0) }
  }
  console.log(`\n■ ${kind === 'buyback' ? '自社株買い（良い条件2つ以上）' : '増配'}：寄指の上限・買えた割合・買えた1回あたり・候補1件あたり（前半／後半／直近）`)
  for (const l of L) {
    const g = G[l], f = g.fill.map(a => mean(a)), pc = g.per.map(a => mean(a)), pf = pc.map((v, i) => v / f[i])
    console.log(`  +${String(l).padEnd(3)}% 買えた ${f.map(v => (v * 100).toFixed(0) + '%').join('／')}  1回 ${pf.map(v => fmt(v)).join('／')}%  候補あたり ${pc.map(v => fmt(v, 3)).join('／')}%`)
  }
}
