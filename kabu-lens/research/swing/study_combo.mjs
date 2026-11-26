// 組み合わせの検証（2026-11-20。先に一覧を決めてから回す。決まりは study_patterns.mjs と同じ）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_combo.mjs
// A「つられ下げ」：TOPIX 連動ETF の窓が −1.5% 以下の日に、窓 −5% 以下で始まった株を、その日の寄りで買う（持つ日数を変えて比べる）
// B「急落の反発」：5日で −15% 以下・10日ぶりの最初の合図・株価300円以上 → 翌日の寄りで買い5日目の引けで売る
// それぞれを条件で分け、選ぶ（〜2021-11-18）・確かめる（〜2025-11-13）・最後の確認 の3つで、TOPIX との差から往復 0.2% を引いて見る
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
const bGap = d => {
  const i = bi.get(d)
  return i > 0 ? (bench[i].o / bench[i - 1].c - 1) * 100 : null
}
const bOpenTo = (d0, d1) => (bi.has(d0) && bi.has(d1) ? (bench[bi.get(d1)].c / bench[bi.get(d0)].o - 1) * 100 : null)
const t5 = d => {
  const i = bi.get(d)
  return i >= 5 ? (bench[i].c / bench[i - 5].c - 1) * 100 : null
}
function ser(file) {
  const j = R('../world/' + file + '.json').chart.result[0]
  const q = j.indicators.quote[0]
  return j.timestamp.map((t, i) => ({ date: new Date((t - 5 * 3600) * 1000).toISOString().slice(0, 10), c: q.close[i] })).filter(x => x.c != null)
}
const spx = ser('GSPC')
const vix = ser('VIX')
const prior = (s, d) => {
  let lo = 0
  let hi = s.length - 1
  let a = -1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (s[m].date < d) {
      a = m
      lo = m + 1
    } else hi = m - 1
  }
  return a
}
const spx1 = d => {
  const i = prior(spx, d)
  return i >= 1 ? (spx[i].c / spx[i - 1].c - 1) * 100 : null
}
const spx20 = d => {
  const i = prior(spx, d)
  return i >= 20 ? (spx[i].c / spx[i - 20].c - 1) * 100 : null
}
const vixAt = d => {
  const i = prior(vix, d)
  return i >= 0 ? vix[i].c : null
}

const GA = []
const GB = []
const wide = R('../wide.json')
for (const w of Object.values(wide)) {
  const B = (w?.d || []).map(([date, o, h, l, c, v]) => ({ date, o, h, l, c, v })).filter(b => b.o > 0 && b.c > 0 && b.l > 0)
  if (B.length < 300) continue
  const n = B.length
  let st = 0
  let s25 = 0
  let last = -99
  const ma25 = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    st += B[i].c * B[i].v
    s25 += B[i].c
    if (i >= 20) st -= B[i - 20].c * B[i - 20].v
    if (i >= 25) s25 -= B[i - 25].c
    ma25[i] = s25 / Math.min(25, i + 1)
    if (i < 260 || i + 11 >= n || st / 20 < 1e8 || B[i - 1].c < 100) continue
    // A：その日（i）の寄りで買う
    const gap = (B[i].o / B[i - 1].c - 1) * 100
    const tg = bGap(B[i].date)
    if (gap <= -5 && tg !== null && tg <= -1.5) {
      const hold = {}
      for (const h of [1, 3, 5, 10]) {
        const bm = bOpenTo(B[i].date, B[i + h - 1].date)
        hold[h] = bm === null ? null : (B[i + h - 1].c / B[i].o - 1) * 100 - bm
      }
      GA.push({ date: B[i].date, v: hold[5], hold, price: B[i - 1].c, gap, tg, above25: B[i - 1].c > ma25[i - 1], spx: spx1(B[i].date), vix: vixAt(B[i].date), spx20: spx20(B[i].date) })
    }
    // B：i の引けで合図 → i+1 の寄りで買う
    if (B[i].c / B[i - 5].c <= 0.85 && B[i].c >= 300) {
      const first = i - last > 10
      last = i
      if (!first) continue
      const e = i + 1
      if (B[e].h === B[e].l) continue
      const bm = bOpenTo(B[e].date, B[e + 4].date)
      if (bm === null) continue
      GB.push({
        date: B[i].date, v: (B[e + 4].c / B[e].o - 1) * 100 - bm, price: B[i].c, mkt: t5(B[i].date), nextGap: (B[e].o / B[i].c - 1) * 100,
        was75: (() => {
          let s = 0
          for (let k = i - 95; k < i - 20; k++) s += B[k].c
          return B[i - 20].c > s / 75
        })(),
        spx20: spx20(B[e].date), vix: vixAt(B[e].date), r1: (B[i].c / B[i - 1].c - 1) * 100
      })
    }
  }
}
function judge(name, rows) {
  const z = rows.filter(r => r.v !== null && r.v !== undefined)
  const s1 = z.filter(r => r.date < A).map(r => r.v)
  const s2 = z.filter(r => r.date >= A && r.date < BB).map(r => r.v)
  const s3 = z.filter(r => r.date >= BB).map(r => r.v)
  const m = [mean(s1) - COST, mean(s2) - COST, mean(s3) - COST]
  let v
  if (s1.length >= 50 && s2.length >= 50) v = m[0] > 0 && m[1] > 0 ? (s3.length >= 30 && m[2] > 0 ? '◎◎ 3つともプラス' : '◎ 使える候補') : mean(s1) < 0 && mean(s2) < 0 ? '× 避ける' : '△ ばらつく'
  else v = '件数が少ない'
  console.log(`  ${name.padEnd(42)} ${String(z.length).padStart(6)}件  選ぶ${f(m[0])}（${s1.length}）  確かめる${f(m[1])}（${s2.length}）  最後${f(m[2])}（${s3.length}）  ${v}`)
}
console.log('■ A つられ下げ（TOPIX の窓 −1.5% 以下の日に、窓 −5% 以下の株をその日の寄りで買う）')
for (const h of [1, 3, 5, 10]) judge(`持つ日数 ${h}日`, GA.map(r => ({ ...r, v: r.hold[h] })))
console.log('  ― 以下は5日持つ場合 ―')
judge('株価 300円未満', GA.filter(r => r.price < 300))
judge('株価 300〜1,500円', GA.filter(r => r.price >= 300 && r.price < 1500))
judge('株価 1,500円以上', GA.filter(r => r.price >= 1500))
judge('窓 −5〜−8%', GA.filter(r => r.gap > -8))
judge('窓 −8% 以下', GA.filter(r => r.gap <= -8))
judge('TOPIX の窓 −1.5〜−2.5%', GA.filter(r => r.tg > -2.5))
judge('TOPIX の窓 −2.5% 以下', GA.filter(r => r.tg <= -2.5))
judge('前の日は25日線の上にいた（上げ相場の株）', GA.filter(r => r.above25))
judge('前の日は25日線の下（もともと弱い株）', GA.filter(r => !r.above25))
judge('前の夜の S&P500 −2% 以下（米国発）', GA.filter(r => r.spx !== null && r.spx <= -2))
judge('前の夜の S&P500 −2% より上', GA.filter(r => r.spx !== null && r.spx > -2))
judge('VIX 25 以上', GA.filter(r => r.vix !== null && r.vix >= 25))
judge('VIX 25 未満', GA.filter(r => r.vix !== null && r.vix < 25))
judge('米国の下げ相場（S&P500 20日で −5% 以下）', GA.filter(r => r.spx20 !== null && r.spx20 <= -5))

console.log('\n■ B 急落の反発（10日ぶりの最初の合図・300円以上 → 翌日の寄りで買い5日目の引けで売る）')
judge('全部', GB)
judge('株価 1,500円以上', GB.filter(r => r.price >= 1500))
judge('相場全体の急落（TOPIX 5日で −4% 以下）', GB.filter(r => r.mkt !== null && r.mkt <= -4))
judge('相場全体の急落 × 株価 1,500円以上', GB.filter(r => r.mkt !== null && r.mkt <= -4 && r.price >= 1500))
judge('その株だけ（TOPIX 5日で −1% より上）', GB.filter(r => r.mkt !== null && r.mkt > -1))
judge('20日前は75日線の上（上げていた株の急落）', GB.filter(r => r.was75))
judge('20日前は75日線の下（もともと弱い株）', GB.filter(r => !r.was75))
judge('翌日の寄りがさらに −3% 以下（投げ売り）', GB.filter(r => r.nextGap <= -3))
judge('翌日の寄りが +1% 以上（戻して始まる）', GB.filter(r => r.nextGap >= 1))
judge('合図の日に −8% 以下の大きな下げ', GB.filter(r => r.r1 <= -8))
judge('VIX 25 以上', GB.filter(r => r.vix !== null && r.vix >= 25))
judge('米国の下げ相場（S&P500 20日で −5% 以下）', GB.filter(r => r.spx20 !== null && r.spx20 <= -5))
