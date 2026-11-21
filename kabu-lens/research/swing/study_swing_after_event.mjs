// スイングの候補が、最近（20営業日以内）自社株買い・増配・株式分割を発表した株に出たとき（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_swing_after_event.mjs
// 今の決まり（3R・40日・終値+2%以内・避ける形は外した候補）の平均R（選ぶ／確かめる／最後の確認）
// 企業の行動は lib_signals の events（15時以降・決算と別の日）。良い条件の無い自社株買いも含める
import { loadAll, simulate, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const D = loadAll()
const { stocks } = D
const evBy = {}
for (const e of D.events) (evBy[e.code] ||= []).push(e)
const rows = []
for (const s of D.swing) {
  const t = simulate(stocks[s.code].bars, s.i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
  if (!t) continue
  const ev = (evBy[s.code] || []).find(e => e.i <= s.i && e.i >= s.i - 20)
  rows.push({ date: s.date, r: t.r, ev: ev ? ev.kind : null })
}
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
const line = (n, z) => console.log(`  ${n.padEnd(20)} ${[0, 1, 2].map(p => { const a = z.filter(r => per(r) === p).map(r => r.r); return `${fmt(mean(a), 3)}(${a.length})` }).join('  ')}`)
line('全部', rows)
line('20日以内に企業の行動', rows.filter(r => r.ev))
line('　自社株買い', rows.filter(r => r.ev === 'buyback'))
line('　増配', rows.filter(r => r.ev === 'divup'))
line('　株式分割', rows.filter(r => r.ev === 'split'))
line('なし', rows.filter(r => !r.ev))
