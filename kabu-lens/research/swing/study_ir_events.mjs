// 本人の希望（11/25）：IR情報で買う形を広げる。企業の行動と同じ形で確かめる（先に比べ方を決める）
// 使い方: node study_ir_events.mjs [kinds...]   kinds: yutai（株主優待の新設・導入）、divpolicy（累進配当・配当方針）、alliance（業務提携・資本提携）、order（受注）、midplan（中期経営計画）、tob（当社株式への公開買付け＝買われる側）
// データ：../irevents.json・../irevents2.json（優待・配当）、../irevents_more.json（提携・受注・中計・TOB。fetch_irevents_more.mjs）
// 発表の時刻で分ける：引け後（15:00以降）／場中（9:00〜15:00）。どちらも次の営業日の寄りで買う：
//   A) 寄り→引け（全体との差%。寄指＝前の日の終値×1.02以下で買えた日だけ）、B) 寄り→5営業日目の引け（同じ）、買えた割合、寄りの窓（前の日の終値→寄り%）
// 同じ日に決算短信が出ている会社（irhist.json にある約700銘柄だけ分かる）は「決算と同じ日」として別に数える。期間：前半／後半／直近
// 結果（11/25。前半／後半／直近）：
//  yutai（優待の新設）：引け後の発表は翌朝の窓が +4.8／+5.8／+3.5% と大きく、寄指で買えるのは3〜5割。買えた日は 寄り→引け −0.76／−1.18／+0.26%、5日 −0.29／−1.39／−0.22%。場中の発表も −0.93／−0.39／−0.10% → 上げは寄りで終わっている（採らない）
//  divpolicy（累進配当・配当方針）：引け後（決算と別の日）寄り→引け −0.05／−0.11／+0.36%、5日 −0.39／−0.96／+0.24% → 採らない。
//    ただし「決算と同じ日の引け後に配当方針も出した会社」は 寄り→引け +1.60／+0.14／+1.32%、5日 +2.40／+1.45／+1.51%（10／31／13回。約700銘柄しか決算の日が分からない）。数が少ないので、決算の日を全部の銘柄でそろえてから確かめ直す候補
//    全銘柄の決算の日（IRH_ALL=1・irhist_all.json）で数え直すと、引け後・決算と同じ日：寄り→引け +1.38／+0.09／+1.77%、5日 +1.94／+0.05／+3.34%（24／59／24回）→ 後半がほぼ0で3つの期間がそろわない（採らない）
//  alliance（業務提携・資本提携）：引け後 寄り→引け −0.05／−0.08／−0.16%、5日 −0.08／−0.35／+0.05%。場中も −0.22／−0.34／−0.39% → 採らない
//  order（受注）：引け後 寄り→引け +0.25／+0.51／+0.33%（137／84／30回。3つともプラス）、5日 +0.65／+1.33／−2.47%（直近が逆）。寄指で買えるのは5〜7割 → 1日で売る形は企業の行動（増配 +0.37%）と同じくらい。口座全体で確かめる候補
//  midplan（中期経営計画）：引け後 寄り→引け +0.20／−0.38／−0.51%、5日 +0.34／−0.48／−0.88% → 採らない
//  uprev（上方修正。題名に「上方修正」とあるものだけ。irhist_all.json、10年で約300件・2020年より前は少ない）：引け後の発表は翌朝の窓が +5.3／+4.5／+3.0% で、寄指（+2%）で買えるのは3〜5割。買えた日は 寄り→引け −0.21／+0.34／+0.17%、5日 −2.02／−0.54／−0.14% → 採らない。
//    寄指をやめて寄りで必ず買う（NOLIM=1）と 引け後は 5日 −3.25／−1.08／−0.09% でもっと悪い。場中（決算と同じ日）だけ 寄り→引け +0.79／+1.58／+1.42%、5日 +4.95／+3.25／+2.95%（7／26／22回）と3つともプラス → 数が少ない。件数がたまってから口座全体で確かめる候補
//  tob（買われる側の賛同）：引け後 11／5／4回と少ない（TOB のあと上場をやめた会社は手元の日足に無いことが多い）→ 判断できない
import { readFileSync, existsSync } from 'node:fs'
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
const BB = '2025-11-14', per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const R = f => { const u = new URL(f, import.meta.url); return existsSync(u) ? JSON.parse(readFileSync(u, 'utf-8')) : {} }
const KINDS = {
  yutai: t => /株主優待/.test(t) && /(新設|導入)/.test(t) && !/(廃止|訂正|変更)/.test(t),
  divpolicy: t => /(累進配当|配当方針)/.test(t) && !/訂正/.test(t),
  alliance: t => /(業務提携|資本提携)/.test(t) && !/(解消|訂正|終了)/.test(t),
  order: t => /受注/.test(t) && !/(訂正|損失|取消)/.test(t),
  midplan: t => /中期経営計画/.test(t) && !/(訂正|取り下げ|撤回)/.test(t),
  uprev: t => /上方修正/.test(t) && !/訂正/.test(t),
  tob: t => /当社株式.*公開買付/.test(t) && /(賛同|意見表明)/.test(t) && !/(結果|訂正|撤回)/.test(t)
}
const want = process.argv.slice(2).length ? process.argv.slice(2) : ['yutai', 'divpolicy']
const src = {}
for (const f of ['../irevents.json', '../irevents2.json', '../irevents_more.json']) for (const [c, v] of Object.entries(R(f))) for (const r of v || []) (src[c] ||= []).push(r)
const H = R(process.env.IRH_ALL ? '../irhist_all.json' : '../irhist.json')
// uprev（11/25）：上方修正は決算の開示の一覧（irhist_all.json）にしか無いので、そこからも足す
if (want.includes('uprev')) for (const [c, v] of Object.entries(H)) for (const r of v || []) (src[c] ||= []).push(r)
const kessanDay = new Set(); for (const [c, v] of Object.entries(H)) for (const r of v || []) if (['1Q', '2Q', '3Q', '通期'].includes(r.kind)) kessanDay.add(c + '|' + r.date)
const { stocks, bench } = loadAll({ withSwing: false, withSmall: true })
const bi = new Map(bench.map((b, i) => [b.date, i]))
for (const k of want) {
  const G = {}
  const push = (g, p, v) => ((G[g] ||= [[], [], []])[p].push(v))
  const seen = new Set()
  for (const [c, rows] of Object.entries(src)) {
    const st = stocks[c]; if (!st) continue
    const B = st.bars
    for (const r of rows) {
      if (!KINDS[k](r.title || '')) continue
      const key = c + '|' + r.date; if (seen.has(key)) continue; seen.add(key)
      const after = (r.time || '15:00') >= '15:00'
      let i = B.findIndex(b => b.date > r.date); if (i < 1) continue
      // 場中の発表はその日の寄りより後なので、買うのは次の営業日。基準は発表日の終値（B[i-1] が発表日以前の最後の日）
      const prev = B[i - 1], x = B[i]; if (!x || x.h === x.l) continue
      const k0 = bi.get(x.date); if (k0 === undefined) continue
      const p = per(r.date), tag = (after ? '引け後' : '場中') + (kessanDay.has(key) ? '・決算と同じ日' : '')
      push(tag + '・寄りの窓%', p, (x.o / prev.c - 1) * 100)
      const filled = process.env.NOLIM ? true : x.o <= prev.c * 1.02
      push(tag + '・買えた割合%', p, filled ? 100 : 0)
      if (!filled) continue
      push(tag + '・A 寄り→引け', p, (x.c / x.o - 1) * 100 - (bench[k0].c / bench[k0].o - 1) * 100)
      const y = B[i + 4], k5 = y && bi.get(y.date)
      if (y && k5 !== undefined) push(tag + '・B 5日', p, (y.c / x.o - 1) * 100 - (bench[k5].c / bench[k0].o - 1) * 100)
    }
  }
  console.log(`\n■ ${k}（前半／後半／直近。件数）`)
  for (const [g, a] of Object.entries(G).sort()) console.log(`  ${g.padEnd(24)} ` + a.map(x => `${fmt(mean(x))}(${x.length})`).join(' ／ '))
}
