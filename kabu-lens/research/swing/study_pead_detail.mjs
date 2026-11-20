// 上方修正のあとの買い（PEAD）を細かく分ける（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_pead_detail.mjs
// 元：study_fins.mjs と同じ開示の作り方（J-Quants の財務のまとめ・2年分）。上方修正 +20%以上だけを見る
// 分け方（先に決めた）：修正の大きさ（20〜50%／50〜100%／100%以上）、窓（0%未満／0〜3／3〜7／7〜15／15%以上）、
//   売買代金（1〜5億／5〜20億／20億以上）、株価（1,500円未満／以上）、決算と一緒か修正だけの開示か
// 持つ日数：寄り→その日の引け／3日／5日／10日／20日。TOPIX 連動ETF との差から往復 0.2% を引く。前半（2025-08-27まで）・後半
import { readFileSync, existsSync } from 'node:fs'

const R = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8'))
const fins = R('../jq_fins.json')
const wide = R('../wide.json')
const benchRaw = R('./bench1306.json')
const bench = []
for (const b of benchRaw) {
  const p = bench[bench.length - 1]
  if (p && (b.c / p.c > 1.3 || b.c / p.c < 0.7)) continue
  bench.push(b)
}
const bIdx = new Map(bench.map((b, i) => [b.date, i]))
const SPLIT = '2025-08-28'

// 株価：コード4桁 → {bars, idx}
const px = {}
for (const [code, w] of Object.entries(wide)) {
  const bars = (w?.d || []).filter(b => b[1] > 0 && b[4] > 0).map(([date, o, h, l, c, v]) => ({ date, o, h, l, c, v }))
  if (bars.length) px[code] = { bars, idx: new Map(bars.map((b, i) => [b.date, i])) }
}
let delistedN = 0
if (existsSync(new URL('../jq_delisted.json', import.meta.url))) {
  for (const [c5, x] of Object.entries(R('../jq_delisted.json'))) {
    const code = c5.slice(0, 4)
    if (px[code] || !x.bars?.length) continue
    // 調整済みの値（AdjO など）があればそれを使う
    const bars = x.bars.map(b => ({ date: b.Date, o: +(b.AdjO ?? b.O), h: +(b.AdjH ?? b.H), l: +(b.AdjL ?? b.L), c: +(b.AdjC ?? b.C), v: +(b.AdjVo ?? b.Vo) })).filter(b => b.o > 0 && b.c > 0)
    if (bars.length) {
      px[code] = { bars, idx: new Map(bars.map((b, i) => [b.date, i])), delisted: true }
      delistedN++
    }
  }
}
const num = v => (v === '' || v === null || v === undefined ? null : Number(v))
const isStmt = r => /FinancialStatements/.test(r.DocType)
const fy = r => r.CurFYSt
// 銘柄ごとに時系列に並べる
const byCode = {}
for (const [, list] of Object.entries(fins)) {
  for (const r of list) (byCode[r.Code] ||= []).push(r)
}
for (const k of Object.keys(byCode)) byCode[k].sort((a, b) => (a.DiscDate + a.DiscTime).localeCompare(b.DiscDate + b.DiscTime))

// 基準の日の番号（その日の引けを基準。無ければ前の日）
function baseIndex(p, date) {
  if (p.idx.has(date)) return p.idx.get(date)
  let lo = 0
  let hi = p.bars.length - 1
  let ans = -1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (p.bars[m].date <= date) {
      ans = m
      lo = m + 1
    } else hi = m - 1
  }
  return ans
}
const bRet = (d0, d1) => {
  const a = bIdx.get(d0)
  const b = bIdx.get(d1)
  return a === undefined || b === undefined ? null : (bench[b].c / bench[a].c - 1) * 100
}
const bOC = d => {
  const i = bIdx.get(d)
  return i === undefined ? null : (bench[i].c / bench[i].o - 1) * 100
}
const bOpenToClose = (dOpen, dClose) => {
  const a = bIdx.get(dOpen)
  const b = bIdx.get(dClose)
  return a === undefined || b === undefined ? null : (bench[b].c / bench[a].o - 1) * 100
}

const events = []
for (const [c5, list] of Object.entries(byCode)) {
  const p = px[c5.slice(0, 4)]
  if (!p) continue
  let prevF = {} // FY 開始日 → 最後に分かっている通期予想の営業利益
  for (const r of list) {
    const op = num(r.OP)
    const fop = num(r.FOP)
    const key = fy(r)
    const prevFop = prevF[key]
    if (fop !== null) prevF[key] = fop
    // 通期決算は、来期の予想が次の期の基準になる
    if (/^FY/.test(r.CurPerType) && num(r.NxFOP) !== null && r.NxtFYSt) prevF[r.NxtFYSt] = num(r.NxFOP)
    const bi = baseIndex(p, r.DiscDate)
    if (bi < 20 || bi + 21 >= p.bars.length) continue
    const e = bi + 1
    const B = p.bars
    const base = B[bi]
    // 売買代金（20日平均）1億円以上だけ
    let t = 0
    for (let k = bi - 19; k <= bi; k++) t += B[k].c * B[k].v
    if (t / 20 < 1e8) continue
    const gap = (B[e].o / base.c - 1) * 100
    const oc = (B[e].c / B[e].o - 1) * 100
    const ex = (val, bm) => (val === null || bm === null ? null : val - bm)
    const ev = {
      code: c5,
      date: r.DiscDate,
      type: r.CurPerType,
      doc: r.DocType,
      gap: ex(gap, bRet(base.date, B[e].date) !== null ? (bench[bIdx.get(B[e].date)].o / bench[bIdx.get(base.date)].c - 1) * 100 : null),
      oc: ex(oc, bOC(B[e].date)),
      d5: ex((B[e + 4].c / B[e].o - 1) * 100, bOpenToClose(B[e].date, B[e + 4].date)),
      d3: ex((B[e + 2].c / B[e].o - 1) * 100, bOpenToClose(B[e].date, B[e + 2].date)),
      d10: ex((B[e + 9].c / B[e].o - 1) * 100, bOpenToClose(B[e].date, B[e + 9].date)),
      d20: ex((B[e + 19].c / B[e].o - 1) * 100, bOpenToClose(B[e].date, B[e + 19].date)),
      turn: t / 20,
      stuck: B[e].h === B[e].l || B[e].o >= B[e].h,
      price: base.c,
      cc: ex((B[e].c / base.c - 1) * 100, bRet(base.date, B[e].date)),
      delisted: !!p.delisted
    }
    // 予想の修正
    if (fop !== null && prevFop !== null && prevFop !== undefined && prevFop !== 0) {
      ev.rev = (fop / prevFop - 1) * 100 * Math.sign(prevFop)
    }
    if (isStmt(r)) {
      // 進み具合
      const std = { '1Q': 25, '2Q': 50, '3Q': 75 }[r.CurPerType]
      if (std && op !== null && fop !== null && fop > 0) ev.prog = op / fop * 100 - std
      // 前年同期比：1年前の同じ四半期
      const prevYear = list.find(x => x.CurPerType === r.CurPerType && isStmt(x) && x.CurFYSt && r.CurFYSt && Math.abs(new Date(r.CurFYSt) - new Date(x.CurFYSt) - 365 * 864e5) < 40 * 864e5)
      const pop = prevYear ? num(prevYear.OP) : null
      if (op !== null && pop !== null && pop > 0) ev.yoy = (op / pop - 1) * 100
      if (r.CurPerType === 'FY' && op !== null && op > 0 && num(r.NxFOP) !== null) ev.guide = (num(r.NxFOP) / op - 1) * 100
      ev.stmt = true
    } else ev.stmt = false
    if (Object.values(ev).some(v => typeof v === 'number' && !Number.isFinite(v))) continue
    events.push(ev)
  }
}

const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN)
const f = v => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) : '  —  ')
const COST = 0.2
const U = events.filter(e => e.rev >= 20)
console.log(`上方修正 +20%以上：${U.length}件（同じ日の重複を含む）`)
const KS = [['oc', 'その日'], ['d3', '3日'], ['d5', '5日'], ['d10', '10日'], ['d20', '20日']]
function line(name, z) {
  const A = z.filter(x => x.date < SPLIT)
  const B = z.filter(x => x.date >= SPLIT)
  const h = (s, k) => mean(s.map(x => x[k]).filter(v => v !== null)) - COST
  const cells = KS.map(([k, n]) => `${n}${f(h(A, k))}/${f(h(B, k))}`).join('  ')
  console.log(`  ${name.padEnd(22)} ${String(A.length).padStart(4)}+${String(B.length).padEnd(4)} ${cells}`)
}
console.log('（前半／後半。数字は TOPIX との差 − 0.2%）')
line('全部', U)
console.log('■ 修正の大きさ')
line('20〜50%', U.filter(e => e.rev < 50))
line('50〜100%', U.filter(e => e.rev >= 50 && e.rev < 100))
line('100%以上', U.filter(e => e.rev >= 100))
console.log('■ 窓（翌日の寄り）')
line('0%未満', U.filter(e => e.gap < 0))
line('0〜3%', U.filter(e => e.gap >= 0 && e.gap < 3))
line('3〜7%', U.filter(e => e.gap >= 3 && e.gap < 7))
line('7〜15%', U.filter(e => e.gap >= 7 && e.gap < 15))
line('15%以上', U.filter(e => e.gap >= 15))
console.log('■ 売買代金（20日平均）')
line('1〜5億', U.filter(e => e.turn < 5e8))
line('5〜20億', U.filter(e => e.turn >= 5e8 && e.turn < 2e9))
line('20億以上', U.filter(e => e.turn >= 2e9))
console.log('■ 株価')
line('1,500円未満', U.filter(e => e.price < 1500))
line('1,500円以上', U.filter(e => e.price >= 1500))
console.log('■ 開示の種類')
line('決算と一緒', U.filter(e => e.stmt))
line('修正だけの開示', U.filter(e => !e.stmt))
console.log('■ 比べる：+5〜20%の上方修正')
line('+5〜20%', events.filter(e => e.rev >= 5 && e.rev < 20))

console.log('■ 寄りで本当に買えたか（寄りが高値＝寄り天・ストップ高張り付きを含む）')
line('窓15%以上・寄りが高値でない', U.filter(e => e.gap >= 15 && !e.stuck))
line('窓15%以上・寄りが高値', U.filter(e => e.gap >= 15 && e.stuck))
line('窓7%以上・寄りが高値でない', U.filter(e => e.gap >= 7 && !e.stuck))
line('窓0%以上・寄りが高値でない', U.filter(e => e.gap >= 0 && !e.stuck))
line('窓0%未満', U.filter(e => e.gap < 0))
console.log('■ 窓15%以上の中身（1件ずつ）')
for (const e of U.filter(e => e.gap >= 15).sort((a, b) => a.date.localeCompare(b.date))) console.log(`  ${e.date} ${e.code} 修正${e.rev.toFixed(0)}% 窓${e.gap.toFixed(1)} 5日${f(e.d5)} ${e.stuck ? '寄り=高値' : ''}`)
