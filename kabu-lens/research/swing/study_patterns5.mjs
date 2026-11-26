// 形の検証の6回目（2026-11-20。先に一覧を決めてから回す。決まりは study_patterns.mjs と同じ）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_patterns5.mjs
// 1) 業種とのずれ：その株の5日の騰落 − 同じ業種（33業種・同じ日の平均）の5日の騰落 が −10pt 以下／+10pt 以上 → 翌日の寄りで買い5日
//    業種の勢い：業種の20日の騰落が上位20%／下位20%の業種の株 → 20日
// 2) 出来高3倍以上で値段がほとんど動かない（±1%）→ 5日・20日
// 3) 3連休以上の前日の引け → 明けの寄り（値動きの大きい株／小さい株）
// 4) 相場全体：25日線の上にいる株の割合が 10% 以下／90% 以上の日 → TOPIX 連動ETF の翌日の寄りから5日・20日（そのままの%・手数料は引かない）
// 5) TOPIX 連動ETF が1日で −3% 以下の翌日の寄りで買う → 5日・20日（そのままの%）
import { readFileSync } from 'node:fs'

const R = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8'))
const A = '2021-11-19'
const BB = '2025-11-14'
const COST = 0.2
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
const bOpenTo = (d0, d1) => (bi.has(d0) && bi.has(d1) ? (bench[bi.get(d1)].c / bench[bi.get(d0)].o - 1) * 100 : null)
const bGap2 = (d0, d1) => (bi.has(d0) && bi.has(d1) ? (bench[bi.get(d1)].o / bench[bi.get(d0)].c - 1) * 100 : null)
const master = R('../jq_master.json')
const S33 = {}
for (const x of master.first.concat(master.last)) S33[x.Code.slice(0, 4)] = x.S33Nm
const wide = R('../wide.json')
const day = new Map() // date → [{code, sec, r5, r20, out, above25, atrp, holiday...}]
const G = { volFlat: [], holHi: [], holLo: [] }
for (const [code, w] of Object.entries(wide)) {
  const B = (w?.d || []).map(([date, o, h, l, c, v]) => ({ date, o, h, l, c, v })).filter(b => b.o > 0 && b.c > 0 && b.l > 0)
  if (B.length < 300) continue
  const n = B.length
  let st = 0
  let sv = 0
  let s25 = 0
  let sa = 0
  const atr = []
  for (let i = 0; i < n; i++) {
    st += B[i].c * B[i].v
    sv += B[i].v
    s25 += B[i].c
    const tr = i ? Math.max(B[i].h, B[i - 1].c) - Math.min(B[i].l, B[i - 1].c) : B[i].h - B[i].l
    atr.push(tr)
    sa += tr
    if (i >= 20) {
      st -= B[i - 20].c * B[i - 20].v
      sv -= B[i - 20].v
    }
    if (i >= 25) s25 -= B[i - 25].c
    if (i >= 14) sa -= atr[i - 14]
    if (i < 260 || i + 21 >= n) continue
    const t20 = st / 20
    const v20prev = (sv - B[i].v + B[i - 20].v) / 20
    const ma25 = s25 / 25
    const e = i + 1
    const okT = t20 >= 1e8 && B[i].c >= 100
    let out = null
    if (okT && B[e].h !== B[e].l) {
      const d5b = bOpenTo(B[e].date, B[e + 4].date)
      const d20b = bOpenTo(B[e].date, B[e + 19].date)
      if (d5b !== null && d20b !== null) out = { date: B[i].date, d5: (B[e + 4].c / B[e].o - 1) * 100 - d5b, d20: (B[e + 19].c / B[e].o - 1) * 100 - d20b }
    }
    if (!day.has(B[i].date)) day.set(B[i].date, [])
    day.get(B[i].date).push({ code, sec: S33[code], r5: (B[i].c / B[i - 5].c - 1) * 100, r20: (B[i].c / B[i - 20].c - 1) * 100, above25: B[i].c > ma25, out })
    if (!okT || !out) continue
    const r1 = (B[i].c / B[i - 1].c - 1) * 100
    if (B[i].v >= 3 * v20prev && Math.abs(r1) < 1) G.volFlat.push(out)
    // 3連休以上の前日
    const gapDays = Math.round((new Date(B[e].date) - new Date(B[i].date)) / 864e5)
    if (gapDays >= 4) {
      const tg = bGap2(B[i].date, B[e].date)
      if (tg !== null) {
        const row = { date: B[i].date, v: (B[e].o / B[i].c - 1) * 100 - tg }
        const atrp = sa / 14 / B[i].c * 100
        if (atrp >= 4) G.holHi.push(row)
        else if (atrp < 2) G.holLo.push(row)
      }
    }
  }
}
// 業種とのずれ・業種の勢い・相場全体の割合
const div = { lag: [], lead: [], secTop: [], secBot: [] }
const breadth = []
for (const [d, list] of day) {
  if (list.length < 300) continue
  breadth.push({ date: d, pct: list.filter(x => x.above25).length / list.length * 100 })
  const bySec = {}
  for (const x of list) if (x.sec) (bySec[x.sec] ||= []).push(x)
  const secR20 = []
  for (const [s, xs] of Object.entries(bySec)) {
    if (xs.length < 8) continue
    const m5 = mean(xs.map(x => x.r5))
    secR20.push([s, mean(xs.map(x => x.r20))])
    for (const x of xs) {
      if (!x.out) continue
      if (x.r5 - m5 <= -10) div.lag.push(x.out)
      if (x.r5 - m5 >= 10) div.lead.push(x.out)
    }
  }
  secR20.sort((a, b) => a[1] - b[1])
  const q = Math.max(1, Math.floor(secR20.length * 0.2))
  const bot = new Set(secR20.slice(0, q).map(x => x[0]))
  const top = new Set(secR20.slice(-q).map(x => x[0]))
  for (const x of list) {
    if (!x.out || !x.sec) continue
    if (top.has(x.sec)) div.secTop.push(x.out)
    if (bot.has(x.sec)) div.secBot.push(x.out)
  }
}
function judge(name, rows, key, cost = COST, min = 100) {
  const z = rows.filter(r => Number.isFinite(r[key]))
  const s1 = z.filter(r => r.date < A).map(r => r[key])
  const s2 = z.filter(r => r.date >= A && r.date < BB).map(r => r[key])
  const s3 = z.filter(r => r.date >= BB).map(r => r[key])
  const m = [mean(s1) - cost, mean(s2) - cost, mean(s3) - cost]
  let v
  if (s1.length >= min && s2.length >= min) v = m[0] > 0 && m[1] > 0 ? (s3.length >= min / 5 && m[2] > 0 ? '◎◎ 3つともプラス' : '◎ 使える候補') : mean(s1) < 0 && mean(s2) < 0 ? '× 避ける' : '△ ばらつく'
  else v = '件数が少ない'
  console.log(`  ${name.padEnd(46)} ${String(z.length).padStart(7)}件  選ぶ${f(m[0])}（${s1.length}）  確かめる${f(m[1])}（${s2.length}）  最後${f(m[2])}（${s3.length}）  ${v}`)
}
console.log('■ 業種とのずれ・業種の勢い（TOPIX との差・0.2% を引く）')
judge('同じ業種より5日で −10pt 以上下げた株（5日）', div.lag, 'd5')
judge('同じ業種より5日で −10pt 以上下げた株（20日）', div.lag, 'd20')
judge('同じ業種より5日で +10pt 以上上げた株（5日）', div.lead, 'd5')
judge('業種の20日の騰落が上位20%の業種の株（20日）', div.secTop, 'd20')
judge('業種の20日の騰落が下位20%の業種の株（20日）', div.secBot, 'd20')
console.log('\n■ 出来高の急増の中身')
judge('出来高3倍以上で値段はほぼ動かず（±1%）（5日）', G.volFlat, 'd5')
judge('出来高3倍以上で値段はほぼ動かず（±1%）（20日）', G.volFlat, 'd20')
console.log('\n■ 3連休以上をまたぐ（前日の引け → 明けの寄り。TOPIX との差。手数料は引かない）')
judge('値動きの大きい株（ATR 4%以上）', G.holHi, 'v', 0, 30)
judge('値動きの小さい株（ATR 2%未満）', G.holLo, 'v', 0, 30)
console.log('\n■ 相場全体（TOPIX 連動ETF・そのままの%・手数料は引かない）')
const tRows = (pred, h) => breadth.filter(pred).map(x => {
  const i = bi.get(x.date)
  if (i === undefined || i + h >= bench.length) return null
  return { date: x.date, v: (bench[i + h].c / bench[i + 1].o - 1) * 100 }
}).filter(Boolean)
const allDays = h => tRows(() => true, h)
judge('比べる相手：どの日でも（5日）', allDays(5), 'v', 0, 30)
judge('25日線の上の株が 10% 以下（売られすぎ）（5日）', tRows(x => x.pct <= 10, 5), 'v', 0, 10)
judge('25日線の上の株が 10% 以下（売られすぎ）（20日）', tRows(x => x.pct <= 10, 20), 'v', 0, 10)
judge('25日線の上の株が 90% 以上（買われすぎ）（5日）', tRows(x => x.pct >= 90, 5), 'v', 0, 10)
judge('25日線の上の株が 90% 以上（買われすぎ）（20日）', tRows(x => x.pct >= 90, 20), 'v', 0, 10)
const big = []
for (let i = 1; i < bench.length - 21; i++) {
  if (bench[i].c / bench[i - 1].c - 1 <= -0.03) big.push({ date: bench[i].date, d5: (bench[i + 5].c / bench[i + 1].o - 1) * 100, d20: (bench[i + 20].c / bench[i + 1].o - 1) * 100 })
}
judge('TOPIX が1日で −3% 以下の翌日の寄りで買う（5日）', big, 'd5', 0, 10)
judge('TOPIX が1日で −3% 以下の翌日の寄りで買う（20日）', big, 'd20', 0, 10)
const cur = breadth[breadth.length - 1]
console.log(`\n（参考）データの最後の日 ${cur.date}：25日線の上の株の割合 ${cur.pct.toFixed(0)}%`)
