// 「強い株を少数持ち続ける」形（モメンタム）で、お金がどれだけ増えるかを3年分で見る
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_momentum_port.mjs
// ・日足は 1時間足（research/day/hour.json）から作る。今の売買の多い約1,100銘柄なので、生き残りの偏りがある（成績は甘めに出る）
// ・毎週（5営業日ごと）、売買代金1億円以上・25日線の上で25日線が上向きの株を、過去N日の値上がり率で並べ、上位K銘柄を同じ金額ずつ持つ
// ・持っている株は、順位が上位B位から落ちるか、終値の高値−ATR×3 を割ったら売る（翌日の始値。0.1%不利）。空いた枠は次の週に埋める
// ・比べる相手：全銘柄を同じ金額ずつ持ちっぱなし（市場全体）
import { readFileSync } from 'node:fs'
import { atr } from '../../../.claude/scripts/kabu-lens.mjs'
const hour = JSON.parse(readFileSync(new URL('../day/hour.json', import.meta.url), 'utf-8'))
const S = {}
for (const [code, days] of Object.entries(hour)) {
  if (!days) continue
  const ds = Object.keys(days).sort()
  const bars = ds.map(d => { const b = days[d]; return { date: d, o: b[0][1], h: Math.max(...b.map(x => x[2])), l: Math.min(...b.map(x => x[3])), c: b[b.length - 1][4], v: b.reduce((s, x) => s + x[5], 0) } })
  if (bars.length < 120) continue
  const idx = Object.fromEntries(bars.map((b, i) => [b.date, i]))
  S[code] = { bars, idx, a: atr(bars, 14) }
}
const dates = [...new Set(Object.values(S).flatMap(s => s.bars.map(b => b.date)))].sort()
function sim({ N = 60, K = 3, B = 10, trail = 3, start = 70, cost = 0.001 } = {}) {
  let cash = 1, pos = {} // code -> {sh, hiC, entry}
  const eq = []
  for (let di = start; di < dates.length - 1; di++) {
    const d = dates[di], nd = dates[di + 1]
    const px = (c, dd, k = 'c') => { const s = S[c]; const i = s.idx[dd]; return i === undefined ? null : s.bars[i][k] }
    // 評価
    let val = cash
    for (const [c, p] of Object.entries(pos)) val += p.sh * (px(c, d) ?? p.last)
    eq.push({ d, val })
    // 損切り（終値の高値−ATR×3）→ 翌日の始値
    for (const [c, p] of Object.entries(pos)) {
      const s = S[c], i = s.idx[d]; if (i === undefined) continue
      p.last = s.bars[i].c; p.hiC = Math.max(p.hiC, s.bars[i].c)
      if (s.bars[i].c < p.hiC - trail * (s.a[i] || 0)) p.exit = true
    }
    const weekly = (di - start) % 5 === 0
    let rank = []
    if (weekly) {
      for (const [c, s] of Object.entries(S)) {
        const i = s.idx[d]; if (i === undefined || i < Math.max(N, 30)) continue
        const b = s.bars
        const turn = b.slice(i - 19, i + 1).reduce((x, y) => x + y.c * y.v, 0) / 20
        if (turn < 1e8) continue
        const ma = k => b.slice(k - 24, k + 1).reduce((x, y) => x + y.c, 0) / 25
        if (!(b[i].c > ma(i) && ma(i) > ma(i - 5))) continue
        rank.push([c, b[i].c / b[i - N].c - 1])
      }
      rank.sort((x, y) => y[1] - x[1])
      const top = new Set(rank.slice(0, B).map(x => x[0]))
      for (const c of Object.keys(pos)) if (!top.has(c)) pos[c].exit = true
    }
    // 翌日の始値で売買
    for (const [c, p] of Object.entries(pos)) if (p.exit) { const o = px(c, nd, 'o'); if (o) { cash += p.sh * o * (1 - cost); delete pos[c] } }
    if (weekly) {
      const free = K - Object.keys(pos).length
      let val2 = cash; for (const [c, p] of Object.entries(pos)) val2 += p.sh * (px(c, d) ?? p.last)
      const per = val2 / K
      for (const [c] of rank.slice(0, K * 3)) {
        if (Object.keys(pos).length >= K) break
        if (pos[c]) continue
        const o = px(c, nd, 'o'); if (!o) continue
        const amt = Math.min(per, cash); if (amt < per * 0.5) break
        pos[c] = { sh: amt / (o * (1 + cost)), hiC: o, last: o }
        cash -= amt
      }
      void free
    }
  }
  return eq
}
function stats(name, eq) {
  const v0 = eq[0].val, v1 = eq[eq.length - 1].val
  const years = eq.length / 245
  let peak = 0, dd = 0
  for (const x of eq) { peak = Math.max(peak, x.val); dd = Math.min(dd, x.val / peak - 1) }
  const months = {}
  for (const x of eq) months[x.d.slice(0, 7)] = x.val
  const mk = Object.keys(months).sort(); const mr = []
  for (let i = 1; i < mk.length; i++) mr.push(months[mk[i]] / months[mk[i - 1]] - 1)
  const yr = {}
  for (const x of eq) { const y = x.d.slice(0, 4); (yr[y] ||= [x.val, x.val])[1] = x.val }
  const med = [...mr].sort((a, b) => a - b)[Math.floor(mr.length / 2)]
  console.log(name.padEnd(36), `全体${((v1 / v0 - 1) * 100).toFixed(0).padStart(5)}% 年率${((Math.pow(v1 / v0, 1 / years) - 1) * 100).toFixed(0).padStart(4)}% 最大の下げ${(dd * 100).toFixed(0).padStart(4)}%`,
    `月平均${(mr.reduce((a, b) => a + b, 0) / mr.length * 100).toFixed(1).padStart(5)}% 中央${(med * 100).toFixed(1)}% マイナスの月${Math.round(mr.filter(x => x < 0).length / mr.length * 100)}%`,
    '|', Object.entries(yr).map(([y, [a, b]]) => `${y.slice(2)}年${((b / a - 1) * 100).toFixed(0)}%`).join(' '))
}
// 市場全体（全銘柄を同じ金額ずつ・日々の平均の騰落を積み上げ）
const mkt = []
let mv = 1
for (let di = 70; di < dates.length - 1; di++) {
  const d = dates[di], pd = dates[di - 1]; let s = 0, n = 0
  for (const st of Object.values(S)) { const i = st.idx[d], j = st.idx[pd]; if (i !== undefined && j !== undefined) { s += st.bars[i].c / st.bars[j].c - 1; n++ } }
  mv *= 1 + (n ? s / n : 0); mkt.push({ d, val: mv })
}
console.log(`期間 ${dates[70]}〜${dates[dates.length - 1]}`)
stats('市場全体（全銘柄を同じ金額ずつ）', mkt)
for (const N of [20, 60, 120]) for (const K of [3, 5]) stats(`上位${K}・過去${N}日・週ごと`, sim({ N, K }))
stats('上位3・過去60日・損切りATR×2', sim({ N: 60, K: 3, trail: 2 }))
stats('上位3・過去60日・損切りなし', sim({ N: 60, K: 3, trail: 99 }))
