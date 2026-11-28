// 増配を中身で分ける（11/28 本人の希望：自社株買いで目的が効いたので、増配も中身を見る）
// 題名（irevents.json・irevents2.json）で分ける：once＝記念配当・特別配当（1回だけ）、regular＝それ以外の増配（普通配当を増やす）、progressive＝累進配当・配当方針を一緒に出したもの
// 翌朝の寄指（終値×1.02／1.04）で買えた日の寄り→引け（全体との差）と、1回あたり（買えない日は0）、週末をはさむか。期間：前半／後半／直近
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
const BB = '2025-11-14', per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const T = {}
for (const f of ['../irevents.json', '../irevents2.json']) { try { for (const [c, l] of Object.entries(JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf-8')))) for (const r of l || []) (T[`${c}|${r.date}`] ||= []).push(r.title) } catch {} }
const { stocks, bench, events } = loadAll({ withSwing: false, withSmall: true })
const bi = new Map(bench.map((b, i) => [b.date, i]))
const G = {}
const add = (g, p, k, v) => (((G[g] ||= {})[k] ||= [[], [], []])[p].push(v))
for (const e of events.filter(e => e.kind === 'divup')) {
  const ts = (T[`${e.code}|${e.date}`] || []).join(' ')
  const kind = /記念|特別/.test(ts) ? 'once（記念・特別）' : /累進|配当方針|株主還元方針/.test(ts) ? 'progressive（累進・方針も）' : 'regular（普通の増配）'
  const B = stocks[e.code].bars, c = B[e.i], x = B[e.i + 1]; if (!x || x.h === x.l) continue
  const k = bi.get(x.date); if (k === undefined) continue
  const p = per(e.date), oc = (x.c / x.o - 1) * 100 - (bench[k].c / bench[k].o - 1) * 100
  const wk = (new Date(x.date) - new Date(c.date)) / 864e5 >= 3 ? '週末をはさむ' : '平日'
  for (const g of ['全部', kind, kind + '・' + wk]) {
    add(g, p, '窓', (x.o / c.c - 1) * 100)
    for (const L of [1.02, 1.04]) { const f = x.o <= c.c * L; add(g, p, `寄指×${L}・1回あたり`, f ? oc : 0); if (f) add(g, p, `寄指×${L}・買えた日`, oc) }
  }
}
for (const g of Object.keys(G).sort()) { console.log(`■ ${g}（${G[g]['窓'].map(a => a.length).join('／')}）`); for (const [k, a] of Object.entries(G[g])) console.log(`  ${k.padEnd(18)} ${a.map(x => fmt(mean(x))).join(' ／ ')}`) }
