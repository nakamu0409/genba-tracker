// 自社株買いの翌日（寄りで買い→大引けで売る）を、条件ごとに分けて、前半・後半の両方で効く条件を探す
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_buyback_filters.mjs
import { readFileSync } from 'node:fs'
const wide = JSON.parse(readFileSync(new URL('../wide.json', import.meta.url), 'utf-8'))
const irev = JSON.parse(readFileSync(new URL('../irevents.json', import.meta.url), 'utf-8'))
const irh = JSON.parse(readFileSync(new URL('../irhist.json', import.meta.url), 'utf-8'))
const bench = JSON.parse(readFileSync(new URL('./bench1306.json', import.meta.url), 'utf-8'))
const bIdx = new Map(bench.map((b, i) => [b.date, i]))
const isB = t => /自己株式/.test(t) && /取得/.test(t) && /(決定|事項)/.test(t) && !/(取得状況|結果|終了|完了|経過|ToSTNeT|立会外)/.test(t)
const ev = []
for (const [code, list] of Object.entries(irev)) {
  const w = wide[code]; if (!w?.d || !Array.isArray(list)) continue
  const D = w.d.filter(x => x[1] > 0 && x[4] > 0)
  const idx = new Map(D.map((x, i) => [x[0], i]))
  const kd = new Set((irh[code] || []).map(r => r.date))
  const allB = list.filter(r => isB(r.title)).map(r => r.date).sort()
  const seen = new Set()
  for (const r of list) {
    if (!isB(r.title) || r.time < '15:00') continue
    const i0 = idx.get(r.date); if (i0 === undefined || i0 < 60) continue
    const rd = i0 + 1; if (rd >= D.length || seen.has(rd)) continue
    seen.add(rd)
    const kessanSame = kd.has(r.date) || list.some(x => x.date === r.date && /決算/.test(x.title))
    if (kessanSame) continue
    let turn = 0; for (let k = i0 - 19; k <= i0; k++) turn += D[k][4] * D[k][5]; turn /= 20
    if (turn < 1e8) continue
    if (D[rd][2] === D[rd][3]) continue
    const pre = D[i0][4], open = D[rd][1]
    const gap = (open / pre - 1) * 100
    if (open > pre * 1.02) continue // 寄指（+2%以下）で買える日だけ
    const ma = (k, n) => { let s = 0; for (let j = k - n + 1; j <= k; j++) s += D[j][4]; return s / n }
    const bi = bIdx.get(D[i0][0])
    const bm = bi !== undefined && bi >= 25 ? bench[bi].c / (bench.slice(bi - 24, bi + 1).reduce((s, b) => s + b.c, 0) / 25) - 1 : null
    const prevB = allB.filter(d => d < r.date)
    ev.push({
      code, date: D[rd][0], day1: (D[rd][4] / open - 1) * 100, gap,
      price: pre, turn,
      dev25: (pre / ma(i0, 25) - 1) * 100, ret20: (pre / D[i0 - 20][4] - 1) * 100, ret60: (pre / D[i0 - 60][4] - 1) * 100,
      mkt: bm === null ? null : bm * 100,
      late: r.time >= '15:30', cancel: /消却/.test(r.title), repeat: prevB.some(d => d >= String(Number(r.date.slice(0, 4)) - 1) + r.date.slice(4)),
      dow: new Date(D[rd][0] + 'T00:00:00Z').getUTCDay()
    })
  }
}
const dates = [...new Set(ev.map(e => e.date))].sort(), mid = dates[Math.floor(dates.length / 2)]
const f = v => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) : '  —  ')
const avg = xs => xs.length ? xs.reduce((s, e) => s + e.day1, 0) / xs.length : NaN
function line(name, xs) {
  const A = xs.filter(e => e.date < mid), B = xs.filter(e => e.date >= mid)
  const s = xs.map(e => e.day1).sort((a, b) => a - b)
  console.log(name.padEnd(30), `n=${String(xs.length).padStart(4)} 1日目 平均${f(avg(xs))}%（前${f(avg(A))}/後${f(avg(B))}） 中央${f(s[Math.floor(s.length / 2)])} 勝${Math.round(xs.filter(e => e.day1 > 0).length / xs.length * 100)}%`)
}
console.log(`寄指で買える自社株買いの翌日 ${ev.length}回（前半/後半の境 ${mid}）`)
line('全部', ev)
const groups = {
  '株価': [['500円未満', e => e.price < 500], ['500〜1,500円', e => e.price >= 500 && e.price < 1500], ['1,500円以上', e => e.price >= 1500]],
  '売買代金': [['1〜3億円', e => e.turn < 3e8], ['3〜10億円', e => e.turn >= 3e8 && e.turn < 1e9], ['10億円以上', e => e.turn >= 1e9]],
  '窓（寄り÷前日終値）': [['−2%未満', e => e.gap < -2], ['−2〜0%', e => e.gap >= -2 && e.gap < 0], ['0〜1%', e => e.gap >= 0 && e.gap < 1], ['1〜2%', e => e.gap >= 1]],
  '25日線からの位置': [['−5%未満（下げてきた）', e => e.dev25 < -5], ['−5〜0%', e => e.dev25 >= -5 && e.dev25 < 0], ['0〜5%', e => e.dev25 >= 0 && e.dev25 < 5], ['5%以上', e => e.dev25 >= 5]],
  '直近60日の騰落': [['−15%未満', e => e.ret60 < -15], ['−15〜0%', e => e.ret60 >= -15 && e.ret60 < 0], ['0〜15%', e => e.ret60 >= 0 && e.ret60 < 15], ['15%以上', e => e.ret60 >= 15]],
  '相場（TOPIXの25日線から）': [['−3%未満', e => e.mkt !== null && e.mkt < -3], ['−3〜0%', e => e.mkt !== null && e.mkt >= -3 && e.mkt < 0], ['0〜3%', e => e.mkt !== null && e.mkt >= 0 && e.mkt < 3], ['3%以上', e => e.mkt !== null && e.mkt >= 3]],
  '発表の時刻': [['15:00〜15:29', e => !e.late], ['15:30以降', e => e.late]],
  '消却もあわせて発表': [['あり', e => e.cancel], ['なし', e => !e.cancel]],
  '1年以内にも自社株買い': [['あり（くり返し）', e => e.repeat], ['なし（久しぶり）', e => !e.repeat]],
  '曜日（買う日）': [['月', e => e.dow === 1], ['火〜木', e => e.dow >= 2 && e.dow <= 4], ['金', e => e.dow === 5]]
}
for (const [g, list] of Object.entries(groups)) {
  console.log(`\n-- ${g}`)
  for (const [n, fn] of list) line(n, ev.filter(fn))
}

console.log('\n-- 組み合わせ')
line('久しぶり ＋ 25日線の下', ev.filter(e => !e.repeat && e.dev25 < 0))
line('久しぶり ＋ 15:00〜15:29', ev.filter(e => !e.repeat && !e.late))
line('久しぶり ＋ 25日線から+5%未満', ev.filter(e => !e.repeat && e.dev25 < 5))
line('くり返し ＋ 25日線から+5%以上', ev.filter(e => e.repeat && e.dev25 >= 5))
const score = e => (!e.repeat ? 1 : 0) + (!e.late ? 1 : 0) + (e.dev25 < 0 ? 1 : 0)
for (const k of [0, 1, 2, 3]) line(`良い条件の数 ${k}（久しぶり・15時台前半・25日線の下）`, ev.filter(e => score(e) === k))
