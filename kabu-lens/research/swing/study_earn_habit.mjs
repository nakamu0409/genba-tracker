// 本人の希望（11/25）：銘柄ごとのパターン②決算への反応のクセ（先に比べ方を決める）
// irhist.json（IR BANK、約700銘柄・2013年ごろから）の決算短信（1Q・2Q・3Q・通期）ごとに、発表日の前の日の引け → 発表日の次の営業日の引け（場中の発表も引け後の発表も含む2日）の全体との差%。
// 銘柄ごとに、その日より前の反応が4回以上あるとき：平均がプラス／マイナス、直近4回のうち3回以上プラス／3回以上マイナス、で分けて、その回の反応を比べる。
// 期間：前半（〜2021-11-18）／後半（〜2025-11-13）／直近
// 結果（11/25。前半／後半／直近、全体との差）：全部 +0.16／+0.08／+0.31%。前の反応の平均がプラス +0.21／+0.24／+0.34%、マイナス −0.03／−0.05／+0.26%（プラスの組が3つの期間とも上。差は0.1〜0.3%）。
//   直近4回で3回以上プラス −0.01／+0.17／+0.36%、3回以上マイナス +0.10／−0.01／+0.13%（そろわない）。
//   → 小さなクセはあるが、決算の2日の値動きは1回で±7%ほどぶれるので、差0.2%では売買に使えない。マイナスの組も平均はほぼ0なので「クセが悪い株は決算前に売る」も得にならない（採らない）
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
const BB = '2025-11-14', per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const H = JSON.parse(readFileSync(new URL('../irhist.json', import.meta.url), 'utf-8'))
const { stocks, bench } = loadAll({ withSwing: false, withSmall: true })
const bi = new Map(bench.map((b, i) => [b.date, i]))
const G = {}
const push = (k, p, v) => ((G[k] ||= [[], [], []])[p].push(v))
for (const [code, list] of Object.entries(H)) {
  const st = stocks[code]; if (!st) continue
  const B = st.bars
  const idx = new Map(B.map((b, i) => [b.date, i]))
  const ev = (list || []).filter(r => ['1Q', '2Q', '3Q', '通期'].includes(r.kind)).sort((a, b) => (a.date < b.date ? -1 : 1))
  const past = []
  for (const r of ev) {
    let i = idx.get(r.date)
    if (i === undefined) { i = B.findIndex(b => b.date > r.date); if (i < 0) continue; i-- } // 休みの日の発表は次の営業日の前の日を基準
    if (i < 1 || i + 1 >= B.length) continue
    const a = B[i - 1], b = B[i + 1]
    const ka = bi.get(a.date), kb = bi.get(b.date); if (ka === undefined || kb === undefined) continue
    const ex = (b.c / a.c - 1) * 100 - (bench[kb].c / bench[ka].c - 1) * 100
    const p = per(r.date)
    push('全部', p, ex)
    if (past.length >= 4) {
      const m = mean(past), l4 = past.slice(-4), up = l4.filter(x => x > 0).length
      push(m > 0 ? '前の反応の平均がプラス' : '前の反応の平均がマイナス', p, ex)
      if (up >= 3) push('直近4回で3回以上プラス', p, ex)
      if (up <= 1) push('直近4回で3回以上マイナス', p, ex)
    }
    past.push(ex)
  }
}
console.log('決算の前の日の引け→次の営業日の引け（全体との差%）前半／後半／直近')
for (const [k, a] of Object.entries(G)) console.log(`  ${k.padEnd(16)} ` + a.map(x => `${fmt(mean(x))}%(${x.length})`).join(' ／ '))
