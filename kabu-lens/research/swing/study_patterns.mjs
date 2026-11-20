// いろいろな「勝ちパターン」を、先に決めた一覧のとおりにまとめて試す（2026-11-20 本人と決めた進め方）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_patterns.mjs
//
// 決まり（結果を見てから条件をいじらない）
// ・期間を3つに分ける：選ぶ期間（〜2021-11-18）、確かめる期間（2021-11-19〜2025-11-13）、最後の確認（2025-11-14〜。最後まで見ない前提で、表には並べるが判定には使わない）
// ・数字は TOPIX 連動ETF との差（%）。手数料と値段のずれとして往復 0.2% を引いた値で判定する
// ・「使える候補」＝選ぶ期間と確かめる期間の両方で、0.2% を引いてもプラス（各100件以上）
// ・「避ける合図」＝両方でマイナス（買わない決まりの候補）
// ・形が出た日の引けで分かる → 次の日の寄りで買う。世界×業種の形は、その日の朝に分かる → その日の寄りで買い引けで売る
import { readFileSync } from 'node:fs'

const R = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8'))
const A = '2021-11-19'
const B = '2025-11-14'
const COST = 0.2
const wide = R('../wide.json')
const master = R('../jq_master.json')
const S33 = {}
for (const x of master.first.concat(master.last)) S33[x.Code.slice(0, 4)] = x.S33Nm
const benchRaw = R('./bench1306.json')
const bench = []
for (const b of benchRaw) {
  const p = bench[bench.length - 1]
  if (p && (b.c / p.c > 1.3 || b.c / p.c < 0.7)) continue
  bench.push(b)
}
const bi = new Map(bench.map((b, i) => [b.date, i]))
const bOC = d => (bi.has(d) ? (bench[bi.get(d)].c / bench[bi.get(d)].o - 1) * 100 : null)
const bOpenTo = (d0, d1) => (bi.has(d0) && bi.has(d1) ? (bench[bi.get(d1)].c / bench[bi.get(d0)].o - 1) * 100 : null)
const bGap = d => {
  const i = bi.get(d)
  return i > 0 ? (bench[i].o / bench[i - 1].c - 1) * 100 : null
}

function ser(f, ny = true) {
  const j = R('../world/' + f + '.json').chart.result[0]
  const q = j.indicators.quote[0]
  return j.timestamp.map((t, i) => ({ date: new Date((t + (ny ? -5 * 3600 : 0)) * 1000).toISOString().slice(0, 10), c: q.close[i] })).filter(x => x.c != null)
}
const W = { spx: ser('GSPC'), sox: ser('SOX'), jpy: ser('JPYX', false), tnx: ser('TNX'), oil: ser('CLF') }
function prior(s, d) {
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
const wcache = new Map()
function world(d) {
  if (wcache.has(d)) return wcache.get(d)
  const ch = k => {
    const i = prior(W[k], d)
    return i >= 1 ? (W[k][i].c / W[k][i - 1].c - 1) * 100 : null
  }
  const ti = prior(W.tnx, d)
  const o = { spx: ch('spx'), sox: ch('sox'), jpy: ch('jpy'), oil: ch('oil'), tnx: ti >= 1 ? W.tnx[ti].c - W.tnx[ti - 1].c : null }
  wcache.set(d, o)
  return o
}

// 形の一覧（先に決めたもの）。ev(B, i, st) が true なら i の引けで形が出た（翌日の寄りで買う）
const P = {}
const add = (name, kind, fn) => { P[name] = { kind, fn, rows: [] } }
const ret = (B, i, n = 1) => (B[i].c / B[i - n].c - 1) * 100
add('52週高値を更新', 'next', (B, i, s) => B[i].c > s.hi250[i - 1])
add('上場来高値（2年以上の中で）を更新', 'next', (B, i, s) => i > 500 && B[i].c > s.hiAll[i - 1])
add('出来高3倍以上で +3〜15% の上げ', 'next', (B, i, s) => B[i].v >= 3 * s.v20[i - 1] && ret(B, i) >= 3 && ret(B, i) < 15)
add('出来高3倍以上で −3% 以下の下げ', 'next', (B, i, s) => B[i].v >= 3 * s.v20[i - 1] && ret(B, i) <= -3)
add('+15% 以上の上げで高値引け（ストップ高に近い）', 'next', B => ret(B, 1 > 0 ? B.length && 0 : 0) === null)
add('5日で −15% 以下の急落', 'next', (B, i) => i >= 5 && ret(B, i, 5) <= -15)
add('25日線から −20% 以下に離れた', 'next', (B, i, s) => B[i].c <= s.ma25[i] * 0.8)
add('25日線から +25% 以上に離れた', 'next', (B, i, s) => B[i].c >= s.ma25[i] * 1.25)
add('窓 +3% 以上で始まり陰線で終わった', 'next', B => false)
add('7日続けて上げた', 'next', (B, i) => i >= 7 && [0, 1, 2, 3, 4, 5, 6].every(k => B[i - k].c > B[i - k - 1].c))
add('7日続けて下げた', 'next', (B, i) => i >= 7 && [0, 1, 2, 3, 4, 5, 6].every(k => B[i - k].c < B[i - k - 1].c))
// 上の2つ（ストップ高・窓の陰線）は書き方を直して下で定義し直す
P['+15% 以上の上げで高値引け（ストップ高に近い）'].fn = B2 => false
const i15 = (B, i) => {
  const r = ret(B, i)
  const rng = B[i].h - B[i].l
  return r >= 15 && rng > 0 && (B[i].c - B[i].l) / rng >= 0.9
}
P['+15% 以上の上げで高値引け（ストップ高に近い）'].fn = i15
P['窓 +3% 以上で始まり陰線で終わった'].fn = (B, i) => B[i].o >= B[i - 1].c * 1.03 && B[i].c < B[i].o
// 世界 × 業種（その日の朝に分かる → その日の寄り→引け）
const SW = []
const sw = (name, sectors, cond) => SW.push({ name, sectors: new Set(sectors), cond, rows: [] })
sw('電気機器 × 前の夜の SOX +3% 以上', ['電気機器'], w => w.sox >= 3)
sw('電気機器 × 前の夜の SOX −3% 以下', ['電気機器'], w => w.sox <= -3)
sw('輸送用機器 × 円安（ドル円 +1% 以上）', ['輸送用機器'], w => w.jpy >= 1)
sw('輸送用機器 × 円高（ドル円 −1% 以下）', ['輸送用機器'], w => w.jpy <= -1)
sw('銀行業 × 米10年金利 +0.1 以上', ['銀行業'], w => w.tnx >= 0.1)
sw('銀行業 × 米10年金利 −0.1 以下', ['銀行業'], w => w.tnx <= -0.1)
sw('鉱業・石油石炭 × 原油 +4% 以上', ['鉱業', '石油・石炭製品'], w => w.oil >= 4)
sw('鉱業・石油石炭 × 原油 −4% 以下', ['鉱業', '石油・石炭製品'], w => w.oil <= -4)
sw('卸売業 × 原油 +4% 以上', ['卸売業'], w => w.oil >= 4)
sw('内需（陸運・電気ガス・食料品・小売）× S&P500 −2% 以下', ['陸運業', '電気・ガス業', '食料品', '小売業'], w => w.spx <= -2)
sw('内需（陸運・電気ガス・食料品・小売）× S&P500 +1% 以上', ['陸運業', '電気・ガス業', '食料品', '小売業'], w => w.spx >= 1)
sw('情報・通信業 × 前の夜のナスダック代わりに S&P500 −2% 以下', ['情報・通信業'], w => w.spx <= -2)

let n = 0
for (const [code, w] of Object.entries(wide)) {
  const B = (w?.d || []).map(([date, o, h, l, c, v]) => ({ date, o, h, l, c, v })).filter(b => b.o > 0 && b.c > 0 && b.h > 0 && b.l > 0)
  if (B.length < 300) continue
  n++
  const len = B.length
  const s = { hi250: new Float64Array(len), hiAll: new Float64Array(len), v20: new Float64Array(len), ma25: new Float64Array(len), t20: new Float64Array(len) }
  let mx = 0
  let sv = 0
  let sc = 0
  let st = 0
  const dq = []
  for (let i = 0; i < len; i++) {
    mx = Math.max(mx, B[i].h)
    s.hiAll[i] = mx
    while (dq.length && B[dq[dq.length - 1]].h <= B[i].h) dq.pop()
    dq.push(i)
    while (dq[0] <= i - 250) dq.shift()
    s.hi250[i] = B[dq[0]].h
    sv += B[i].v
    sc += B[i].c
    st += B[i].c * B[i].v
    if (i >= 20) {
      sv -= B[i - 20].v
      st -= B[i - 20].c * B[i - 20].v
    }
    if (i >= 25) sc -= B[i - 25].c
    s.v20[i] = sv / Math.min(20, i + 1)
    s.t20[i] = st / Math.min(20, i + 1)
    s.ma25[i] = sc / Math.min(25, i + 1)
  }
  const sec = S33[code]
  for (let i = 260; i < len - 21; i++) {
    if (s.t20[i] < 1e8 || B[i].c < 100) continue
    const e = i + 1
    if (B[e].h === B[e].l) continue
    const oc = bOC(B[e].date)
    const d5b = bOpenTo(B[e].date, B[e + 4].date)
    const d20b = bOpenTo(B[e].date, B[e + 19].date)
    if (oc === null || d5b === null || d20b === null) continue
    const out = { date: B[i].date, oc: (B[e].c / B[e].o - 1) * 100 - oc, d5: (B[e + 4].c / B[e].o - 1) * 100 - d5b, d20: (B[e + 19].c / B[e].o - 1) * 100 - d20b }
    for (const p of Object.values(P)) if (p.fn(B, i, s)) p.rows.push(out)
    // 世界 × 業種：その日（i）の寄り→引け
    if (sec) {
      const wd = world(B[i].date)
      for (const q of SW) {
        if (!q.sectors.has(sec) || !q.cond(wd)) continue
        const o2 = bOC(B[i].date)
        const g2 = bGap(B[i].date)
        if (o2 === null || g2 === null || !(B[i - 1].c > 0)) continue
        q.rows.push({ date: B[i].date, oc: (B[i].c / B[i].o - 1) * 100 - o2, gap: (B[i].o / B[i - 1].c - 1) * 100 - g2, d5: null, d20: null })
      }
    }
  }
}
console.log(`銘柄 ${n}。期間：選ぶ（〜${A}）・確かめる（〜${B}）・最後の確認（${B}〜）。往復 ${COST}% を引いて判定\n`)
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
const f = v => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) : '  —  ')
const verdicts = []
function judge(name, rows, key, label) {
  const z = rows.filter(r => r[key] !== null && r[key] !== undefined)
  const s1 = z.filter(r => r.date < A).map(r => r[key])
  const s2 = z.filter(r => r.date >= A && r.date < B).map(r => r[key])
  const s3 = z.filter(r => r.date >= B).map(r => r[key])
  const m1 = mean(s1) - COST
  const m2 = mean(s2) - COST
  let v = '—'
  if (s1.length >= 100 && s2.length >= 100) {
    if (m1 > 0 && m2 > 0) v = '◎ 使える候補'
    else if (mean(s1) < 0 && mean(s2) < 0) v = '× 避ける合図'
    else v = '△ ばらつく'
  } else v = '件数が少ない'
  verdicts.push({ name: name + '（' + label + '）', v, m1, m2, m3: mean(s3) - COST, n: z.length })
  console.log(`  ${(name + '（' + label + '）').padEnd(46)} ${String(z.length).padStart(6)}件  選ぶ${f(m1)}（${s1.length}）  確かめる${f(m2)}（${s2.length}）  最後${f(mean(s3) - COST)}（${s3.length}）  ${v}`)
}
console.log('■ 株の形（翌日の寄りで買う。0.2% を引いた TOPIX との差）')
for (const [name, p] of Object.entries(P)) {
  judge(name, p.rows, 'oc', '翌日の寄り→引け')
  judge(name, p.rows, 'd5', '5日')
  judge(name, p.rows, 'd20', '20日')
}
console.log('\n■ 世界 × 業種（その朝に分かる。その日の寄りで買い引けで売る）')
for (const q of SW) {
  judge(q.name, q.rows, 'oc', '寄り→引け')
  const g = q.rows.map(r => r.gap)
  console.log(`      （参考：寄りの窓は TOPIX より平均 ${f(mean(g))}%）`)
}
console.log('\n■ まとめ（使える候補・避ける合図だけ。最後の確認の数字も並べる）')
for (const x of verdicts.filter(x => /◎|×/.test(x.v))) console.log(`  ${x.v}  ${x.name}  選ぶ${f(x.m1)} 確かめる${f(x.m2)} 最後${f(x.m3)}`)
