// 決算の中身（J-Quants の財務のまとめ・2年分）で、発表のあとの値動きが変わるか
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_fins.mjs
// ・開示ごとに「次の取引の始まり」を決める：15:00 より前の開示はその日の引けが基準で翌営業日の寄りから（場中の開示は当日の寄りを過ぎているため、翌日から見る）。
//   15:00 以降はその日の引けが基準で翌営業日の寄りから
// ・見るもの：窓（寄り／基準の引け）、寄り→引け、寄りから5日・20日（いずれも TOPIX 連動ETF との差）
// ・分け方：予想の修正（前の開示の通期予想の営業利益と比べる）、進み具合（1Q〜3Q の累計の営業利益 ÷ 通期予想。ふつうは 25・50・75%）、
//   前年同期比（同じ四半期の1年前と比べる。1年目は前年が無い）、通期決算の来期予想（来期の営業利益の予想 ÷ 今期の実績）
// ・前半（2025-08-27 まで）と後半で同じ向きか。株価は Yahoo（今ある銘柄）。消えた銘柄は jq_delisted.json があれば足す
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
      d20: ex((B[e + 19].c / B[e].o - 1) * 100, bOpenToClose(B[e].date, B[e + 19].date)),
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
console.log(`開示 ${events.length} 件（株価のある銘柄・売買代金1億円以上）。消えた銘柄の株価：${delistedN} 銘柄分を足した`)

const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN)
const f = v => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) : '  —  ')
function line(name, z) {
  if (z.length < 30) return console.log(`  ${name.padEnd(34)} ${String(z.length).padStart(5)}件（少ない）`)
  const A = z.filter(x => x.date < SPLIT)
  const B = z.filter(x => x.date >= SPLIT)
  const m = k => mean(z.map(x => x[k]).filter(v => v !== null))
  const h = (s, k) => mean(s.map(x => x[k]).filter(v => v !== null))
  const same = Math.sign(h(A, 'd5')) === Math.sign(h(B, 'd5')) && A.length >= 30 && B.length >= 30
  console.log(`  ${name.padEnd(34)} ${String(z.length).padStart(5)}件  窓${f(m('gap'))}  寄り→引け${f(m('oc'))}  5日${f(m('d5'))}（前半${f(h(A, 'd5'))}・後半${f(h(B, 'd5'))}${same ? '・同じ向き' : ''}）  20日${f(m('d20'))}`)
}
const S = events.filter(e => e.stmt)
console.log('\n■ 全体（TOPIX 連動ETF との差・%）')
line('決算（全部）', S)
line('業績予想の修正の開示だけ', events.filter(e => !e.stmt))
console.log('\n■ 予想の修正（前に分かっていた通期の営業利益の予想と比べる）')
const R2 = events.filter(e => e.rev !== undefined)
line('+20%以上の上方修正', R2.filter(e => e.rev >= 20))
line('+5〜20%の上方修正', R2.filter(e => e.rev >= 5 && e.rev < 20))
line('±5%以内（ほぼ据え置き）', R2.filter(e => Math.abs(e.rev) < 5))
line('−5〜−20%の下方修正', R2.filter(e => e.rev <= -5 && e.rev > -20))
line('−20%以下の下方修正', R2.filter(e => e.rev <= -20))
console.log('\n■ 進み具合（1Q〜3Q。ふつう 25・50・75% との差）')
const P = S.filter(e => e.prog !== undefined)
line('+15pt 以上（かなり早い）', P.filter(e => e.prog >= 15))
line('+5〜15pt', P.filter(e => e.prog >= 5 && e.prog < 15))
line('±5pt', P.filter(e => Math.abs(e.prog) < 5))
line('−5〜−15pt', P.filter(e => e.prog <= -5 && e.prog > -15))
line('−15pt 以下（かなり遅い）', P.filter(e => e.prog <= -15))
console.log('\n■ 前年同期比（営業利益）')
const Y = S.filter(e => e.yoy !== undefined)
line('+50%以上', Y.filter(e => e.yoy >= 50))
line('+20〜50%', Y.filter(e => e.yoy >= 20 && e.yoy < 50))
line('0〜20%', Y.filter(e => e.yoy >= 0 && e.yoy < 20))
line('マイナス', Y.filter(e => e.yoy < 0))
console.log('\n■ 通期決算の来期予想（来期の営業利益 ÷ 今期の実績）')
const G = S.filter(e => e.guide !== undefined)
line('+20%以上', G.filter(e => e.guide >= 20))
line('0〜20%', G.filter(e => e.guide >= 0 && e.guide < 20))
line('マイナス（減益の予想）', G.filter(e => e.guide < 0))
console.log('\n■ 重なり')
line('上方修正+5%以上 かつ 進み具合+5pt以上', events.filter(e => e.rev >= 5 && e.prog >= 5))
line('前年比+20%以上 かつ 進み具合+5pt以上', S.filter(e => e.yoy >= 20 && e.prog >= 5))
line('前年比+20%以上 かつ 窓が+3%未満', S.filter(e => e.yoy >= 20 && e.gap !== null && e.gap < 3))
line('前年比+20%以上 かつ 窓が+3%以上', S.filter(e => e.yoy >= 20 && e.gap !== null && e.gap >= 3))
line('下方修正 かつ 窓が−3%以下', events.filter(e => e.rev <= -5 && e.gap !== null && e.gap <= -3))
console.log('\n■ 窓の大きさだけ（中身を見ない場合との比較）')
line('窓 +5%以上', S.filter(e => e.gap >= 5))
line('窓 +2〜5%', S.filter(e => e.gap >= 2 && e.gap < 5))
line('窓 −2〜+2%', S.filter(e => e.gap > -2 && e.gap < 2))
line('窓 −5〜−2%', S.filter(e => e.gap <= -2 && e.gap > -5))
line('窓 −5%以下', S.filter(e => e.gap <= -5))
if (delistedN) {
  console.log('\n■ 消えた銘柄だけ')
  line('決算（消えた銘柄）', S.filter(e => e.delisted))
}
