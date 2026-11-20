// 形の検証の3回目（先に一覧を決めてから回す。決まりは study_patterns.mjs と同じ）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_patterns3.mjs
// 期間：選ぶ（〜2021-11-18）・確かめる（〜2025-11-13）・最後の確認（それ以降。判定には使わない）。TOPIX 連動ETF との差から往復 0.2% を引く
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
const bOC = d => (bi.has(d) ? (bench[bi.get(d)].c / bench[bi.get(d)].o - 1) * 100 : null)
const bGap = d => {
  const i = bi.get(d)
  return i > 0 ? (bench[i].o / bench[i - 1].c - 1) * 100 : null
}
const bOpenTo = (d0, d1) => (bi.has(d0) && bi.has(d1) ? (bench[bi.get(d1)].c / bench[bi.get(d0)].o - 1) * 100 : null)

const G = {}
const add = (name, keys) => { G[name] = { keys, rows: [] } }
add('窓 −5% 以下で始まった株（TOPIX の窓は −1% より上）→ その日の寄りで買う', ['same', 'd5s'])
add('窓 −5% 以下で始まった株（TOPIX の窓も −1.5% 以下）→ その日の寄りで買う', ['same', 'd5s'])
add('20日の高値を出来高2倍以上で上抜け', ['oc', 'd5', 'd20'])
add('長い下ヒゲ（レンジ4%以上・下ヒゲ6割以上）× 5日で −8% 以下', ['oc', 'd5'])
add('60日の上昇率が上位10%（勢い）', ['d5', 'd20'])
add('60日の上昇率が下位10%（売られすぎ）', ['d5', 'd20'])
add('値動きが小さい（ATR% が下位20%）', ['d20'])
add('値動きが大きい（ATR% が上位20%）', ['d20'])
add('出来高が20日平均の半分以下の日が5日続いた', ['d5', 'd20'])
add('+5〜10% の上げで長い上ヒゲ（引けがレンジの下3割）', ['oc', 'd5'])
add('5日線が25日線を上抜け（25日線も上向き）', ['d5', 'd20'])

const wide = R('../wide.json')
const cross = new Map() // date → [{r60, atrp, out}]
for (const w of Object.values(wide)) {
  const B = (w?.d || []).map(([date, o, h, l, c, v]) => ({ date, o, h, l, c, v })).filter(b => b.o > 0 && b.c > 0 && b.h > 0 && b.l > 0)
  if (B.length < 300) continue
  const n = B.length
  const v20 = new Float64Array(n)
  const t20 = new Float64Array(n)
  const ma5 = new Float64Array(n)
  const ma25 = new Float64Array(n)
  const atr = new Float64Array(n)
  const hi20 = new Float64Array(n)
  let sv = 0
  let st = 0
  let s5 = 0
  let s25 = 0
  let sa = 0
  for (let i = 0; i < n; i++) {
    sv += B[i].v
    st += B[i].c * B[i].v
    s5 += B[i].c
    s25 += B[i].c
    const tr = i ? Math.max(B[i].h, B[i - 1].c) - Math.min(B[i].l, B[i - 1].c) : B[i].h - B[i].l
    sa += tr
    if (i >= 20) {
      sv -= B[i - 20].v
      st -= B[i - 20].c * B[i - 20].v
    }
    if (i >= 5) s5 -= B[i - 5].c
    if (i >= 25) s25 -= B[i - 25].c
    if (i >= 14) sa -= i - 14 ? Math.max(B[i - 14].h, B[i - 15].c) - Math.min(B[i - 14].l, B[i - 15].c) : B[0].h - B[0].l
    v20[i] = sv / Math.min(20, i + 1)
    t20[i] = st / Math.min(20, i + 1)
    ma5[i] = s5 / Math.min(5, i + 1)
    ma25[i] = s25 / Math.min(25, i + 1)
    atr[i] = sa / Math.min(14, i + 1)
    let h = 0
    for (let k = Math.max(0, i - 19); k <= i; k++) h = Math.max(h, B[k].h)
    hi20[i] = h
  }
  for (let i = 260; i < n - 21; i++) {
    if (t20[i] < 1e8 || B[i].c < 100) continue
    const e = i + 1
    const o1 = bOC(B[e].date)
    const d5b = bOpenTo(B[e].date, B[e + 4].date)
    const d20b = bOpenTo(B[e].date, B[e + 19].date)
    if (o1 === null || d5b === null || d20b === null || B[e].h === B[e].l) continue
    const out = { date: B[i].date, oc: (B[e].c / B[e].o - 1) * 100 - o1, d5: (B[e + 4].c / B[e].o - 1) * 100 - d5b, d20: (B[e + 19].c / B[e].o - 1) * 100 - d20b }
    const r1 = (B[i].c / B[i - 1].c - 1) * 100
    const rng = B[i].h - B[i].l
    // 窓下げ：その日（i）の寄りで買う
    const gap = (B[i].o / B[i - 1].c - 1) * 100
    if (gap <= -5) {
      const tg = bGap(B[i].date)
      const so = bOC(B[i].date)
      const s5b = bOpenTo(B[i].date, B[i + 4].date)
      if (tg !== null && so !== null && s5b !== null) {
        const row = { date: B[i].date, same: (B[i].c / B[i].o - 1) * 100 - so, d5s: (B[i + 4].c / B[i].o - 1) * 100 - s5b }
        if (tg > -1) G['窓 −5% 以下で始まった株（TOPIX の窓は −1% より上）→ その日の寄りで買う'].rows.push(row)
        if (tg <= -1.5) G['窓 −5% 以下で始まった株（TOPIX の窓も −1.5% 以下）→ その日の寄りで買う'].rows.push(row)
      }
    }
    if (B[i].c > hi20[i - 1] && B[i].v >= 2 * v20[i - 1]) G['20日の高値を出来高2倍以上で上抜け'].rows.push(out)
    if (rng / B[i - 1].c >= 0.04 && (Math.min(B[i].o, B[i].c) - B[i].l) / rng >= 0.6 && B[i].c / B[i - 5].c <= 0.92) G['長い下ヒゲ（レンジ4%以上・下ヒゲ6割以上）× 5日で −8% 以下'].rows.push(out)
    if ([0, 1, 2, 3, 4].every(k => B[i - k].v <= 0.5 * v20[i - k - 1])) G['出来高が20日平均の半分以下の日が5日続いた'].rows.push(out)
    if (r1 >= 5 && r1 < 10 && rng > 0 && (B[i].c - B[i].l) / rng <= 0.3) G['+5〜10% の上げで長い上ヒゲ（引けがレンジの下3割）'].rows.push(out)
    if (ma5[i] > ma25[i] && ma5[i - 1] <= ma25[i - 1] && ma25[i] > ma25[i - 5]) G['5日線が25日線を上抜け（25日線も上向き）'].rows.push(out)
    // 横並び（同じ日のほかの銘柄と比べる）
    const r60 = (B[i].c / B[i - 60].c - 1) * 100
    const atrp = atr[i] / B[i].c * 100
    if (!cross.has(B[i].date)) cross.set(B[i].date, [])
    cross.get(B[i].date).push({ r60, atrp, out })
  }
}
for (const list of cross.values()) {
  if (list.length < 50) continue
  const by = (k, a) => [...a].sort((x, y) => x[k] - y[k])
  const r = by('r60', list)
  const t = Math.floor(r.length * 0.1)
  for (const x of r.slice(-t)) G['60日の上昇率が上位10%（勢い）'].rows.push(x.out)
  for (const x of r.slice(0, t)) G['60日の上昇率が下位10%（売られすぎ）'].rows.push(x.out)
  const a = by('atrp', list)
  const q = Math.floor(a.length * 0.2)
  for (const x of a.slice(0, q)) G['値動きが小さい（ATR% が下位20%）'].rows.push(x.out)
  for (const x of a.slice(-q)) G['値動きが大きい（ATR% が上位20%）'].rows.push(x.out)
}
const LBL = { oc: '翌日の寄り→引け', d5: '5日', d20: '20日', same: 'その日の寄り→引け', d5s: 'その日の寄りから5日' }
console.log(`期間：選ぶ（〜${A}）・確かめる（〜${BB}）・最後の確認。TOPIX との差から往復 ${COST}% を引く\n`)
const sum = []
for (const [name, g] of Object.entries(G)) {
  for (const k of g.keys) {
    const z = g.rows.filter(r => r[k] !== null && r[k] !== undefined)
    const s1 = z.filter(r => r.date < A).map(r => r[k])
    const s2 = z.filter(r => r.date >= A && r.date < BB).map(r => r[k])
    const s3 = z.filter(r => r.date >= BB).map(r => r[k])
    const m1 = mean(s1) - COST
    const m2 = mean(s2) - COST
    const m3 = mean(s3) - COST
    let v
    if (s1.length >= 100 && s2.length >= 100) v = m1 > 0 && m2 > 0 ? '◎ 使える候補' : mean(s1) < 0 && mean(s2) < 0 ? '× 避ける合図' : '△ ばらつく'
    else v = '件数が少ない'
    const line = `${(name + '（' + LBL[k] + '）').padEnd(60)} ${String(z.length).padStart(7)}件  選ぶ${f(m1)}（${s1.length}）  確かめる${f(m2)}（${s2.length}）  最後${f(m3)}（${s3.length}）  ${v}`
    console.log('  ' + line)
    if (/◎|×/.test(v)) sum.push(`  ${v}  ${name}（${LBL[k]}）  選ぶ${f(m1)} 確かめる${f(m2)} 最後${f(m3)}`)
  }
}
console.log('\n■ まとめ（使える候補・避ける合図）')
for (const s of sum) console.log(s)
