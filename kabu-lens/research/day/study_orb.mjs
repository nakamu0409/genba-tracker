// 寄り付きの値幅の上抜け（オープニングレンジ・ブレイクアウト。海外の day-trader-skill の基本の買い方）を日本株で確かめる（2026-11-22。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/day/study_orb.mjs
// ① 1時間足（2年・hour.json）：9:00〜10:00 の高値を、そのあとの1時間足の終値が上回ったら、次の足の始値で買う。損切り＝寄りの値幅の真ん中（足の安値で判定）、引けで売る
// ② 5分足（60日・five.json）：9:00〜9:15 の高値を5分足の終値が上回ったら、20分の遅れを入れた足の始値で買う（株価の表示が遅れるため）。損切り＝値幅の真ん中、引けで売る
// 比べる相手：同じ日・同じ時刻に全銘柄を買って引けで売った平均（相場全体の動きを引く）。すべり 0.1%×2 を引く
// 分け方：全部／窓あけ +2%以上の日だけ（海外では「よく動く株」で使う）／日足が25日線の上の株だけ
// 対象：20日平均の売買代金1億円以上・株価100円以上。1時間足は前半（〜2025-05-19）／後半で分ける
// 結果（2026-11-22）：採らない。どの形でも全体比 −0.2% 前後（すべり0.2%とほぼ同じ＝上乗せはゼロ）、勝率は3割台。
//   ① 1時間足2年：前半 −0.20／後半 −0.21%（約10万回ずつ）。窓あけ+2%以上 −0.27／−0.28%。25日線の上 −0.21／−0.21%
//   ② 5分足60日（20分遅れ）−0.19%、遅れなし −0.20%。窓あけの日はもっと悪い（−0.26%）
//   → 日本株では寄りの値幅の上抜けに上乗せは無い。今の場中の買い場（10:30〜13:00 の押し目・高値抜けの絞り込み）のほうがまし
import { readFileSync } from 'node:fs'

const R = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8'))
const COST = 0.2
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
const f = v => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) : '—')
const wide = R('../wide.json')
const dailyOf = {}
for (const [code, w] of Object.entries(wide)) {
  const d = (w?.d || []).map(([date, o, h, l, c, v]) => ({ date, o, h, l, c, v })).filter(b => b.c > 0 && b.o > 0)
  const idx = new Map(d.map((b, i) => [b.date, i]))
  dailyOf[code] = { d, idx }
}
const ctxOf = (code, date) => {
  const D = dailyOf[code]
  if (!D) return null
  const i = D.idx.get(date)
  if (i === undefined || i < 26) return null
  const p = D.d.slice(i - 25, i)
  const t20 = p.slice(-20).reduce((s, b) => s + b.c * b.v, 0) / 20
  const ma25 = p.reduce((s, b) => s + b.c, 0) / 25
  const prev = D.d[i - 1].c
  return { t20, above25: prev > ma25, gap: (D.d[i].o / prev - 1) * 100, prev, open: D.d[i].o }
}

function run(data, { rangeEnd, delay, label, split }) {
  // 比べる相手：日付×時刻 → 全銘柄の「その足の始値→引け」の平均
  const base = new Map()
  const trades = []
  for (const [code, days] of Object.entries(data)) {
    if (!days) continue
    for (const [date, raw] of Object.entries(days)) {
      const bars = raw.map(([m, o, h, l, c, v]) => ({ m, o, h, l, c, v })).filter(b => b.o > 0)
      if (bars.length < 3) continue
      const cx = ctxOf(code, date)
      if (!cx || cx.t20 < 1e8 || cx.prev < 100) continue
      const close = bars[bars.length - 1].c
      for (const b of bars) {
        const k = `${date}|${b.m}`
        const s = base.get(k) || [0, 0]
        s[0] += (close / b.o - 1) * 100
        s[1]++
        base.set(k, s)
      }
      const rng = bars.filter(b => b.m < rangeEnd)
      if (!rng.length) continue
      const hi = Math.max(cx.open, ...rng.map(b => b.h))
      const lo = Math.min(cx.open, ...rng.map(b => b.l))
      const stop = (hi + lo) / 2
      const sig = bars.find(b => b.m >= rangeEnd && b.c > hi && b.m < 840)
      if (!sig) continue
      const ent = bars.find(b => b.m >= sig.m + 5 + delay && b.m > sig.m)
      if (!ent || ent.o <= stop) continue
      let exit = close
      for (const b of bars) {
        if (b.m < ent.m) continue
        if (b.l <= stop) { exit = Math.min(stop, b.o); break }
      }
      trades.push({ date, m: ent.m, pct: (exit / ent.o - 1) * 100 - COST, gap: cx.gap, above25: cx.above25 })
    }
  }
  for (const t of trades) {
    const s = base.get(`${t.date}|${t.m}`)
    t.ex = s && s[1] >= 50 ? t.pct - s[0] / s[1] : null
  }
  const groups = [['全部', () => true], ['窓あけ+2%以上の日', t => t.gap >= 2], ['25日線の上の株', t => t.above25]]
  console.log(`\n■ ${label}（全体比%・すべり0.2%を引いた／そのままの%／勝率／回数）`)
  for (const [name, fn] of groups) {
    const parts = split ? [['前半', t => t.date < split], ['後半', t => t.date >= split]] : [['', () => true]]
    const line = parts.map(([pn, pf]) => {
      const z = trades.filter(t => fn(t) && pf(t) && t.ex !== null)
      return `${pn} ${f(mean(z.map(t => t.ex)))}／${f(mean(z.map(t => t.pct)))}／${(z.filter(t => t.pct > 0).length / z.length * 100).toFixed(0)}%／${z.length}`
    }).join('   ')
    console.log(`  ${name.padEnd(16)} ${line}`)
  }
}

run(R('./hour.json'), { rangeEnd: 600, delay: 0, label: '① 1時間足・2年：9:00〜10:00 の高値を上抜け', split: '2025-05-19' })
run(R('./five.json'), { rangeEnd: 555, delay: 20, label: '② 5分足・60日：9:00〜9:15 の高値を上抜け（20分遅れ）', split: null })
run(R('./five.json'), { rangeEnd: 555, delay: 0, label: '②\' 同じ・遅れなし（楽天の画面ですぐ見られる場合）', split: null })
