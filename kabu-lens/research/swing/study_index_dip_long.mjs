// 指数が1日で大きく下げた次の日に買う（日経平均・S&P500 の約56年。2026-11-21。先に一覧を決めてから回す）
// 使い方: node kabu-lens/research/swing/study_index_dip_long.mjs <N225の chart JSON> <GSPCの chart JSON>
//   （Yahoo の chart API・interval=1d・period1=0 で取ったもの。リポジトリには入れない）
// 合図：終値が前の日から −3%以下（と −2%以下・−5%以下）。前の10日に合図が無い最初の日だけ
// 買う：次の日の終値（古いデータは寄りが無いので、揃えるため終値で買う）。持つ：5・20・60日
// 比べる相手：同じ10年のどの日に買っても同じ日数持ったときの平均（ふつうの上がり方）。差を「上乗せ」とする
import { readFileSync } from 'node:fs'

const load = f => {
  const r = JSON.parse(readFileSync(f, 'utf-8')).chart.result[0]
  const q = r.indicators.quote[0]
  return r.timestamp.map((t, i) => ({ date: new Date((t + 9 * 3600) * 1000).toISOString().slice(0, 10), c: q.close[i] })).filter(b => b.c > 0)
}
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN)
const f = v => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) : '  —  ')
for (const [name, file] of [['日経平均', process.argv[2]], ['S&P500', process.argv[3]]]) {
  const B = load(file)
  console.log(`\n■ ${name}（${B[0].date}〜${B.at(-1).date}・${B.length}日）`)
  for (const th of [-2, -3, -5]) {
    console.log(`  合図：1日で ${th}%以下`)
    const decades = [...new Set(B.map(b => b.date.slice(0, 3)))]
    for (const dec of decades) {
      const out = { 5: [], 20: [], 60: [] }
      const base = { 5: [], 20: [], 60: [] }
      let last = -99
      for (let i = 1; i < B.length - 61; i++) {
        if (B[i].date.slice(0, 3) !== dec) continue
        for (const n of [5, 20, 60]) base[n].push((B[i + n].c / B[i].c - 1) * 100)
        const r = (B[i].c / B[i - 1].c - 1) * 100
        if (r <= th) {
          if (i - last > 10) for (const n of [5, 20, 60]) out[n].push((B[i + 1 + n].c / B[i + 1].c - 1) * 100)
          last = i
        }
      }
      if (!out[20].length) continue
      const cells = [5, 20, 60].map(n => `${n}日 ${f(mean(out[n]))}（上乗せ ${f(mean(out[n]) - mean(base[n]))}・勝ち ${(out[n].filter(x => x > 0).length / out[n].length * 100).toFixed(0)}%）`)
      console.log(`    ${dec}0年代 ${String(out[20].length).padStart(3)}回  ${cells.join('  ')}`)
    }
  }
}
