// 企業の行動の開示（株式分割・増配・株主優待の新設や拡充・自社株買い）のあと、翌日の寄り→引けと、数日〜数週間の超過を比べる
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_events.mjs
// ・15:00以降の発表だけ。決算と同じ日は除く。売買代金1億円以上。翌日に張り付いた日は除く
// ・寄指（翌日の寄りが前日の終値×1.02以下）で買える日と、全部の両方を見る。超過＝同じ日に全銘柄を寄りで買った平均との差
import { readFileSync } from 'node:fs'
const wide = JSON.parse(readFileSync(new URL('../wide.json', import.meta.url), 'utf-8'))
const irev = JSON.parse(readFileSync(new URL('../irevents.json', import.meta.url), 'utf-8'))
const irh = JSON.parse(readFileSync(new URL('../irhist.json', import.meta.url), 'utf-8'))
const KINDS = {
  自社株買い: t => /自己株式/.test(t) && /取得/.test(t) && /(決定|事項)/.test(t) && !/(取得状況|結果|終了|完了|経過|ToSTNeT|立会外)/.test(t),
  株式分割: t => /株式分割/.test(t) && !/(結果|延期|中止)/.test(t),
  '増配（表題に増配）': t => /増配/.test(t) && !/(減配|無配|下方)/.test(t),
  '配当予想の修正（向き不明）': t => !/増配/.test(t) && /配当予想の修正/.test(t) && !/(減配|無配|下方)/.test(t),
  優待の新設や拡充: t => /株主優待/.test(t) && /(新設|導入|拡充|充実|変更)/.test(t) && !/(廃止|中止|縮小)/.test(t),
  優待の廃止: t => /株主優待/.test(t) && /(廃止|中止)/.test(t)
}
const H = [5, 20]
const S = {}
for (const [code, w] of Object.entries(wide)) {
  const d = (w?.d || []).filter(x => x[1] > 0 && x[4] > 0); if (d.length < 100) continue
  const turn = new Float64Array(d.length); let s = 0
  for (let i = 0; i < d.length; i++) { s += d[i][4] * d[i][5]; if (i >= 20) s -= d[i - 20][4] * d[i - 20][5]; turn[i] = s / Math.min(20, i + 1) }
  S[code] = { d, idx: new Map(d.map((x, i) => [x[0], i])), turn }
}
const base = new Map()
for (const { d, turn } of Object.values(S)) for (let i = 1; i < d.length; i++) {
  if (turn[i - 1] < 1e8) continue
  const b = base.get(d[i][0]) || { n: 0, d1: 0, n5: 0, s5: 0, n20: 0, s20: 0 }
  b.n++; b.d1 += (d[i][4] / d[i][1] - 1) * 100
  for (const h of H) if (i + h - 1 < d.length) { b['n' + h]++; b['s' + h] += (d[i + h - 1][4] / d[i][1] - 1) * 100 }
  base.set(d[i][0], b)
}
const res = Object.fromEntries(Object.keys(KINDS).map(k => [k, []]))
for (const [code, list] of Object.entries(irev)) {
  const st = S[code]; if (!st || !Array.isArray(list)) continue
  const kd = new Set((irh[code] || []).map(r => r.date))
  const seen = new Set()
  for (const r of list) {
    if (r.time < '15:00') continue
    const kind = Object.keys(KINDS).find(k => KINDS[k](r.title)); if (!kind) continue
    if (kd.has(r.date) || list.some(x => x.date === r.date && /決算/.test(x.title))) continue
    const i0 = st.idx.get(r.date); if (i0 === undefined || i0 < 20 || i0 + 1 >= st.d.length) continue
    const key = kind + i0; if (seen.has(key)) continue; seen.add(key)
    if (st.turn[i0] < 1e8) continue
    const D = st.d, rd = i0 + 1
    if (D[rd][2] === D[rd][3]) continue
    const b = base.get(D[rd][0]); if (!b) continue
    const e = { date: D[rd][0], gap: (D[rd][1] / D[i0][4] - 1) * 100, d1: (D[rd][4] / D[rd][1] - 1) * 100 - b.d1 / b.n }
    for (const h of H) if (rd + h - 1 < D.length && b['n' + h]) e['x' + h] = (D[rd + h - 1][4] / D[rd][1] - 1) * 100 - b['s' + h] / b['n' + h]
    res[kind].push(e)
  }
}
const f = v => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) : '  —  ')
const avg = (xs, k) => { const z = xs.filter(x => Number.isFinite(x[k])); return z.length ? z.reduce((s, x) => s + x[k], 0) / z.length : NaN }
for (const [k, all] of Object.entries(res)) {
  const dates = [...new Set(all.map(e => e.date))].sort(), mid = dates[Math.floor(dates.length / 2)]
  for (const [name, xs] of [['全部', all], ['寄指で買える日', all.filter(e => e.gap <= 2)]]) {
    const A = xs.filter(e => e.date < mid), B = xs.filter(e => e.date >= mid)
    const yrs = [...new Set(xs.map(e => e.date.slice(0, 4)))].sort()
    const py = yrs.filter(y => avg(xs.filter(e => e.date.startsWith(y)), 'd1') > 0).length
    const x20A = avg(A, 'x20'), x20B = avg(B, 'x20')
    console.log(`${k}・${name}`.padEnd(22), `[20日 前${f(x20A)}/後${f(x20B)}]`, `n=${String(xs.length).padStart(5)}  1日目（全体比）${f(avg(xs, 'd1'))}%（前${f(avg(A, 'd1'))}/後${f(avg(B, 'd1'))}） 勝${Math.round(xs.filter(e => e.d1 > 0).length / Math.max(1, xs.length) * 100)}%  プラスの年${py}/${yrs.length}  超過5日${f(avg(xs, 'x5'))} 20日${f(avg(xs, 'x20'))}`)
  }
}
