// 月の単位で見る：(1) 何月が強いか（季節） (2) 月の中のどのあたりか（月初・月末） (3) 先月うまくいったやり方は今月もうまくいくか
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_monthly.mjs
// 12か月×やり方の数だけ比べるので、偶然1つ2つ良く見えるのは当たり前。前半・後半とも同じ向きのものだけを信じる
import { loadAll, simulate, mean, fmt, SPLIT_DATE, SLIP } from './lib_signals.mjs'
const D = loadAll()
const { stocks, bench } = D
const bIdx = new Map(bench.map((b, i) => [b.date, i]))
const T = { swing: [], surge: [], buyback: [], divup: [], split: [], topix: [] }
for (const s of D.swing) {
  const t = simulate(stocks[s.code].bars, s.i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
  if (t) T.swing.push({ date: stocks[s.code].bars[t.e].date, v: t.r })
}
for (const s of D.surge) {
  const t = simulate(stocks[s.code].bars, s.i, s.stop, { rMult: 3, maxDays: 10 })
  if (t) T.surge.push({ date: stocks[s.code].bars[t.e].date, v: t.r })
}
for (const ev of D.events) {
  const B = stocks[ev.code].bars
  const e = ev.i + 1
  if (e >= B.length || B[e].h === B[e].l || B[e].o > ev.limit) continue
  if (ev.kind === 'buyback' && ev.score === 0) continue
  if (ev.kind === 'split') {
    if (e + 4 < B.length) T.split.push({ date: B[e].date, v: (B[e + 4].c * (1 - SLIP) / B[e].o - 1) * 100 })
  } else {
    const bi = bIdx.get(B[e].date)
    T[ev.kind].push({ date: B[e].date, v: (B[e].c / B[e].o - 1) * 100 - (bi !== undefined ? (bench[bi].c / bench[bi].o - 1) * 100 : 0) })
  }
}
for (let i = 1; i < bench.length; i++) T.topix.push({ date: bench[i].date, v: (bench[i].c / bench[i - 1].c - 1) * 100 })
const NAME = { swing: 'スイング候補（R）', surge: '急騰の押し目（R）', buyback: '自社株買いの翌日（%・全体比）', divup: '増配の翌日（%・全体比）', split: '株式分割5日（%）', topix: 'TOPIX の1日（%）' }

console.log('■ (1) 何月が強いか（買った日の月。前半/後半）　◎＝前半・後半とも全体の平均より上、×＝両方とも下')
for (const [k, xs] of Object.entries(T)) {
  const all = mean(xs.map(x => x.v))
  const cells = []
  for (let m = 1; m <= 12; m++) {
    const z = xs.filter(x => Number(x.date.slice(5, 7)) === m)
    const A = mean(z.filter(x => x.date < SPLIT_DATE).map(x => x.v))
    const B = mean(z.filter(x => x.date >= SPLIT_DATE).map(x => x.v))
    const mark = A > all && B > all ? '◎' : A < all && B < all ? '×' : ' '
    cells.push(`${m}月${mark}${fmt(mean(z.map(x => x.v)), 2)}`)
  }
  console.log(`${NAME[k]}（全体 ${fmt(all, 3)}・${xs.length}件）\n  ` + cells.join(' '))
}

console.log('\n■ (2) 月の中のどのあたりか（買った日。前半/後半）')
const part = d => { const n = Number(d.slice(8, 10)); return n <= 5 ? '1〜5日' : n <= 15 ? '6〜15日' : n <= 25 ? '16〜25日' : '26日〜月末' }
for (const [k, xs] of Object.entries(T)) {
  const out = ['1〜5日', '6〜15日', '16〜25日', '26日〜月末'].map(p => {
    const z = xs.filter(x => part(x.date) === p)
    return `${p} ${fmt(mean(z.map(x => x.v)), 3)}（${fmt(mean(z.filter(x => x.date < SPLIT_DATE).map(x => x.v)), 2)}/${fmt(mean(z.filter(x => x.date >= SPLIT_DATE).map(x => x.v)), 2)}）`
  })
  console.log(`${NAME[k]}：` + out.join('  '))
}

console.log('\n■ (3) 先月うまくいったやり方は、今月もうまくいくか（月ごとの合計で）')
for (const [k, xs] of Object.entries(T)) {
  if (k === 'topix') continue
  const byM = new Map()
  for (const x of xs) { const m = x.date.slice(0, 7); byM.set(m, (byM.get(m) || 0) + x.v) }
  const ms = [...byM.keys()].sort()
  const pairs = []
  for (let i = 1; i < ms.length; i++) pairs.push([byM.get(ms[i - 1]), byM.get(ms[i])])
  const up = pairs.filter(p => p[0] > 0).map(p => p[1])
  const dn = pairs.filter(p => p[0] <= 0).map(p => p[1])
  const pos = ms.filter(m => byM.get(m) > 0).length
  console.log(`${NAME[k]}：プラスの月 ${pos}/${ms.length}（${(pos / ms.length * 100).toFixed(0)}%）。先月プラス → 今月の平均 ${fmt(mean(up), 2)}（${up.length}回）／先月マイナス → 今月の平均 ${fmt(mean(dn), 2)}（${dn.length}回）`)
}

console.log('\n■ (3b) スイング：先月（買った月の前の月）の候補の合計Rがプラスかマイナスかで、1回あたりの平均Rを分ける（前半/後半）')
{
  const byM = new Map()
  for (const x of T.swing) { const m = x.date.slice(0, 7); byM.set(m, (byM.get(m) || 0) + x.v) }
  const ms = [...byM.keys()].sort()
  const prevOf = new Map(ms.map((m, i) => [m, i ? byM.get(ms[i - 1]) : null]))
  // 注意：先月の合計Rは、先月買った候補が決着するまで（最長40日）分からない。ここでは「月が終わった時点で決着した分」ではなく全部で数えているので甘い。下で決着済みだけの版も出す
  for (const [nm, f] of [['先月プラス', p => p > 0], ['先月マイナス', p => p <= 0]]) {
    const z = T.swing.filter(x => prevOf.get(x.date.slice(0, 7)) !== null && f(prevOf.get(x.date.slice(0, 7))))
    console.log(`  ${nm}：${z.length}件 平均 ${fmt(mean(z.map(x => x.v)), 3)}R（前半 ${fmt(mean(z.filter(x => x.date < SPLIT_DATE).map(x => x.v)), 3)}／後半 ${fmt(mean(z.filter(x => x.date >= SPLIT_DATE).map(x => x.v)), 3)}）`)
  }
}
console.log('\n■ (3c) 公平な版：月の初めの時点で「先月までに決着した候補」の直近300件の平均Rで分ける（その時点で本当に分かる数字）')
{
  const done = []
  for (const s of D.swing) {
    const B = stocks[s.code].bars
    const t = simulate(B, s.i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
    if (t) done.push({ entry: B[t.e].date, exit: B[t.x].date, r: t.r })
  }
  done.sort((a, b) => (a.exit < b.exit ? -1 : 1))
  const months = [...new Set(done.map(x => x.entry.slice(0, 7)))].sort()
  const res = { up: [], dn: [] }
  for (const m of months) {
    const start = m + '-01'
    // 月の初めまでに決着した、直近の決着300件の平均R
    const before = done.filter(x => x.exit < start).slice(-300)
    if (before.length < 300) continue
    const recent = mean(before.map(x => x.r))
    const z = done.filter(x => x.entry.slice(0, 7) === m)
    ;(recent > 0 ? res.up : res.dn).push(...z.map(x => ({ ...x, m })))
  }
  for (const [nm, z] of [['直近の決着がプラス', res.up], ['直近の決着がマイナス', res.dn]]) {
    console.log(`  ${nm}：${new Set(z.map(x => x.m)).size}か月・${z.length}件 平均 ${fmt(mean(z.map(x => x.r)), 3)}R（前半 ${fmt(mean(z.filter(x => x.entry < SPLIT_DATE).map(x => x.r)), 3)}／後半 ${fmt(mean(z.filter(x => x.entry >= SPLIT_DATE).map(x => x.r)), 3)}）`)
  }
}
