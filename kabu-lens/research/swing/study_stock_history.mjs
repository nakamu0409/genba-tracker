// 本人の考え（11/25）：その株の今までの推移（クセ）から分かることがあるのでは
// 1) スイングの候補：同じ株の「前に出た候補の成績」（その日までに決着した分だけ。3R・40日）で分ける：前の候補なし／3回以上で平均R −0.3未満／−0.3〜+0.3／+0.3より上
// 2) スイングの候補：その株の過去250日の値動きのクセ（日々の騰落の、前の日との相関。プラス＝続きやすい・マイナス＝戻しやすい）で3つに分ける
// 3) 企業の行動（自社株買い・増配。翌日の寄指→引けの全体比）：同じ株の前の企業の行動の翌日の成績で分ける：前なし／前がプラス／前がマイナス
// 期間：前半／後半／直近
// 結果（11/25。前半／後半／直近）：1) 前の候補の成績で分けても順番がそろわない（+0.3R より上 +0.01／+0.04／+0.29R、−0.3 未満 +0.04／+0.09／+0.16R）。
//   2) 値動きのクセは期間で逆になる（戻しやすい −0.17／+0.12／+0.39R、続きやすい −0.01／+0.04／−0.08R）。
//   3) 企業の行動：前の翌日がプラス +0.55／+0.34／+0.77%、マイナス −0.31／+0.53／+0.35%、前なし +0.46／+0.33／+0.77%。3つとも使える差は無い（採らない）
import { loadAll, simulate, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
const BB = '2025-11-14', per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const D = loadAll({ withSmall: true })
const { stocks, bench, swing } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const show = (title, G, u) => { console.log(`\n■ ${title}`); for (const [k, a] of Object.entries(G)) console.log(`  ${k.padEnd(20)} ` + a.map(x => `${fmt(mean(x))}${u}(${x.length})`).join(' ／ ')) }
// 1) と 2)
const byCode = {}
for (const s of swing) (byCode[s.code] ||= []).push(s)
const G1 = { 前の候補なし: [[], [], []], '3回以上・平均R −0.3未満': [[], [], []], '3回以上・−0.3〜+0.3': [[], [], []], '3回以上・+0.3より上': [[], [], []], '1〜2回だけ': [[], [], []] }
const G2 = { 戻しやすい3分の1: [[], [], []], 真ん中: [[], [], []], 続きやすい3分の1: [[], [], []] }
const ac = []
for (const [c, list] of Object.entries(byCode)) {
  const B = stocks[c].bars
  list.sort((a, b) => a.i - b.i)
  const done = []
  for (const s of list) {
    const r = simulate(B, s.i, s.stop); if (!r) continue
    const p = per(s.date)
    const known = done.filter(x => x.xDate <= s.date)
    const m = mean(known.map(x => x.r))
    const k = known.length === 0 ? '前の候補なし' : known.length < 3 ? '1〜2回だけ' : m < -0.3 ? '3回以上・平均R −0.3未満' : m <= 0.3 ? '3回以上・−0.3〜+0.3' : '3回以上・+0.3より上'
    G1[k][p].push(r.r)
    done.push({ r: r.r, xDate: B[r.x].date })
    if (s.i > 251) {
      const rs = []; for (let j = s.i - 249; j <= s.i; j++) rs.push(B[j].c / B[j - 1].c - 1)
      const mu = mean(rs); let num = 0, den = 0
      for (let j = 1; j < rs.length; j++) num += (rs[j] - mu) * (rs[j - 1] - mu)
      for (const x of rs) den += (x - mu) ** 2
      ac.push({ a: num / den, p, r: r.r })
    }
  }
}
const sorted = ac.map(x => x.a).sort((a, b) => a - b), t1 = sorted[Math.floor(sorted.length / 3)], t2 = sorted[Math.floor(sorted.length * 2 / 3)]
for (const x of ac) G2[x.a < t1 ? '戻しやすい3分の1' : x.a < t2 ? '真ん中' : '続きやすい3分の1'][x.p].push(x.r)
show('1) スイングの候補 × 同じ株の前の候補の成績（平均R）前半／後半／直近', G1, 'R')
show(`2) スイングの候補 × その株の値動きのクセ（相関 ${t1.toFixed(3)}／${t2.toFixed(3)} で分ける）`, G2, 'R')
// 3)
const G3 = { 前の企業の行動なし: [[], [], []], 前の翌日がプラス: [[], [], []], 前の翌日がマイナス: [[], [], []] }
const last = {}
const evs = D.events.filter(e => e.kind === 'buyback' || e.kind === 'divup').sort((a, b) => (a.date < b.date ? -1 : 1))
for (const e of evs) {
  const B = stocks[e.code]?.bars; if (!B) continue
  const x = B[e.i + 1]; if (!x) continue
  const k = bi.get(x.date); if (k === undefined) continue
  const ex = (x.c / x.o - 1) * 100 - (bench[k].c / bench[k].o - 1) * 100
  const prev = last[e.code]
  if (x.o <= e.limit) G3[!prev ? '前の企業の行動なし' : prev > 0 ? '前の翌日がプラス' : '前の翌日がマイナス'][per(e.date)].push(ex)
  last[e.code] = ex
}
show('3) 企業の行動（寄指で買えた日。寄り→引けの全体比%）× 同じ株の前の企業の行動の翌日', G3, '%')
