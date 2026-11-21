// 形の検証の2回目（2026-11-20 本人と決めた進め方。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_patterns2.mjs
// 1) カレンダー（TOPIX 連動ETF）：3連休以上の前日・明け、SQ の日（第2金曜）、年末の最後の5日・年始の最初の5日
// 2) 急落（5日で −15% 以下）の反発を条件で分ける：米国の下げ相場か、TOPIX も下げたか、株価の高さ、損切り −8% を入れた場合
// 3) 会社の中身（J-Quants の財務のまとめ・2年）：PBR・自己資本比率・ROE と、開示のあと20日（1年目・2年目で同じ向きか）
// 期間・判定は study_patterns.mjs と同じ（選ぶ〜2021-11-18・確かめる〜2025-11-13・最後の確認、往復 0.2% を引く）
import { readFileSync } from 'node:fs'

const R = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8'))
const A = '2021-11-19'
const BB = '2025-11-14'
const COST = 0.2
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
const f = v => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) : '  —  ')
function judge(name, rows, cost = COST, a = A, b = BB) {
  const s1 = rows.filter(r => r.date < a).map(r => r.v)
  const s2 = rows.filter(r => r.date >= a && r.date < b).map(r => r.v)
  const s3 = rows.filter(r => r.date >= b).map(r => r.v)
  const m1 = mean(s1) - cost
  const m2 = mean(s2) - cost
  const min = cost === 0 ? 20 : 100
  let v
  if (s1.length >= min && s2.length >= min) v = m1 > 0 && m2 > 0 ? '◎ 使える候補' : mean(s1) < 0 && mean(s2) < 0 ? '× 避ける合図' : '△ ばらつく'
  else v = '件数が少ない'
  console.log(`  ${name.padEnd(44)} ${String(rows.length).padStart(6)}件  選ぶ${f(m1)}（${s1.length}）  確かめる${f(m2)}（${s2.length}）  最後${f(mean(s3) - cost)}（${s3.length}）  ${v}`)
}
const benchRaw = R('./bench1306.json')
const bench = []
for (const b of benchRaw) {
  const p = bench[bench.length - 1]
  if (p && (b.c / p.c > 1.3 || b.c / p.c < 0.7)) continue
  bench.push(b)
}
const bi = new Map(bench.map((b, i) => [b.date, i]))
const day = d => new Date(d + 'T00:00:00Z')
const gapDays = (d0, d1) => Math.round((day(d1) - day(d0)) / 864e5)

// 1) カレンダー（TOPIX ETF。そのままの%。比べる相手は「全部の日」の平均）
console.log('■ カレンダー（TOPIX 連動ETF。手数料は引かない。数字はそのままの%）')
const cal = { preHolOC: [], holGap: [], postHolOC: [], sqOC: [], yearEnd: [], yearStart: [], allOC: [], allGap: [] }
for (let i = 1; i < bench.length - 1; i++) {
  const b = bench[i]
  const nx = bench[i + 1]
  const oc = (b.c / b.o - 1) * 100
  const gap = (b.o / bench[i - 1].c - 1) * 100
  cal.allOC.push({ date: b.date, v: oc })
  cal.allGap.push({ date: b.date, v: gap })
  if (gapDays(b.date, nx.date) >= 4) {
    cal.preHolOC.push({ date: b.date, v: oc })
    cal.holGap.push({ date: nx.date, v: (nx.o / b.c - 1) * 100 })
    cal.postHolOC.push({ date: nx.date, v: (nx.c / nx.o - 1) * 100 })
  }
  const dt = day(b.date)
  if (dt.getUTCDay() === 5 && dt.getUTCDate() >= 8 && dt.getUTCDate() <= 14) cal.sqOC.push({ date: b.date, v: oc })
  const md = b.date.slice(5)
  if (md >= '12-22') cal.yearEnd.push({ date: b.date, v: oc })
  if (md <= '01-10') cal.yearStart.push({ date: b.date, v: oc })
}
judge('全部の日の寄り→引け（比べる相手）', cal.allOC, 0)
judge('全部の日の窓（比べる相手）', cal.allGap, 0)
judge('3連休以上の前日の寄り→引け', cal.preHolOC, 0)
judge('3連休以上をまたぐ（前日の引け→明けの寄り）', cal.holGap, 0)
judge('3連休明けの寄り→引け', cal.postHolOC, 0)
judge('SQ の日（第2金曜）の寄り→引け', cal.sqOC, 0)
judge('年末（12/22〜）の寄り→引け', cal.yearEnd, 0)
judge('年始（〜1/10）の寄り→引け', cal.yearStart, 0)

// 2) 急落の反発を分ける
console.log('\n■ 急落（5日で −15% 以下）→ 翌日の寄りで買い5日目の引けで売る（TOPIX との差・0.2% を引く）')
function ser(f2) {
  const j = R('../world/' + f2 + '.json').chart.result[0]
  const q = j.indicators.quote[0]
  return j.timestamp.map((t, i) => ({ date: new Date((t - 5 * 3600) * 1000).toISOString().slice(0, 10), c: q.close[i] })).filter(x => x.c != null)
}
const spx = ser('GSPC')
const spxIdx = d => {
  let lo = 0
  let hi = spx.length - 1
  let a = -1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (spx[m].date < d) {
      a = m
      lo = m + 1
    } else hi = m - 1
  }
  return a
}
const spx20 = d => {
  const i = spxIdx(d)
  return i >= 20 ? (spx[i].c / spx[i - 20].c - 1) * 100 : null
}
const topix5 = d => {
  const i = bi.get(d)
  return i >= 5 ? (bench[i].c / bench[i - 5].c - 1) * 100 : null
}
const bOpenTo = (d0, d1) => (bi.has(d0) && bi.has(d1) ? (bench[bi.get(d1)].c / bench[bi.get(d0)].o - 1) * 100 : null)
const wide = R('../wide.json')
const C = { all: [], usBear: [], usOk: [], mktDown: [], alone: [], low: [], mid: [], high: [], stop8: [], twice: [], first: [] }
for (const w of Object.values(wide)) {
  const B = (w?.d || []).map(([date, o, h, l, c, v]) => ({ date, o, h, l, c, v })).filter(b => b.o > 0 && b.c > 0 && b.l > 0)
  if (B.length < 300) continue
  let st = 0
  let last = -99
  for (let i = 0; i < B.length - 6; i++) {
    st += B[i].c * B[i].v
    if (i >= 20) st -= B[i - 20].c * B[i - 20].v
    if (i < 260 || st / 20 < 1e8 || B[i].c < 100) continue
    if (!(B[i].c / B[i - 5].c <= 0.85)) continue
    const e = i + 1
    if (B[e].h === B[e].l) continue
    const bm = bOpenTo(B[e].date, B[e + 4].date)
    if (bm === null) continue
    const entry = B[e].o
    const r = { date: B[i].date, v: (B[e + 4].c / entry - 1) * 100 - bm }
    C.all.push(r)
    // 損切り −8%：5日の間に安値が届けばそこで売る
    let ex = B[e + 4].c
    for (let k = e; k <= e + 4; k++) {
      if (B[k].l <= entry * 0.92) {
        ex = Math.min(B[k].o, entry * 0.92)
        break
      }
    }
    C.stop8.push({ date: B[i].date, v: (ex / entry - 1) * 100 - bm })
    const s20 = spx20(B[i].date)
    if (s20 !== null) (s20 <= -5 ? C.usBear : C.usOk).push(r)
    const t5 = topix5(B[i].date)
    if (t5 !== null) {
      if (t5 <= -4) C.mktDown.push(r)
      else if (t5 > -1) C.alone.push(r)
    }
    if (B[i].c < 300) C.low.push(r)
    else if (B[i].c < 1500) C.mid.push(r)
    else C.high.push(r)
    // 同じ株で10日以内に続けて出たか（最初の1回だけ／2回目以降）
    if (i - last <= 10) C.twice.push(r)
    else C.first.push(r)
    last = i
  }
}
judge('全部', C.all)
judge('損切り −8% を入れた場合', C.stop8)
judge('米国が下げ相場（S&P500 20日で −5% 以下）', C.usBear)
judge('米国はふつう', C.usOk)
judge('TOPIX も5日で −4% 以下（全体の急落）', C.mktDown)
judge('TOPIX はほぼ下げていない（その株だけ）', C.alone)
judge('株価 300円未満', C.low)
judge('株価 300〜1,500円', C.mid)
judge('株価 1,500円以上', C.high)
judge('10日ぶりの最初の急落の合図', C.first)
judge('10日以内に続けて出た合図', C.twice)

// 3) 会社の中身（J-Quants・2年。1年目／2年目で分ける）
console.log('\n■ 会社の中身（開示の翌日の寄りで買い20日目の引けで売る。TOPIX との差・0.2% を引く。1年目／2年目）')
const fins = R('../jq_fins.json')
const px = {}
for (const [code, w] of Object.entries(wide)) {
  const B = (w?.d || []).map(([date, o, h, l, c, v]) => ({ date, o, h, l, c, v })).filter(b => b.o > 0 && b.c > 0)
  px[code] = { B, idx: new Map(B.map((b, i) => [b.date, i])) }
}
const F = { pbrLowUp: [], pbrLowDown: [], pbrHigh: [], eqHigh: [], eqLow: [], roeHigh: [], roeLow: [], cheapGood: [] }
const Y2 = '2025-08-28'
const num = v => (v === '' || v == null ? null : Number(v))
for (const list of Object.values(fins)) {
  for (const r of list) {
    if (!/FinancialStatements/.test(r.DocType)) continue
    const p = px[r.Code.slice(0, 4)]
    if (!p) continue
    const i = p.idx.get(r.DiscDate)
    if (i === undefined || i < 20 || i + 21 >= p.B.length) continue
    const B = p.B
    const t20 = B.slice(i - 19, i + 1).reduce((s, b) => s + b.c * b.v, 0) / 20
    if (t20 < 1e8) continue
    const e = i + 1
    const bm = bOpenTo(B[e].date, B[e + 19].date)
    if (bm === null) continue
    const v = (B[e + 19].c / B[e].o - 1) * 100 - bm
    const row = { date: r.DiscDate, v }
    const bps = num(r.BPS)
    const pbr = bps > 0 ? B[i].c / bps : null
    const eqar = num(r.EqAR)
    const np = num(r.NP)
    const eq = num(r.Eq)
    const annual = { '1Q': 4, '2Q': 2, '3Q': 4 / 3, FY: 1 }[r.CurPerType] || null
    const roe = np !== null && eq > 0 && annual ? (np * annual) / eq * 100 : null
    const fop = num(r.FOP)
    const op = num(r.OP)
    const up = fop !== null && op !== null && r.CurPerType === 'FY' ? null : fop !== null && fop > 0
    if (pbr !== null) {
      if (pbr < 1 && up) F.pbrLowUp.push(row)
      if (pbr < 1 && fop !== null && fop <= 0) F.pbrLowDown.push(row)
      if (pbr >= 4) F.pbrHigh.push(row)
      if (pbr < 1 && roe !== null && roe >= 10) F.cheapGood.push(row)
    }
    if (eqar !== null) {
      if (eqar >= 0.6) F.eqHigh.push(row)
      if (eqar < 0.3) F.eqLow.push(row)
    }
    if (roe !== null) {
      if (roe >= 15) F.roeHigh.push(row)
      if (roe < 3) F.roeLow.push(row)
    }
  }
}
const j2 = (n, rows) => judge(n, rows, COST, Y2, '9999')
j2('PBR 1倍未満 × 通期の営業利益の予想がプラス', F.pbrLowUp)
j2('PBR 1倍未満 × 予想が赤字', F.pbrLowDown)
j2('PBR 1倍未満 × ROE 10%以上（割安で稼ぐ）', F.cheapGood)
j2('PBR 4倍以上（割高）', F.pbrHigh)
j2('自己資本比率 60%以上', F.eqHigh)
j2('自己資本比率 30%未満', F.eqLow)
j2('ROE 15%以上', F.roeHigh)
j2('ROE 3%未満', F.roeLow)
