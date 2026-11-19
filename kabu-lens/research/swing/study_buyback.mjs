// 自社株買いの発表のあと、株価は上がり続けるか（約1,400銘柄・2013年〜）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_buyback.mjs   （先に fetch_irevents.mjs）
// ・発表：表題に「自己株式」と「取得」があり、「決定」か「事項」を含むもの（取得状況・結果・終了・完了の報告は除く）
// ・反応日：15:00以降の発表は翌営業日、場中は当日。反応＝反応日の始値 ÷ 発表前の終値（窓）
// ・買い方A：反応日の始値（発表の翌朝の寄り）。買い方B：反応日の終値（その日の大引け）。1日じゅう値幅の無い日は買えない
// ・比べ方：同じ日に全銘柄を同じ形（始値か終値）で買った平均との差（超過）。5・20・60営業日後の終値
// ・売買代金（20日平均）1億円以上。決算と同じ日の発表は分けて見る（決算の影響が混ざるため）
import { readFileSync } from 'node:fs'
const wide = JSON.parse(readFileSync(new URL('../wide.json', import.meta.url), 'utf-8'))
const irev = JSON.parse(readFileSync(new URL('../irevents.json', import.meta.url), 'utf-8'))
const irh = (() => { try { return JSON.parse(readFileSync(new URL('../irhist.json', import.meta.url), 'utf-8')) } catch { return {} } })()
const H = [5, 20, 60]
const S = {}
for (const [code, w] of Object.entries(wide)) {
  const d = (w?.d || []).filter(x => x[1] > 0 && x[4] > 0)
  if (d.length < 100) continue
  const idx = new Map(d.map((x, i) => [x[0], i]))
  const turn = new Float64Array(d.length)
  let s = 0
  for (let i = 0; i < d.length; i++) { s += d[i][4] * d[i][5]; if (i >= 20) s -= d[i - 20][4] * d[i - 20][5]; turn[i] = s / Math.min(20, i + 1) }
  S[code] = { d, idx, turn }
}
// 基準：その日に全銘柄を始値・終値で買った平均
const base = { o: new Map(), c: new Map() }
for (const { d, turn } of Object.values(S)) {
  for (let i = 1; i < d.length; i++) {
    if (turn[i - 1] < 1e8) continue
    for (const [k, px] of [['o', d[i][1]], ['c', d[i][4]]]) {
      const b = base[k].get(d[i][0]) || Object.fromEntries(H.flatMap(h => [['n' + h, 0], ['s' + h, 0]]))
      for (const h of H) { const j = k === 'o' ? i + h - 1 : i + h; if (j < d.length) { b['n' + h]++; b['s' + h] += (d[j][4] / px - 1) * 100 } }
      base[k].set(d[i][0], b)
    }
  }
}
const isBuyback = t => /自己株式/.test(t) && /取得/.test(t) && /(決定|事項)/.test(t) && !/(取得状況|結果|終了|完了|消却のみ)/.test(t)
const kessanDays = code => new Set((irh[code] || []).map(r => r.date))
const ev = []
for (const [code, list] of Object.entries(irev)) {
  const st = S[code]; if (!st || !Array.isArray(list)) continue
  const kd = kessanDays(code)
  const seen = new Set()
  for (const r of list) {
    if (!isBuyback(r.title)) continue
    const i0 = st.idx.get(r.date)
    if (i0 === undefined) continue
    const after = r.time >= '15:00'
    const rd = after ? i0 + 1 : i0, pre = after ? i0 : i0 - 1
    if (rd >= st.d.length || pre < 20 || seen.has(rd)) continue
    seen.add(rd)
    if (st.turn[pre] < 1e8) continue
    const D = st.d
    const stuck = D[rd][2] === D[rd][3]
    const gap = (D[rd][1] / D[pre][4] - 1) * 100
    const day = (D[rd][4] / D[pre][4] - 1) * 100
    const rec = { code, date: D[rd][0], gap, day, stuck, withKessan: kd.has(r.date) || /決算/.test(r.title), tostnet: /ToSTNeT|立会外/.test(r.title) }
    for (const [k, px, off] of [['o', D[rd][1], -1], ['c', D[rd][4], 0]]) {
      const b = base[k].get(D[rd][0])
      for (const h of H) {
        const j = rd + h + off
        if (j < D.length && b && b['n' + h]) { rec[k + h] = (D[j][4] / px - 1) * 100; rec['x' + k + h] = rec[k + h] - b['s' + h] / b['n' + h] }
      }
    }
    ev.push(rec)
  }
}
const f = v => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) : '  —  ')
const avg = (xs, k) => { const z = xs.filter(x => Number.isFinite(x[k])); return z.length ? z.reduce((s, x) => s + x[k], 0) / z.length : NaN }
const dates = [...new Set(ev.map(e => e.date))].sort(), mid = dates[Math.floor(dates.length / 2)]
function line(name, xs) {
  const A = xs.filter(e => e.date < mid), B = xs.filter(e => e.date >= mid)
  const yrs = [...new Set(xs.map(e => e.date.slice(0, 4)))].sort()
  const by = yrs.map(y => avg(xs.filter(e => e.date.startsWith(y)), 'xo20'))
  console.log(name.padEnd(28), `n=${String(xs.length).padStart(5)}`,
    `| 寄りで買う 超過5日${f(avg(xs, 'xo5'))} 20日${f(avg(xs, 'xo20'))}（前${f(avg(A, 'xo20'))}/後${f(avg(B, 'xo20'))}） 60日${f(avg(xs, 'xo60'))}`,
    `| 大引けで買う 20日${f(avg(xs, 'xc20'))} 60日${f(avg(xs, 'xc60'))}`,
    `| 20日がプラスの年 ${by.filter(v => v > 0).length}/${by.length}`)
}
console.log(`自社株買いの発表 ${ev.length}回（${dates[0]}〜${dates[dates.length - 1]}、前半/後半の境 ${mid}）`)
const ok = ev.filter(e => !e.stuck)
line('全部（張り付き除く）', ok)
line('  決算と別の日', ok.filter(e => !e.withKessan))
line('  決算と同じ日', ok.filter(e => e.withKessan))
line('  ToSTNeT（立会外）', ok.filter(e => e.tostnet))
console.log('\n-- 翌朝の窓（寄り ÷ 発表前の終値）ごと（決算と別の日）')
for (const [lo, hi] of [[-100, 0], [0, 2], [2, 5], [5, 10], [10, 100]]) line(`窓 ${lo}〜${hi}%`, ok.filter(e => !e.withKessan && e.gap >= lo && e.gap < hi))
console.log('\n-- 年ごと（決算と別の日・寄りで買う・超過20日）')
const yrs = [...new Set(ok.map(e => e.date.slice(0, 4)))].sort()
console.log(yrs.map(y => { const z = ok.filter(e => !e.withKessan && e.date.startsWith(y)); return `${y}:${f(avg(z, 'xo20'))}(${z.length})` }).join(' '))

// ---- 追加：1日目の寄り→大引け、損切りつきで持った場合（R）、どの日に買っても（比べる相手） ----
const atrOf = (D, i) => { let s = 0; for (let k = i - 13; k <= i; k++) s += Math.max(D[k][2] - D[k][3], Math.abs(D[k][2] - D[k - 1][4]), Math.abs(D[k][3] - D[k - 1][4])); return s / 14 }
function runR(D, e, stop, T, maxBars) {
  const entry = D[e][1], risk = entry - stop
  for (let k = e; k < D.length; k++) {
    const [, o, h, l, c] = D[k], n = k - e + 1
    if (o <= stop) return (o * 0.999 - entry) / risk
    if (l <= stop) return (stop * 0.999 - entry) / risk
    if (T && h >= entry + T * risk) return (Math.max(entry + T * risk, o) - entry) / risk
    if (n >= maxBars) return (c * 0.999 - entry) / risk
  }
  return null
}
const rows = []
for (const e of ok.filter(x => !x.withKessan)) {
  const st = S[e.code], rd = st.idx.get(e.date), D = st.d
  if (rd < 15) continue
  const stop = D[rd - 1][4] - 2 * atrOf(D, rd - 1)
  const day1 = (D[rd][4] / D[rd][1] - 1) * 100
  rows.push({ date: e.date, day1, r20: runR(D, rd, stop, 0, 20), r4: runR(D, rd, stop, 4, 40), r5: runR(D, rd, stop, 0, 5) })
}
const anyR = []
for (const { d: D, turn } of Object.values(S)) for (let i = 30; i < D.length - 1; i += 7) { if (turn[i - 1] < 1e8) continue; const stop = D[i - 1][4] - 2 * atrOf(D, i - 1); anyR.push({ day1: (D[i][4] / D[i][1] - 1) * 100, r20: runR(D, i, stop, 0, 20), r4: runR(D, i, stop, 4, 40), r5: runR(D, i, stop, 0, 5) }) }
const mm = (xs, k) => { const z = xs.filter(x => x[k] !== null && Number.isFinite(x[k])); return z.reduce((s, x) => s + x[k], 0) / z.length }
console.log('\n-- 決算と別の日の発表・翌朝の寄りで買い、損切り＝前日終値−ATR×2')
console.log(`自社株買い n=${rows.length}  1日目（寄り→大引け）${f(mm(rows, 'day1'))}%  5日で手じまい ${f(mm(rows, 'r5'))}R  20日で手じまい ${f(mm(rows, 'r20'))}R  目標4R・40日 ${f(mm(rows, 'r4'))}R`)
console.log(`どの日でも n=${anyR.length}  1日目${f(mm(anyR, 'day1'))}%  5日 ${f(mm(anyR, 'r5'))}R  20日 ${f(mm(anyR, 'r20'))}R  目標4R・40日 ${f(mm(anyR, 'r4'))}R`)
const half = rows.filter(r => r.date < mid), half2 = rows.filter(r => r.date >= mid)
console.log(`  前半 20日 ${f(mm(half, 'r20'))}R 4R ${f(mm(half, 'r4'))}R ／ 後半 20日 ${f(mm(half2, 'r20'))}R 4R ${f(mm(half2, 'r4'))}R`)

// ---- 追加2：1日目（寄りで買って大引けで売る）を年ごと・窓ごと・同じ日の件数 ----
const d1 = rows.map(r => r.day1).sort((a, b) => a - b)
console.log(`\n-- 1日目（寄り→大引け）中央${f(d1[Math.floor(d1.length / 2)])}% 勝率${Math.round(d1.filter(x => x > 0).length / d1.length * 100)}% 下位10%${f(d1[Math.floor(d1.length * 0.1)])}% 上位10%${f(d1[Math.floor(d1.length * 0.9)])}%`)
const yrs1 = [...new Set(rows.map(r => r.date.slice(0, 4)))].sort()
console.log(yrs1.map(y => { const z = rows.filter(r => r.date.startsWith(y)); return `${y}:${f(mm(z, 'day1'))}(${z.length})` }).join(' '))
const byGap = [[-100, 0], [0, 2], [2, 5], [5, 100]].map(([lo, hi]) => { const z = ok.filter(e => !e.withKessan && e.gap >= lo && e.gap < hi).map(e => { const st = S[e.code], i = st.idx.get(e.date); return (st.d[i][4] / st.d[i][1] - 1) * 100 }); return `窓${lo}〜${hi}%:${f(z.reduce((s, x) => s + x, 0) / z.length)}(${z.length})` })
console.log(byGap.join(' '))
const perDay = {}
for (const r of rows) perDay[r.date] = (perDay[r.date] || 0) + 1
const pd = Object.values(perDay)
console.log(`発表のあった日 ${pd.length}日（10年）、1日あたり平均${(rows.length / pd.length).toFixed(2)}件、最大${Math.max(...pd)}件。直近1年 ${rows.filter(r => r.date >= '2025-11-14').length}件`)
