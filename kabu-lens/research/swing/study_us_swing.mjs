// 外の市場で確かめる：日本株と同じスイングの決まりを、米国の大型株（約100銘柄・10年）に当てる（2026-11-21。先に一覧を決めてから回す）
// 使い方: node kabu-lens/research/swing/study_us_swing.mjs <保存先ディレクトリ>   （Yahoo の日足を取って保存先にためる。リポジトリには入れない）
// 比べる相手：SPY（S&P500 連動ETF）。今の決まり（翌日の寄り・終値+2%以内・損切り 2×ATR・目標 3R・40日・避ける形は外した候補）
// 注意：今ある大型株だけなので、生き残りの偏りが日本株の検証より大きい（上げ続けた会社だけが入っている）
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fetchYahoo, analyze } from '../../../.claude/scripts/kabu-lens.mjs'
import { simulate, mean, fmt } from './lib_signals.mjs'

const dir = process.argv[2]
mkdirSync(dir, { recursive: true })
const TICK = 'AAPL MSFT NVDA AMZN GOOGL META BRK-B AVGO TSLA LLY JPM V UNH XOM MA JNJ PG HD COST ABBV MRK CVX KO PEP WMT BAC ADBE CRM NFLX AMD TMO MCD CSCO ACN ABT LIN DHR ORCL TXN WFC DIS VZ PM INTU CAT AMGN IBM QCOM NEE UNP HON GE LOW SPGI BA AMAT RTX GS ISRG PLD BKNG MS SBUX BLK MDT T ELV DE ADP GILD LMT SYK TJX MMC CVS VRTX ADI C REGN MDLZ CB ZTS SCHW PGR CI MO SO DUK BSX EOG SLB LRCX MU KLAC PANW SNPS CDNS ICE CME FDX NKE'.split(' ')
const get = async s => {
  const f = `${dir}/${s}.json`
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf-8'))
  const d = await fetchYahoo(s, '10y')
  writeFileSync(f, JSON.stringify(d.bars))
  await new Promise(r => setTimeout(r, 300))
  return d.bars
}
const bench = await get('SPY')
const A = '2021-11-19'
const BB = '2025-11-14'
const rows = []
for (const s of TICK) {
  let bars
  try { bars = (await get(s)).filter(b => b.o > 0 && b.c > 0) } catch { continue }
  if (bars.length < 300) continue
  let p
  try { p = analyze(bars, bench, {}, { history: true, avoidChase: true }) } catch { continue }
  for (const sg of p.signal_history) {
    if (!sg.pass) continue
    const t = simulate(bars, sg.i, sg.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
    if (t) rows.push({ date: bars[sg.i].date, r: t.r, kind: sg.kind })
  }
}
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
const line = (n, z) => console.log(`  ${n.padEnd(10)} ${[0, 1, 2].map(p => { const a = z.filter(r => per(r) === p).map(r => r.r); return `${fmt(mean(a), 3)}(${a.length})` }).join('  ')}`)
console.log('米国の大型株のスイングの候補。平均R（選ぶ／確かめる／最後の確認）')
line('全部', rows)
for (const k of ['GAP', 'PULLBACK', 'BREAKOUT', 'MOMENTUM']) line(k, rows.filter(r => r.kind === k))
