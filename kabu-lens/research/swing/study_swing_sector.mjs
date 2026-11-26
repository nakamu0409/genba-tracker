// スイング：業種の強さ・市場の区分・規模で成績が変わるか（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_swing_sector.mjs
// 業種などは J-Quants の銘柄一覧（2024-08-28 時点の区分を全期間に当てる。途中で変わった銘柄は少しずれる）
// 今の決まり（3R・40日・終値+2%以内・避ける形は外した候補）。平均R を選ぶ／確かめる／最後の確認で
// 分け方（先に決めた）：
//   ① その株の業種（17業種）の20日の騰落の順位（その日の17業種の中で 上位3／真ん中／下位3）。業種の騰落は、手元の銘柄の単純平均
//   ② その株の20日の騰落 − 業種の20日の騰落（業種の中で強いか）：5つに分ける
//   ③ 市場の区分（プライム／スタンダード／グロース）、規模（TOPIX の Core30・Large70・Mid400・Small1・Small2・それ以外）、貸借銘柄か
//   ④ 業種ごと（参考。17業種それぞれの平均R）
import { readFileSync } from 'node:fs'
import { loadAll, simulate, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const master = JSON.parse(readFileSync(new URL('../jq_master.json', import.meta.url), 'utf-8'))
const list = Array.isArray(master) ? master : Object.values(master).flat()
const info = {}
for (const m of list) if (m?.Code) info[m.Code.slice(0, 4)] = m
const D = loadAll()
const { stocks } = D
// 業種ごと・日付ごとの20日の騰落の平均
const sum = new Map()
for (const st of Object.values(stocks)) {
  const m = info[st.code]
  if (!m || m.S17 === '99') continue
  const B = st.bars
  for (let i = 20; i < B.length; i++) {
    const r = (B[i].c / B[i - 20].c - 1) * 100
    if (!Number.isFinite(r) || Math.abs(r) > 200) continue
    const key = B[i].date
    let o = sum.get(key)
    if (!o) sum.set(key, (o = {}))
    const x = (o[m.S17] ||= [0, 0])
    x[0] += r
    x[1]++
  }
}
const rows = []
for (const s of D.swing) {
  const m = info[s.code]
  if (!m) continue
  const B = stocks[s.code].bars
  if (s.i < 20) continue
  const t = simulate(B, s.i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
  if (!t) continue
  const o = sum.get(s.date)
  let rank = null
  let secR = null
  if (o && o[m.S17] && o[m.S17][1] >= 5) {
    const avgs = Object.entries(o).filter(([, x]) => x[1] >= 5).map(([k, x]) => [k, x[0] / x[1]]).sort((a, b) => b[1] - a[1])
    const pos = avgs.findIndex(([k]) => k === m.S17)
    rank = pos < 3 ? '上位3' : pos >= avgs.length - 3 ? '下位3' : '真ん中'
    secR = o[m.S17][0] / o[m.S17][1]
  }
  rows.push({
    date: s.date, r: t.r, rank,
    inSec: secR === null ? null : (B[s.i].c / B[s.i - 20].c - 1) * 100 - secR,
    mkt: m.MktNm, scale: m.ScaleCat, mrgn: m.MrgnNm, sec: m.S17Nm
  })
}
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
const line = (n, z) => console.log(`  ${n.padEnd(16)} ${[0, 1, 2].map(p => { const a = z.filter(r => per(r) === p).map(r => r.r); return `${fmt(mean(a), 3)}(${a.length})` }).join('  ')}`)
console.log(`候補 ${rows.length}件（業種の分かる銘柄）。平均R（選ぶ／確かめる／最後の確認）`)
line('全部', rows)
console.log('\n■ ① 業種の20日の騰落の順位')
for (const g of ['上位3', '真ん中', '下位3']) line(g, rows.filter(r => r.rank === g))
console.log('\n■ ② 業種の中での強さ（その株の20日 − 業種の20日。境目は選ぶ期間）')
const z2 = rows.filter(r => r.inSec !== null)
const tr = z2.filter(r => per(r) === 0).map(r => r.inSec).sort((a, b) => a - b)
const cut = [0.2, 0.4, 0.6, 0.8].map(q => tr[Math.floor(tr.length * q)])
console.log(`  境目 ${cut.map(c => c.toFixed(1)).join(' / ')}`)
for (let b = 0; b < 5; b++) line(['いちばん弱い', '弱い', '真ん中', '強い', 'いちばん強い'][b], z2.filter(r => cut.filter(c => r.inSec > c).length === b))
console.log('\n■ ③ 市場の区分・規模・貸借')
for (const g of ['プライム', 'スタンダード', 'グロース']) line(g, rows.filter(r => r.mkt === g))
for (const g of ['TOPIX Core30', 'TOPIX Large70', 'TOPIX Mid400', 'TOPIX Small 1', 'TOPIX Small 2', '-']) line(g === '-' ? 'TOPIX 以外' : g, rows.filter(r => r.scale === g))
for (const g of ['貸借', '信用']) line(g + '銘柄', rows.filter(r => r.mrgn === g))
console.log('\n■ ④ 業種ごと（参考）')
const secs = [...new Set(rows.map(r => r.sec))].sort()
for (const g of secs) line(g, rows.filter(r => r.sec === g))
