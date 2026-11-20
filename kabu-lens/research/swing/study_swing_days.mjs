// スイング：持つ日数の上限（20・40・60・80日）×目標（3R・5R・なし）（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_swing_days.mjs
// 今の決まり：損切り 2×ATR・目標 3R・40日。平均R と平均の持つ日数（選ぶ／確かめる／最後の確認）。80日たって決着したものだけで比べる
import { loadAll, simulate, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const D = loadAll()
const { stocks } = D
const per = d => (d < A ? 0 : d < BB ? 1 : 2)
const base = D.swing.filter(s => s.i + 82 < stocks[s.code].bars.length)
for (const rMult of [3, 5, 0]) {
  for (const maxDays of [20, 40, 60, 80]) {
    const z = [[], [], []]
    const days = [[], [], []]
    for (const s of base) {
      const t = simulate(stocks[s.code].bars, s.i, s.stop, { rMult, maxDays, gapMax: 2 })
      if (!t) continue
      z[per(s.date)].push(t.r)
      days[per(s.date)].push(t.x - t.e + 1)
    }
    console.log(`  目標 ${rMult ? rMult + 'R' : 'なし'}・${String(maxDays).padStart(2)}日  ${z.map((a, p) => `${fmt(mean(a), 3)}（${mean(days[p]).toFixed(0)}日）`).join('  ')}  R/日 ${z.map((a, p) => fmt(mean(a) / mean(days[p]) * 10, 3)).join(' ')}（10日あたり）`)
  }
}
