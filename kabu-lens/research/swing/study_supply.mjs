// 需給（信用残・機関の空売り残高・大量保有報告）で、スイングの候補・企業の行動・その後の値動きが変わるか（2026-11-24 本人の希望。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=9000 kabu-lens/research/swing/study_supply.mjs   （先に fetch_supply.mjs で supply_margin／short／share.json を作る）
// 未来を見ないように、分かる日をずらす：信用残は週末（金曜）の値が翌週の火曜の夜に出る → 金曜から3営業日あと（水曜）から使う。
//   空売り残高は計算日から2営業日あとから使う。大量保有報告は報告義務の発生日から6営業日あと（提出期限は5営業日）から使う
// 1) 信用残（約5年）：スイングの候補（今の決まり：3R・40日）と企業の行動（自社株買い・増配：翌日の寄指→引けの全体比）を、
//    a) 信用倍率（買い残÷売り残）：売り残0／1倍以下／1〜3／3〜10／10倍以上、b) 買い残 ÷ 20日平均の出来高（何日分の買い残か）：1日未満／1〜3／3〜10／10日以上 で分ける
//    c) 全部の株を毎週：買い残が出来高の何日分かで並べ、20営業日あとの全体比（上から10%・下から10%）
// 2) 空売り残高（0.5%以上を報告した機関の合計%）：スイング・企業の行動を 0／0.5〜2%／2〜5%／5%以上 で分ける。
//    新しく空売りの報告が出た株（0→0.5%以上）・報告が全部消えた株（→0）の、分かった日の次の寄りから5・20営業日の全体比
// 3) 大量保有報告：分かった日の次の寄りで買い、5・20・60営業日の全体比。増やした報告（変化+）・新しく5%を超えた報告（前0→後5%以上）・減らした報告（変化−）で分ける
// 期間：信用残は約5年なので 2021年／2022〜2023年／2024年〜2025-11-13／直近。ほかは 前半（〜2021-11-18）／後半（〜2025-11-13）／直近
// 結果（11/24、約1,150銘柄。前半／後半／直近）
//  2) 空売り残高×スイング：0 +0.06／+0.11／+0.35R、0.5〜2% +0.07／+0.27／+0.26R、2〜5% −0.72／−0.17／−0.18R（8／87／452件）、5%以上 −1.06／−0.48／−0.72R（3／27／89件）。
//     2%以上はどの期間も負けるが数が少ない。口座全体の10年試算（study_combined の shortMax）：今 28.6／44.0／56.5%、2%以上を外す 28.6／44.0／55.8%、5%以上を外す 28.6／44.0／56.5%。
//     → 実際に買う株はほとんど変わらず、良くならない（採らない）。企業の行動は空売りが多くてもむしろ良い（数が少ない）。空売りが出た・消えた株の5・20日も差は小さく、期間でそろわない
//  3) 大量保有報告：増やした 20日 +0.35／−0.38／+0.19%、60日 +0.87／−0.07／+1.73%。新しく5%超え 20日 +2.12／+0.34／−2.65%、60日 +2.84／+2.70／−0.07%。減らした 20日 +0.18／−0.11／+0.17%。
//     3つの期間でそろわず、直近は新しく5%超えが負ける（採らない）
import { readFileSync, existsSync } from 'node:fs'
import { loadAll, simulate, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
const R = p => (existsSync(new URL(p, import.meta.url)) ? JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8')) : {})
const MG = R('../supply_margin.json'), SH = R('../supply_short.json'), SR = R('../supply_share.json')
const BB = '2025-11-14'
const per3 = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const per4 = d => (d < '2022-01-01' ? 0 : d < '2024-01-01' ? 1 : d < BB ? 2 : 3)
const D = loadAll()
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const bdays = bench.map(b => b.date)
const shift = (date, n) => { let k = bdays.findIndex(d => d >= date); return k < 0 || k + n >= bdays.length ? null : bdays[k + n] }
// 銘柄ごとに「その日に分かっている値」を引けるようにする（分かった日の昇順の配列）
const asOf = (arr, date) => { let lo = 0, hi = arr.length - 1, ans = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m].k <= date) { ans = arr[m]; lo = m + 1 } else hi = m - 1 } return ans }
const margin = {}
for (const [c, rows] of Object.entries(MG)) margin[c] = rows.map(([d, cl, sell, buy, ratio]) => ({ k: shift(d, 3), d, sell, buy, ratio })).filter(x => x.k).sort((a, b) => (a.k < b.k ? -1 : 1))
const short = {}
for (const [c, rows] of Object.entries(SH)) {
  // 報告者ごとの最新の%を足した合計（義務消失は0）を、報告の日ごとに作る
  const ev = rows.slice().sort((a, b) => (a[0] < b[0] ? -1 : 1))
  const cur = new Map(); const out = []
  for (const [d, who, pct] of ev) { cur.set(who, pct ?? 0); const tot = [...cur.values()].reduce((a, b) => a + b, 0); const k = shift(d, 2); if (k) out.push({ k, d, tot }) }
  short[c] = out
}
const turn20 = (st, i) => { let s = 0; for (let j = Math.max(0, i - 19); j <= i; j++) s += st.bars[j].v; return s / Math.min(20, i + 1) }
const exK = (st, j, n) => { const B = st.bars; if (j + n - 1 >= B.length) return null; const a = bi.get(B[j].date), b = bi.get(B[j + n - 1].date); if (a === undefined || b === undefined) return null; return (B[j + n - 1].c / B[j].o - 1) * 100 - (bench[b].c / bench[a].o - 1) * 100 }
const show = (title, groups, per, unit) => {
  console.log(`\n■ ${title}`)
  for (const [g, P] of Object.entries(groups)) console.log(`  ${g.padEnd(16)} ` + P.map(a => `${fmt(mean(a), 2)}${unit}(${a.length})`).join(' ／ '))
}
const mk = (keys, n) => Object.fromEntries(keys.map(k => [k, Array.from({ length: n }, () => [])]))
// --- 1) 信用残 ---
if (Object.keys(margin).length) {
  const RB = ['売り残0', '1倍以下', '1〜3倍', '3〜10倍', '10倍以上']
  const rb = m => (!m.sell ? '売り残0' : m.buy / m.sell <= 1 ? '1倍以下' : m.buy / m.sell <= 3 ? '1〜3倍' : m.buy / m.sell <= 10 ? '3〜10倍' : '10倍以上')
  const DB = ['1日未満', '1〜3日', '3〜10日', '10日以上']
  const db = x => (x < 1 ? '1日未満' : x < 3 ? '1〜3日' : x < 10 ? '3〜10日' : '10日以上')
  const swR = mk(RB, 4), swD = mk(DB, 4), evR = mk(RB, 4), evD = mk(DB, 4)
  for (const s of D.swing) {
    const ms = margin[s.code]; if (!ms) continue
    const m = asOf(ms, s.date); if (!m || s.date < '2021-04-01') continue
    const st = stocks[s.code]
    const t = simulate(st.bars, s.i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 }); if (!t) continue
    const p = per4(s.date)
    swR[rb(m)][p].push(t.r); swD[db(m.buy / turn20(st, s.i))][p].push(t.r)
  }
  for (const e of D.events) {
    if (e.kind !== 'buyback' && e.kind !== 'divup') continue
    const ms = margin[e.code]; if (!ms) continue
    const m = asOf(ms, e.date); if (!m || e.date < '2021-04-01') continue
    const st = stocks[e.code]; const x = st.bars[e.i + 1]
    if (!x || x.h === x.l || x.o > e.limit) continue
    const v = exK(st, e.i + 1, 1); if (v === null) continue
    const p = per4(e.date)
    evR[rb(m)][p].push(v); evD[db(m.buy / turn20(st, e.i))][p].push(v)
  }
  show('信用倍率 × スイングの候補（平均R）2021／2022〜23／2024〜25.11／直近', swR, 4, 'R')
  show('買い残が出来高の何日分か × スイングの候補（平均R）', swD, 4, 'R')
  show('信用倍率 × 企業の行動（翌日の寄指→引けの全体比%）', evR, 4, '%')
  show('買い残が出来高の何日分か × 企業の行動', evD, 4, '%')
  // c) 毎週、全部の株を買い残の日数で並べる
  const top = [[], [], [], []], bot = [[], [], [], []], all = [[], [], [], []]
  const wk = bdays.filter((d, k) => d >= '2021-04-01' && k + 1 < bdays.length && new Date(bdays[k + 1]).getUTCDay() < new Date(d).getUTCDay())
  for (const d of wk) {
    const rows = []
    for (const [c, ms] of Object.entries(margin)) {
      const st = stocks[c]; if (!st) continue
      const i = st.idx.get(d); if (i === undefined || st.turn[i] < 1e8) continue
      const m = asOf(ms, d); if (!m) continue
      const v = exK(st, i + 1, 20); if (v === null) continue
      rows.push({ x: m.buy / turn20(st, i), v })
    }
    if (rows.length < 100) continue
    rows.sort((a, b) => b.x - a.x)
    const n = Math.floor(rows.length / 10), p = per4(d)
    top[p].push(mean(rows.slice(0, n).map(r => r.v))); bot[p].push(mean(rows.slice(-n).map(r => r.v))); all[p].push(mean(rows.map(r => r.v)))
  }
  show('毎週・全部の株：買い残が出来高の何日分か（20営業日あとの全体比%）', { '多い10%': top, '少ない10%': bot, '全部': all }, 4, '%')
}
// --- 2) 空売り残高 ---
if (Object.keys(short).length) {
  const SB = ['0', '0.5〜2%', '2〜5%', '5%以上']
  const sb = x => (!x ? '0' : x < 2 ? '0.5〜2%' : x < 5 ? '2〜5%' : '5%以上')
  const sw = mk(SB, 3), ev = mk(SB, 3)
  for (const s of D.swing) {
    if (!(s.code in short)) continue
    const m = asOf(short[s.code], s.date)
    const st = stocks[s.code]
    const t = simulate(st.bars, s.i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 }); if (!t) continue
    sw[sb(m ? m.tot : 0)][per3(s.date)].push(t.r)
  }
  for (const e of D.events) {
    if ((e.kind !== 'buyback' && e.kind !== 'divup') || !(e.code in short)) continue
    const m = asOf(short[e.code], e.date)
    const st = stocks[e.code]; const x = st.bars[e.i + 1]
    if (!x || x.h === x.l || x.o > e.limit) continue
    const v = exK(st, e.i + 1, 1); if (v === null) continue
    ev[sb(m ? m.tot : 0)][per3(e.date)].push(v)
  }
  show('機関の空売り残高 × スイングの候補（平均R）前半／後半／直近', sw, 3, 'R')
  show('機関の空売り残高 × 企業の行動（翌日の寄指→引けの全体比%）', ev, 3, '%')
  const nw = { '新しく空売り 5日': [[], [], []], '新しく空売り 20日': [[], [], []], '空売りが消えた 5日': [[], [], []], '空売りが消えた 20日': [[], [], []] }
  for (const [c, arr] of Object.entries(short)) {
    const st = stocks[c]; if (!st) continue
    for (let k = 0; k < arr.length; k++) {
      const prev = k ? arr[k - 1].tot : 0, now = arr[k].tot
      const kind = prev === 0 && now > 0 ? '新しく空売り' : prev > 0 && now === 0 ? '空売りが消えた' : null
      if (!kind) continue
      const j = st.idx.get(shift(arr[k].k, 1)); if (j === undefined) continue
      const p = per3(arr[k].k)
      for (const n of [5, 20]) { const v = exK(st, j, n); if (v !== null) nw[`${kind} ${n}日`][p].push(v) }
    }
  }
  show('空売りの報告が出た・消えた株（分かった日の次の寄りから・全体比%）', nw, 3, '%')
}
// --- 3) 大量保有報告 ---
if (Object.keys(SR).length) {
  const g = { '増やした 5日': [[], [], []], '増やした 20日': [[], [], []], '増やした 60日': [[], [], []], '新しく5%超え 20日': [[], [], []], '新しく5%超え 60日': [[], [], []], '減らした 20日': [[], [], []] }
  for (const [c, rows] of Object.entries(SR)) {
    const st = stocks[c]; if (!st) continue
    for (const [d, who, chg, after] of rows) {
      if (!Number.isFinite(chg) || chg === 0) continue
      const k = shift(d, 6); if (!k) continue
      const j = st.idx.get(shift(k, 1) || ''); if (j === undefined) continue
      const p = per3(k)
      const isNew = chg > 0 && Number.isFinite(after) && after - chg < 0.01 && after >= 5
      for (const n of [5, 20, 60]) {
        const v = exK(st, j, n); if (v === null) continue
        if (chg > 0 && g[`増やした ${n}日`]) g[`増やした ${n}日`][p].push(v)
        if (isNew && g[`新しく5%超え ${n}日`]) g[`新しく5%超え ${n}日`][p].push(v)
        if (chg < 0 && g[`減らした ${n}日`]) g[`減らした ${n}日`][p].push(v)
      }
    }
  }
  show('大量保有報告（分かった日の次の寄りで買う・全体比%）前半／後半／直近', g, 3, '%')
}
