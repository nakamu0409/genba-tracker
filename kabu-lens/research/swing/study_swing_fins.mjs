// スイング：会社の数字（2年分の J-Quants の決算のまとめ）で候補の成績が分かれるか（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_swing_fins.mjs
// 合図の日より前に開示された一番新しい決算のまとめを使う（その日の開示は使わない）
// 分け方（先に決めた）：予想PER（終値 ÷ 予想EPS。赤字予想は別）、PBR（終値 ÷ BPS）、自己資本比率、予想配当利回り、予想の営業利益が黒字か赤字か
// 今の決まり（3R・40日・終値+2%以内・避ける形は外した候補）の平均R。前半（〜2025-08-27）・後半
import { readFileSync } from 'node:fs'
import { loadAll, simulate, mean, fmt } from './lib_signals.mjs'

const SPLIT = '2025-08-28'
const fins = JSON.parse(readFileSync(new URL('../jq_fins.json', import.meta.url), 'utf-8'))
const num = v => (v === '' || v === null || v === undefined || !Number.isFinite(+v) ? null : +v)
const byCode = {}
for (const list of Object.values(fins)) for (const r of list) (byCode[r.Code.slice(0, 4)] ||= []).push(r)
for (const l of Object.values(byCode)) l.sort((a, b) => a.DiscDate.localeCompare(b.DiscDate))
const D = loadAll()
const { stocks } = D
const rows = []
for (const s of D.swing) {
  const l = byCode[s.code]
  if (!l || s.date < '2024-09-01') continue
  // 一番新しい「決算短信」（予想だけの開示は数字が欠けるので、値ごとに最後に分かっているものを使う）
  let feps = null, bps = null, eqar = null, fdiv = null, fop = null
  let yoy = null, prog = null
  for (const r of l) {
    if (r.DiscDate >= s.date) break
    if (num(r.FEPS) !== null) feps = num(r.FEPS)
    if (num(r.NxFEPS) !== null && /^FY/.test(r.CurPerType)) feps = num(r.NxFEPS)
    if (num(r.BPS) !== null) bps = num(r.BPS)
    if (num(r.EqAR) !== null) eqar = num(r.EqAR) * (num(r.EqAR) <= 1 ? 100 : 1)
    if (num(r.FDivAnn) !== null) fdiv = num(r.FDivAnn)
    if (num(r.NxFDivAnn) !== null && /^FY/.test(r.CurPerType)) fdiv = num(r.NxFDivAnn)
    if (num(r.FOP) !== null) fop = num(r.FOP)
    if (num(r.NxFOP) !== null && /^FY/.test(r.CurPerType)) fop = num(r.NxFOP)
    if (/FinancialStatements/.test(r.DocType) && num(r.OP) !== null) {
      const py = l.find(x => x.CurPerType === r.CurPerType && /FinancialStatements/.test(x.DocType) && x.CurFYSt && r.CurFYSt && Math.abs(new Date(r.CurFYSt) - new Date(x.CurFYSt) - 365 * 864e5) < 40 * 864e5)
      const pop = py ? num(py.OP) : null
      yoy = pop !== null && pop > 0 ? (num(r.OP) / pop - 1) * 100 : null
      const std = { '1Q': 25, '2Q': 50, '3Q': 75 }[r.CurPerType]
      prog = std && num(r.FOP) > 0 ? num(r.OP) / num(r.FOP) * 100 - std : null
    }
  }
  const B = stocks[s.code].bars
  const t = simulate(B, s.i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
  if (!t) continue
  const c = B[s.i].c
  rows.push({
    date: s.date, r: t.r,
    per: feps !== null && feps > 0 ? c / feps : feps !== null ? -1 : null,
    pbr: bps !== null && bps > 0 ? c / bps : null,
    eqar, yld: fdiv !== null ? fdiv / c * 100 : null, fop, low: c < 1500, yoy, prog
  })
}
const half = r => (r.date < SPLIT ? 0 : 1)
const line = (n, z) => console.log(`  ${n.padEnd(18)} ${[0, 1].map(h => { const a = z.filter(r => half(r) === h).map(r => r.r); return `${fmt(mean(a), 3)}(${a.length})` }).join('  ')}`)
console.log(`候補 ${rows.length}件（2024-09 以降・数字の分かるもの）。平均R（前半／後半）`)
line('全部', rows)
console.log('■ 予想PER')
line('赤字予想', rows.filter(r => r.per === -1))
for (const [n, a, b] of [['10倍未満', 0, 10], ['10〜15倍', 10, 15], ['15〜25倍', 15, 25], ['25〜50倍', 25, 50], ['50倍以上', 50, 1e9]]) line(n, rows.filter(r => r.per !== null && r.per > a && r.per >= a && r.per < b && r.per !== -1))
console.log('■ PBR')
for (const [n, a, b] of [['1倍未満', 0, 1], ['1〜2倍', 1, 2], ['2〜4倍', 2, 4], ['4倍以上', 4, 1e9]]) line(n, rows.filter(r => r.pbr !== null && r.pbr >= a && r.pbr < b))
console.log('■ 自己資本比率')
for (const [n, a, b] of [['30%未満', -1e9, 30], ['30〜50%', 30, 50], ['50〜70%', 50, 70], ['70%以上', 70, 1e9]]) line(n, rows.filter(r => r.eqar !== null && r.eqar >= a && r.eqar < b))
console.log('■ 予想配当利回り')
for (const [n, a, b] of [['無配', -1, 0.01], ['0〜2%', 0.01, 2], ['2〜3.5%', 2, 3.5], ['3.5%以上', 3.5, 1e9]]) line(n, rows.filter(r => r.yld !== null && r.yld >= a && r.yld < b))
console.log('■ 予想の営業利益')
line('黒字', rows.filter(r => r.fop !== null && r.fop > 0))
line('赤字', rows.filter(r => r.fop !== null && r.fop <= 0))
console.log('■ 半年ごと：PBR 1倍未満 − PBR 2倍以上 の平均Rの差、PER 15倍未満 − 25倍以上')
const q = r => r.date.slice(0, 4) + (r.date.slice(5, 7) <= '06' ? '前' : '後')
for (const k of [...new Set(rows.map(q))].sort()) {
  const z = rows.filter(r => q(r) === k)
  const m = f => mean(z.filter(f).map(r => r.r))
  console.log(`  ${k}  PBR差 ${fmt(m(r => r.pbr !== null && r.pbr < 1) - m(r => r.pbr !== null && r.pbr >= 2), 3)}  PER差 ${fmt(m(r => r.per > 0 && r.per < 15) - m(r => r.per >= 25), 3)}  （${z.length}件）`)
}
console.log('■ 株価 × PBR（前半／後半）')
for (const [pn, pf] of [['1,500円未満', r => r.low], ['1,500円以上', r => !r.low]]) {
  line(pn + '・PBR1倍未満', rows.filter(r => pf(r) && r.pbr !== null && r.pbr < 1))
  line(pn + '・PBR1〜2倍', rows.filter(r => pf(r) && r.pbr !== null && r.pbr >= 1 && r.pbr < 2))
  line(pn + '・PBR2倍以上', rows.filter(r => pf(r) && r.pbr !== null && r.pbr >= 2))
}
console.log('■ 直近の決算の営業利益の前年比')
for (const [n, a, b] of [['−20%未満', -1e9, -20], ['−20〜0%', -20, 0], ['0〜+20%', 0, 20], ['+20〜+50%', 20, 50], ['+50%以上', 50, 1e9]]) line(n, rows.filter(r => r.yoy !== null && r.yoy >= a && r.yoy < b))
console.log('■ 通期予想に対する進み具合（ふつうとの差）')
for (const [n, a, b] of [['−10pt未満', -1e9, -10], ['−10〜0', -10, 0], ['0〜+10', 0, 10], ['+10pt以上', 10, 1e9]]) line(n, rows.filter(r => r.prog !== null && r.prog >= a && r.prog < b))
