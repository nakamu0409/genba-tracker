// 本人の考え（11/25）：業種が日替わりで入れ替わる相場（半導体→ほか→半導体…）では、スイングで持つより翌日の引けで売るほうが良いのでは（先に比べ方を決める）
// 入れ替わりの強さ：17業種ETF（sector.json の etf）の日々の騰落の順位相関（前の日と次の日）を、合図の日までの20日で平均。−0.1未満＝入れ替わりが激しい、+0.1より上＝同じ業種が続く、その間＝ふつう
// それぞれの日に出たスイングの候補で、翌日の寄り→引け（%・全体との差。滑り込み）と、今の決まり（3R・40日）の平均R を比べる。期間：前半／後半／直近
// 結果（11/25。前半／後半／直近）：入れ替わりが激しい時期（10年の日の37%）：引けで売る −0.225／−0.213／−0.100%（負け）、今（3R・40日）+0.245／−0.045／+0.504R。
//   ふつう：引けで売る −0.18／−0.21／−0.20%、今 −0.014／+0.183／+0.159R。同じ業種が続く時期（4%）：今 −0.474／−0.293／−0.323R（3つともマイナスで、ほかより悪い。ただし日数が少ない）。
//   → 入れ替わりの相場でも、引けで売るより今のスイングのほうが良い（採らない）。「同じ業種が続く時期はスイングを控える」は3つとも同じ向きなので、口座全体で確かめる候補（11/19 時点の値は 0.04〜0.09＝ふつう）
import { readFileSync } from 'node:fs'
import { loadAll, simulate, mean, fmt, SPLIT_DATE, SLIP } from './lib_signals.mjs'
const BB = '2025-11-14', per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const SEC = JSON.parse(readFileSync(new URL('../sector.json', import.meta.url), 'utf-8')).etf
const { stocks, bench, swing } = loadAll()
const bi = new Map(bench.map((b, i) => [b.date, i]))
const names = Object.keys(SEC)
const ret = {} // date -> [17業種の騰落]
const maps = names.map(n => new Map(SEC[n].map((b, i, a) => [b.date, i ? b.c / a[i - 1].c - 1 : null])))
for (const b of bench) { const v = maps.map(m => m.get(b.date)); if (v.every(x => x != null)) ret[b.date] = v }
const rank = a => { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); o.forEach(([, i], k) => (r[i] = k)); return r }
const spear = (a, b) => { const ra = rank(a), rb = rank(b), n = a.length; let d2 = 0; for (let i = 0; i < n; i++) d2 += (ra[i] - rb[i]) ** 2; return 1 - 6 * d2 / (n * (n * n - 1)) }
const days = bench.map(b => b.date)
const rc = {} // date -> その日の相関
for (let i = 1; i < days.length; i++) { const a = ret[days[i - 1]], b = ret[days[i]]; if (a && b) rc[days[i]] = spear(a, b) }
const rot = {} // date -> 20日平均
for (let i = 20; i < days.length; i++) { const v = []; for (let k = i - 19; k <= i; k++) if (rc[days[k]] != null) v.push(rc[days[k]]); if (v.length >= 15) rot[days[i]] = mean(v) }
const G = {}
const push = (k, p, v) => ((G[k] ||= [[], [], []])[p].push(v))
for (const s of swing) {
  const r = rot[s.date]; if (r == null) continue
  const g = r < -0.1 ? '入れ替わりが激しい' : r > 0.1 ? '同じ業種が続く' : 'ふつう'
  const B = stocks[s.code].bars, j = s.i + 1; if (j >= B.length) continue
  const x = B[j]; if (x.o > s.close * 1.02 || x.h === x.l) continue
  const k = bi.get(x.date); if (k === undefined) continue
  const p = per(s.date)
  push(g + '・引けで売る%', p, (x.c / x.o - 1) * 100 - SLIP * 200 - (bench[k].c / bench[k].o - 1) * 100)
  const R = simulate(B, s.i, s.stop); if (R) push(g + '・今（3R・40日）R', p, R.r)
}
const cnt = Object.values(rot); console.log('日の割合：激しい', (cnt.filter(x => x < -0.1).length / cnt.length * 100).toFixed(0) + '%', '続く', (cnt.filter(x => x > 0.1).length / cnt.length * 100).toFixed(0) + '%', '／最新', Object.entries(rot).slice(-3).map(([d, v]) => d + ':' + v.toFixed(2)).join(' '))
for (const [k, a] of Object.entries(G).sort()) console.log(`  ${k.padEnd(22)} ` + a.map(x => `${fmt(mean(x), 3)}(${x.length})`).join(' ／ '))
