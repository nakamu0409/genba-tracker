// 本人の希望（11/25）：銘柄ごとのパターン①株主優待・配当の権利取り（先に比べ方を決める）
// 権利の日：決算期末（jq_fins の CurFYEn の月）と、その6か月後（中間）。権利付最終日＝その月の最後の営業日から2営業日前（2019-07-16 より前は3営業日前）。
// A) 権利付最終日の20営業日前の引けで買い、権利付最終日の引けで売る（配当はもらわない＝値上がりだけ）。日経平均連動（bench）との差%。
//    分け方：株主優待がある会社（irevents に「株主優待」の開示がある）／無い会社、期末／中間
// B) 銘柄ごとのクセ：同じ銘柄・同じ月の「前の年までの A の差」の平均（2年以上あるとき）がプラスの組とマイナスの組で、その年の A の差を比べる（続くか）
// 期間：前半（〜2021-11-18）／後半（〜2025-11-13）／直近
// 結果（11/25。前半／後半／直近、全体との差）：全部 −0.01／−0.40／−0.18%。優待あり・期末 +0.62／−0.49／−0.14%（前半だけプラス。先回りが早くなって消えたとみられる）、優待なし・期末 −0.42／−0.79／−0.09%。
//   銘柄ごとのクセ：前の年までプラス +0.79／−0.22／−0.11%、マイナス −0.71／−0.48／−0.17%、3年続けてプラス +1.93／−0.67／−0.54%（前半だけ。後半から逆）。→ 権利取りも銘柄ごとのクセも使えない（採らない）
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
const BB = '2025-11-14', per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const R = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf-8'))
const fins = R('../jq_fins.json')
const fy = {}
for (const a of Object.values(fins)) for (const r of Array.isArray(a) ? a : [a]) if (r.CurFYEn && r.Code) fy[r.Code.slice(0, 4)] = +r.CurFYEn.slice(5, 7)
const yutai = new Set()
for (const f of ['../irevents.json', '../irevents2.json']) { try { for (const [c, v] of Object.entries(R(f))) for (const r of v || []) if (/株主優待/.test(r.title || '')) yutai.add(r.code || c) } catch {} }
const { stocks, bench } = loadAll({ withSwing: false, withSmall: true })
const days = bench.map(b => b.date)
const bi = new Map(days.map((d, i) => [d, i]))
// 月ごとの最後の営業日
const lastOf = new Map()
for (const d of days) lastOf.set(d.slice(0, 7), d)
const G = {}
const push = (k, p, v) => ((G[k] ||= [[], [], []])[p].push(v))
const hist = {} // code|期末or中間 → [{y, ex}]
const rows = []
for (const [code, st] of Object.entries(stocks)) {
  const m0 = fy[code]; if (!m0) continue
  const idx = new Map(st.bars.map((b, i) => [b.date, i]))
  for (const [ym, ld] of lastOf) {
    const m = +ym.slice(5, 7)
    const kind = m === m0 ? '期末' : m === ((m0 + 5) % 12) + 1 ? '中間' : null
    if (!kind) continue
    const li = bi.get(ld), back = ld < '2019-07-16' ? 3 : 2
    const cum = days[li - back], buyD = days[li - back - 20]
    if (!cum || !buyD) continue
    const i1 = idx.get(buyD), i2 = idx.get(cum)
    if (i1 === undefined || i2 === undefined) continue
    const ex = (st.bars[i2].c / st.bars[i1].c - 1) * 100 - (bench[bi.get(cum)].c / bench[bi.get(buyD)].c - 1) * 100
    rows.push({ code, kind, d: cum, ex, y: yutai.has(code) })
  }
}
rows.sort((a, b) => (a.d < b.d ? -1 : 1))
for (const r of rows) {
  const p = per(r.d)
  push(`${r.y ? '優待あり' : '優待なし'}・${r.kind}`, p, r.ex)
  push('全部', p, r.ex)
  const key = r.code + '|' + r.kind
  const h = (hist[key] ||= [])
  if (h.length >= 2) { const m = mean(h); push(m > 0 ? 'クセ：前の年までプラス' : 'クセ：前の年までマイナス', p, r.ex); if (h.length >= 3 && h.slice(-3).every(x => x > 0)) push('クセ：3年続けてプラス', p, r.ex) }
  h.push(r.ex)
}
console.log('A) 権利付最終日の20営業日前→権利付最終日（全体との差%）前半／後半／直近')
for (const [k, a] of Object.entries(G).sort()) console.log(`  ${k.padEnd(18)} ` + a.map(x => `${fmt(mean(x))}%(${x.length})`).join(' ／ '))
