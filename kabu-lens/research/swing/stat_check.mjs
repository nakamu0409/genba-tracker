// 検証の物差し（2026-11-25 本人と決定）：「3つの期間で良く見えた」が偶然でないかを数字で見る
// 使い方: node stat_check.mjs <WHATIF の出力A.json>:<id> <WHATIF の出力B.json>:<id> [...もう1組]
//   10年の口座全体の試算の「年ごとの増減（yearly_pct）」を、同じ年どうしで B − A と比べる（2017〜2026。2026は11月まで）。
//   出すもの：年ごとの差の平均、プラスだった年の数、t（平均 ÷ 標準誤差）、符号の検定の p（プラスの年がこれ以上になる確率。偶然なら半々）。
// 合格の目安（先に決めておく）：これまで40を超える案を試しているので、1つの案が偶然で良く見える分を考えて、
//   「プラスの年が10年のうち8年以上（p ≦ 0.055）か、t ≧ 2.5」を満たし、さらに3つの期間とも良いものだけを「偶然では説明しにくい」とする。
//   満たさないものは「偶然でも出る範囲」と書き添える（それだけで採らないとは決めない。決めるのは本人）
import { readFileSync } from 'node:fs'
export function yearDiff(ya, yb) {
  const ys = Object.keys(ya).filter(y => y in yb).sort()
  const d = ys.map(y => yb[y] - ya[y])
  const n = d.length
  const mean = d.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1))
  const t = sd > 0 ? mean / (sd / Math.sqrt(n)) : Infinity
  const pos = d.filter(x => x > 0).length
  // 符号の検定（片側）：プラスの年が pos 以上になる確率
  const C = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r }
  let p = 0; for (let k = pos; k <= n; k++) p += C(n, k); p /= 2 ** n
  const pass = (pos >= 8 || t >= 2.5) && mean > 0
  return { years: ys, diffs: d.map(x => Math.round(x * 10) / 10), mean: Math.round(mean * 10) / 10, t: Math.round(t * 100) / 100, pos, n, p: Math.round(p * 1000) / 1000, pass }
}
// 1回ずつの成績（R や %）の平均の幅（ブートストラップ。95%）
export function bootCI(arr, iters = 2000, seed = 1) {
  let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
  const n = arr.length; if (!n) return [NaN, NaN]
  const ms = []
  for (let k = 0; k < iters; k++) { let t = 0; for (let i = 0; i < n; i++) t += arr[Math.floor(rnd() * n)]; ms.push(t / n) }
  ms.sort((a, b) => a - b)
  return [ms[Math.floor(iters * 0.025)], ms[Math.floor(iters * 0.975)]]
}
if (process.argv[1] && process.argv[1].endsWith('stat_check.mjs')) {
  const args = process.argv.slice(2)
  const load = a => { const [f, id] = a.split(':'); const w = JSON.parse(readFileSync(f, 'utf-8')).find(x => x.id === id); if (!w) throw new Error(`${a} が無い`); return w }
  for (let i = 0; i + 1 < args.length; i += 2) {
    const A = load(args[i]), B = load(args[i + 1])
    const r = yearDiff(A.summary.yearly_pct, B.summary.yearly_pct)
    const pa = A.summary.periods, pb = B.summary.periods
    const per = ['前半', '後半', '最後の確認'].map(k => `${pa[k].cagr_pct}→${pb[k].cagr_pct}`).join(' ／ ')
    console.log(`${A.name} → ${B.name}\n  期間（前半／後半／直近）: ${per}\n  年ごとの差: ${r.diffs.join(' ')}（平均 ${r.mean}、プラス ${r.pos}/${r.n} 年、t ${r.t}、p ${r.p}）→ ${r.pass ? '偶然では説明しにくい' : '偶然でも出る範囲'}`)
  }
}
