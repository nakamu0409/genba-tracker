// 業種の強弱は役に立つか
//  A. 強い業種はその後も強いか（17業種ETF）
//  B. 買い候補を「強い業種の銘柄」に絞ると成績は良くなるか
import { analyze, evaluateSignal, exitFor } from '../../.claude/scripts/kabu-lens.mjs'
import { readFileSync } from 'node:fs'
const { bench, stocks } = JSON.parse(readFileSync(new URL('./bars.json', import.meta.url), 'utf-8'))
const { etf, industry } = JSON.parse(readFileSync(new URL('./sector.json', import.meta.url), 'utf-8'))
const SPLIT = '2022-01-01'
const TO17 = { 水産・農林: '食品', 食料品: '食品', 鉱業: 'エネルギー資源', '石油・石炭': 'エネルギー資源', 建設業: '建設・資材', 金属製品: '建設・資材', 'ガラス・土石': '建設・資材', 繊維製品: '素材・化学', 'パルプ・紙': '素材・化学', 化学: '素材・化学', 医薬品: '医薬品', ゴム製品: '自動車・輸送機', 輸送用機器: '自動車・輸送機', 鉄鋼: '鉄鋼・非鉄', 非鉄金属: '鉄鋼・非鉄', 機械: '機械', 電気機器: '電機・精密', 精密機器: '電機・精密', その他製品: '情報通信・サービスその他', '情報・通信業': '情報通信・サービスその他', サービス業: '情報通信・サービスその他', '電気・ガス': '電力・ガス', 陸運業: '運輸・物流', 海運業: '運輸・物流', 空運業: '運輸・物流', '倉庫・運輸': '運輸・物流', 卸売業: '商社・卸売', 小売業: '小売', 銀行業: '銀行', '証券・商品': '金融（除く銀行）', 保険業: '金融（除く銀行）', その他金融業: '金融（除く銀行）', 不動産業: '不動産' }
const dates = bench.map(b => b.date); const di = new Map(dates.map((d, i) => [d, i]))
const names = Object.keys(etf)
const px = {}
for (const n of names) { const a = new Array(dates.length).fill(null); for (const b of etf[n]) { const k = di.get(b.date); if (k !== undefined) a[k] = b.c } for (let i = 1; i < a.length; i++) if (a[i] == null) a[i] = a[i - 1]; px[n] = a }
// t 日時点で、過去 look 日の騰落率による業種の順位（0=最強）
function rankAt(t, look) {
  const rows = names.map(n => ({ n, r: px[n][t] && px[n][t - look] ? px[n][t] / px[n][t - look] - 1 : null })).filter(x => x.r != null)
  rows.sort((a, b) => b.r - a.r)
  return new Map(rows.map((x, i) => [x.n, i]))
}
const st = (xs) => { const n = xs.length; if (!n) return 'n=0'; const m = xs.reduce((a, x) => a + x, 0) / n; const sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, n - 1)); return `n=${String(n).padStart(4)} 平均=${m.toFixed(2).padStart(6)} t=${(m / (sd / Math.sqrt(n))).toFixed(1).padStart(5)} 勝率=${(xs.filter(x => x > 0).length / n * 100).toFixed(0)}%` }

console.log('======== A. 強い業種はその後も強いか（上位3業種 − 下位3業種の、その後の騰落率の差。%）')
for (const look of [5, 20, 60, 120]) for (const hold of [5, 20]) {
  const res = []
  for (let t = 130; t + hold < dates.length; t += hold) {
    const rk = rankAt(t, look); if (rk.size < 15) continue
    const fwd = n => (px[n][t + hold] / px[n][t] - 1) * 100
    const top = names.filter(n => rk.get(n) <= 2), bot = names.filter(n => rk.get(n) >= rk.size - 3)
    const avg = l => l.reduce((a, n) => a + fwd(n), 0) / l.length
    res.push({ d: dates[t], v: avg(top) - avg(bot), top: avg(top) - avg(names) })
  }
  const a = res.filter(r => r.d < SPLIT), b = res.filter(r => r.d >= SPLIT)
  console.log(`過去${String(look).padStart(3)}日で順位付け → ${String(hold).padStart(2)}日保有 | 前半 ${st(a.map(r => r.v))} | 後半 ${st(b.map(r => r.v))} | 上位3−全体: 前半 ${(a.reduce((s, r) => s + r.top, 0) / a.length).toFixed(2)} 後半 ${(b.reduce((s, r) => s + r.top, 0) / b.length).toFixed(2)}`)
}

console.log('\n======== B. 買い候補を業種の強さで分けると（1回の売買の平均R。今のルールを通過した候補）')
const all = []
let noSector = 0
for (const [code, bars] of Object.entries(stocks)) {
  if (bars.length < 400) continue
  const sec = TO17[industry[code]]; if (!sec) { noSector++; continue }
  const p = analyze(bars, bench, {}, { history: true })
  let free = -1
  for (const sg of p.signal_history.filter(x => x.pass)) {
    if (sg.i <= free) continue
    const r = evaluateSignal(bars, sg.i, sg.stop, exitFor(sg.kind))
    free = r.exitIdx === null ? bars.length : r.exitIdx
    if (!['STOPPED', 'TARGET', 'TIME_EXIT'].includes(r.status)) continue
    const t = di.get(sg.date); if (t === undefined || t < 130) continue
    all.push({ date: sg.date, kind: sg.kind, r: r.r, rk20: rankAt(t, 20).get(sec), rk60: rankAt(t, 60).get(sec), rk5: rankAt(t, 5).get(sec) })
  }
}
console.log('候補', all.length, '業種不明の銘柄', noSector)
const grp = (k) => (x) => x[k] <= 4 ? '強い(1-5位)' : x[k] <= 11 ? '中(6-12位)' : '弱い(13-17位)'
for (const k of ['rk5', 'rk20', 'rk60']) {
  console.log(`--- 業種の順位を過去${k.slice(2)}日の騰落率で決めた場合`)
  for (const g of ['強い(1-5位)', '中(6-12位)', '弱い(13-17位)']) {
    const l = all.filter(x => grp(k)(x) === g)
    console.log(`  ${g.padEnd(12)} 前半 ${st(l.filter(x => x.date < SPLIT).map(x => x.r))} | 後半 ${st(l.filter(x => x.date >= SPLIT).map(x => x.r))}`)
  }
}
console.log('--- 形ごと（過去20日の順位）')
for (const kind of ['GAP', 'PULLBACK', 'BREAKOUT', 'MOMENTUM']) for (const g of ['強い(1-5位)', '弱い(13-17位)']) {
  const l = all.filter(x => x.kind === kind && grp('rk20')(x) === g)
  console.log(`  ${kind.padEnd(9)} ${g.padEnd(12)} 前半 ${st(l.filter(x => x.date < SPLIT).map(x => x.r))} | 後半 ${st(l.filter(x => x.date >= SPLIT).map(x => x.r))}`)
}
