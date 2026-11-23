// 企業の行動を、売買代金の小さい会社まで広げると稼げるか（2026-11-23。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_ev_small.mjs
// 今は20日平均の売買代金1億円以上だけ。3,000万〜1億円の会社を足したときの、翌日の寄指（終値×1.02以下）→ 引けの全体比%と、寄指で買えた割合
// 注意：小さい会社は寄りの売り物が少なく、買う株数を売買代金の1.5%（evTurnCap）までにすると1回の金額が小さい。1回の金額の目安も出す
// 結果（2026-11-23）：手元の10年のデータ（wide.json 1,438銘柄）は売買代金の小さい会社がほとんど入っていないため、件数が少なすぎて判断できない。
//   増配の5,000万〜1億円は +0.59／+1.22／+1.00%（18・36・9件）と3つともプラスで有望。自社株買いと株式分割は件数が少なくばらばら。
//   → 小さい会社の日足と開示を集め直してから確かめる（HANDOFF の「より稼ぐための候補」）
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
const A = SPLIT_DATE, BB = '2025-11-14'
const per = d => (d < A ? 0 : d < BB ? 1 : 2)
const D = loadAll({ withSwing: false, evMinTurn: 3e7 })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
let BBD = {}
try { BBD = JSON.parse((await import('node:fs')).readFileSync(new URL('../bb_detail.json', import.meta.url), 'utf-8')) } catch {}
const bands = [['1億円以上（今）', 1e8, Infinity], ['5,000万〜1億円', 5e7, 1e8], ['3,000万〜5,000万円', 3e7, 5e7]]
const kinds = [['自社株買い（良い条件2つ以上・割合込み）', e => e.kind === 'buyback' && (e.score ?? 0) + ((BBD[`${e.code}|${e.date}|${e.time}`]?.pct ?? 0) >= 2 ? 1 : 0) >= 2], ['増配', e => e.kind === 'divup'], ['株式分割（5日）', e => e.kind === 'split']]
for (const [kn, kf] of kinds) {
  console.log(`\n■ ${kn}（全体比%（買えた件数）／買えた割合／1回の金額の上限の目安＝売買代金×1.5%）`)
  for (const [bn, lo, hi] of bands) {
    const g = [[], [], []]; let n = 0, f = 0; const cap = []
    for (const e of D.events) {
      if (!kf(e)) continue
      const st = stocks[e.code]; const t = st.turn[e.i]
      if (t < lo || t >= hi) continue
      n++
      const x = st.bars[e.i + 1]
      if (!x || x.h === x.l || x.o > e.limit) continue
      const hold = e.kind === 'split' ? 5 : 1
      const z = st.bars[e.i + hold]
      const k0 = bi.get(x.date), k1 = z && bi.get(z.date)
      if (!z || k0 === undefined || k1 === undefined) continue
      f++
      g[per(e.date)].push((z.c / x.o - 1) * 100 - (bench[k1].c / bench[k0].o - 1) * 100)
      cap.push(t * 0.015)
    }
    cap.sort((a, b) => a - b)
    console.log(`  ${bn.padEnd(16)} ${g.map(a => `${fmt(mean(a))}%(${a.length})`).join('  ')}  買えた ${(f / n * 100).toFixed(0)}%  金額の目安 約${Math.round((cap[cap.length >> 1] || 0) / 1e4)}万円`)
  }
}
