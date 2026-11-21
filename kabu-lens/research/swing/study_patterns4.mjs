// 形の検証の4回目（2026-11-20。先に一覧を決めてから回す）。J-Quants の2年（1年目〜2025-08-27／2年目）で見る
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_patterns4.mjs
// 1) 決算の前：発表の5営業日前の引けで買い、前の日の引けで売る（TOPIX との差）
// 2) 決算前の20日の動きと、発表のあとの反応（窓・寄りから5日）
// 3) 前の決算で通期の営業利益の予想を上げた株の、次の決算の反応
// 4) 配当の権利：3月・9月末の権利付き最終日（月末の2営業日前）の10営業日前の引けで買い、最終日の引けで売る（配当は含めない＝値動きだけ）。
//    予想配当利回り（FDivAnn ÷ 株価）3.5% 以上と、それ以外で分ける
// TOPIX 連動ETF との差から往復 0.2% を引く
import { readFileSync } from 'node:fs'

const R = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8'))
const COST = 0.2
const Y2 = '2025-08-28'
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
const f = v => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) : '  —  ')
const benchRaw = R('./bench1306.json')
const bench = []
for (const b of benchRaw) {
  const p = bench[bench.length - 1]
  if (p && (b.c / p.c > 1.3 || b.c / p.c < 0.7)) continue
  bench.push(b)
}
const bi = new Map(bench.map((b, i) => [b.date, i]))
const bCC = (d0, d1) => (bi.has(d0) && bi.has(d1) ? (bench[bi.get(d1)].c / bench[bi.get(d0)].c - 1) * 100 : null)
const bOC = (d0, d1) => (bi.has(d0) && bi.has(d1) ? (bench[bi.get(d1)].c / bench[bi.get(d0)].o - 1) * 100 : null)
const bGap = (d0, d1) => (bi.has(d0) && bi.has(d1) ? (bench[bi.get(d1)].o / bench[bi.get(d0)].c - 1) * 100 : null)
const wide = R('../wide.json')
const px = {}
for (const [code, w] of Object.entries(wide)) {
  const B = (w?.d || []).map(([date, o, h, l, c, v]) => ({ date, o, h, l, c, v })).filter(b => b.o > 0 && b.c > 0)
  const t20 = new Float64Array(B.length)
  let st = 0
  for (let i = 0; i < B.length; i++) {
    st += B[i].c * B[i].v
    if (i >= 20) st -= B[i - 20].c * B[i - 20].v
    t20[i] = st / Math.min(20, i + 1)
  }
  px[code] = { B, t20, idx: new Map(B.map((b, i) => [b.date, i])) }
}
function baseIdx(p, d) {
  let lo = 0
  let hi = p.B.length - 1
  let a = -1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (p.B[m].date <= d) {
      a = m
      lo = m + 1
    } else hi = m - 1
  }
  return a
}
const fins = R('../jq_fins.json')
const all = []
for (const list of Object.values(fins)) all.push(...list)
all.sort((a, b) => (a.DiscDate + a.DiscTime).localeCompare(b.DiscDate + b.DiscTime))
const G = { run: [], fell: [], rose: [], flat: [], afterUp: [], afterDown: [], afterFlat: [] }
const lastRev = {}
const lastF = {}
for (const r of all) {
  if (!/FinancialStatements/.test(r.DocType)) {
    // 修正の開示も「前の決算で予想を上げたか」に数える
  }
  const c = r.Code.slice(0, 4)
  const p = px[c]
  const fop = r.FOP === '' ? null : Number(r.FOP)
  const k = c + '|' + r.CurFYSt
  const prevF = lastF[k]
  if (fop !== null) lastF[k] = fop
  if (r.CurPerType === 'FY' && r.NxFOP && r.NxtFYSt) lastF[c + '|' + r.NxtFYSt] = Number(r.NxFOP)
  const rev = fop !== null && prevF ? (fop / prevF - 1) * 100 * Math.sign(prevF) : null
  if (!p || !/FinancialStatements/.test(r.DocType)) {
    if (rev !== null) lastRev[c] = rev
    continue
  }
  // 発表の時刻で、反応の日を決める（15:00 より前は場中の発表なので、その日の引けまでに一部が出る。ここでは翌営業日を反応の日とする）
  const bi0 = baseIdx(p, r.DiscDate)
  if (bi0 < 25 || bi0 + 6 >= p.B.length || p.t20[bi0] < 1e8) {
    if (rev !== null) lastRev[c] = rev
    continue
  }
  const B = p.B
  const pre = r.DiscTime && r.DiscTime < '15:00' ? bi0 - 1 : bi0 // 発表前の最後の引け
  const e = bi0 + 1
  const d = r.DiscDate
  // 1) 決算の前（5営業日前の引け → 前の日の引け）
  const b0 = pre - 5
  const b1 = pre - 1 >= b0 ? pre : pre
  const tRun = bCC(B[b0].date, B[b1].date)
  if (tRun !== null) G.run.push({ date: d, v: (B[b1].c / B[b0].c - 1) * 100 - tRun })
  // 2) 決算前の20日の動きと、反応（窓・寄りから5日）
  const r20 = (B[pre].c / B[pre - 20].c - 1) * 100 - (bCC(B[pre - 20].date, B[pre].date) ?? 0)
  const gapEx = (B[e].o / B[pre].c - 1) * 100 - (bGap(B[pre].date, B[e].date) ?? 0)
  const d5 = (B[e + 4].c / B[e].o - 1) * 100 - (bOC(B[e].date, B[e + 4].date) ?? 0)
  const row = { date: d, gap: gapEx, v: d5 }
  if (r20 <= -10) G.fell.push(row)
  else if (r20 >= 15) G.rose.push(row)
  else if (Math.abs(r20) < 5) G.flat.push(row)
  // 3) 前の決算で予想を上げた株の、次の決算
  const lr = lastRev[c]
  if (lr !== undefined) {
    if (lr >= 5) G.afterUp.push(row)
    else if (lr <= -5) G.afterDown.push(row)
    else G.afterFlat.push(row)
  }
  if (rev !== null) lastRev[c] = rev
}
function judge(name, rows, key = 'v') {
  const z = rows.filter(r => Number.isFinite(r[key]))
  const s1 = z.filter(r => r.date < Y2).map(r => r[key])
  const s2 = z.filter(r => r.date >= Y2).map(r => r[key])
  const cost = key === 'gap' ? 0 : COST
  const m1 = mean(s1) - cost
  const m2 = mean(s2) - cost
  const v = s1.length >= 30 && s2.length >= 30 ? (m1 > 0 && m2 > 0 ? '◎ 両年プラス' : mean(s1) < 0 && mean(s2) < 0 ? '× 両年マイナス' : '△ ばらつく') : '件数が少ない'
  console.log(`  ${name.padEnd(46)} ${String(z.length).padStart(6)}件  1年目${f(m1)}（${s1.length}）  2年目${f(m2)}（${s2.length}）  ${v}`)
}
console.log('■ 決算の前（5営業日前の引けで買い、発表前の最後の引けで売る。TOPIX との差・0.2% を引く）')
judge('全部', G.run)
console.log('\n■ 決算前の20日の動き × 反応（窓はそのままの TOPIX との差、5日は寄りから・0.2% を引く）')
for (const [n, k] of [['決算前20日で −10% 以下（下げてから決算）', 'fell'], ['決算前20日で ±5% 以内', 'flat'], ['決算前20日で +15% 以上（期待で上げてから決算）', 'rose']]) {
  judge(n + '：窓', G[k], 'gap')
  judge(n + '：寄りから5日', G[k])
}
console.log('\n■ 前の決算（または修正）で通期の営業利益の予想を…')
for (const [n, k] of [['上げていた（+5%以上）', 'afterUp'], ['ほぼ据え置き', 'afterFlat'], ['下げていた（−5%以下）', 'afterDown']]) {
  judge(n + '：次の決算の窓', G[k], 'gap')
  judge(n + '：次の決算の寄りから5日', G[k])
}

// 4) 配当の権利（3月・9月）
console.log('\n■ 配当の権利付き最終日の前（10営業日前の引けで買い、最終日の引けで売る。値動きだけ・TOPIX との差・0.2% を引く）')
const lastDiv = {}
for (const r of all) {
  const c = r.Code.slice(0, 4)
  const dv = r.FDivAnn === '' || r.FDivAnn == null ? null : Number(r.FDivAnn)
  if (dv !== null) (lastDiv[c] ||= []).push({ date: r.DiscDate, dv })
}
const dates = bench.map(b => b.date)
const months = ['2024-09', '2025-03', '2025-09', '2026-03', '2026-09']
const hi = []
const lo = []
for (const m of months) {
  const inM = dates.filter(d => d.startsWith(m))
  if (inM.length < 3) continue
  const kenri = inM[inM.length - 3] // 月末の2営業日前
  const k0 = dates[dates.indexOf(kenri) - 10]
  const tb = bCC(k0, kenri)
  for (const [c, p] of Object.entries(px)) {
    const i1 = p.idx.get(kenri)
    const i0 = p.idx.get(k0)
    if (i1 === undefined || i0 === undefined || p.t20[i0] < 1e8 || tb === null) continue
    const dv = (lastDiv[c] || []).filter(x => x.date <= k0).pop()
    if (!dv) continue
    const y = dv.dv / p.B[i0].c * 100
    const row = { date: kenri, v: (p.B[i1].c / p.B[i0].c - 1) * 100 - tb }
    if (y >= 3.5) hi.push(row)
    else lo.push(row)
  }
}
judge('予想配当利回り 3.5% 以上', hi)
judge('それ以外', lo)
