// 本人の考え（11/25）：相場が弱いときは、スイングを早めに利確したほうが良いのでは（先に比べ方を決める）
// 弱い相場の決め方（合図の日に分かっていること）：A) 日経平均連動（bench）の終値が200日線より下、B) 米国の下げ相場（S&P500 の前の日までの20日の騰落が −5% 以下）
// それぞれ弱い日・弱くない日に出たスイングの候補で、目標 1.5R／2R／3R（今）、最長 20日／40日（今）の平均R を比べる。期間：前半／後半／直近
// 結果（11/25。平均R 前半／後半／直近）：A) 200日線より下の日の候補：今（3R・40日）−0.073／+0.038／（9件）、1.5R −0.079／+0.054、2R −0.076／+0.045、20日 −0.072／+0.019。
//   B) 米国の下げ相場の日の候補：今 −0.120／−0.058／−0.388（118件）、1.5R −0.165／−0.045／−0.077、2R −0.128／−0.058／−0.144、2R・20日 −0.163／−0.114／−0.135。
//   → 早めの利確で3つの期間がそろって良くなる形は無い（期間で入れ替わる）。弱い相場の候補はどの売り方でも平均がほぼ0〜マイナスで、差は売り方より相場そのもの（採らない）
import { readFileSync } from 'node:fs'
import { loadAll, simulate, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
const BB = '2025-11-14', per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const { stocks, bench, swing } = loadAll()
const bi = new Map(bench.map((b, i) => [b.date, i]))
const below200 = d => { const i = bi.get(d); if (i === undefined || i < 200) return null; let m = 0; for (let k = i - 199; k <= i; k++) m += bench[k].c; return bench[i].c < m / 200 }
const sp = JSON.parse(readFileSync(new URL('../world/GSPC.json', import.meta.url), 'utf-8')).chart.result[0]
const spS = sp.timestamp.map((t, i) => ({ date: new Date((t - 5 * 3600) * 1000).toISOString().slice(0, 10), c: sp.indicators.quote[0].close[i] })).filter(x => x.c != null)
const usBear = d => { let a = -1; for (let lo = 0, hi = spS.length - 1; lo <= hi;) { const m = (lo + hi) >> 1; if (spS[m].date < d) { a = m; lo = m + 1 } else hi = m - 1 } return a >= 20 ? (spS[a].c / spS[a - 20].c - 1) * 100 <= -5 : null }
const V = [['3R・40日（今）', 3, 40], ['2R・40日', 2, 40], ['1.5R・40日', 1.5, 40], ['3R・20日', 3, 20], ['2R・20日', 2, 20]]
for (const [label, f] of [['A) 日経平均連動が200日線より下', below200], ['B) 米国の下げ相場', usBear]]) {
  const G = {}
  for (const s of swing) {
    const w = f(s.date); if (w == null) continue
    const p = per(s.date), B = stocks[s.code].bars
    for (const [n, r, days] of V) { const x = simulate(B, s.i, s.stop, { rMult: r, maxDays: days }); if (x) ((G[(w ? '弱い・' : 'ふつう・') + n] ||= [[], [], []])[p]).push(x.r) }
  }
  console.log(`\n■ ${label}（平均R 前半／後半／直近）`)
  for (const [k, a] of Object.entries(G).sort()) console.log(`  ${k.padEnd(16)} ` + a.map(x => `${fmt(mean(x), 3)}(${x.length})`).join(' ／ '))
}
