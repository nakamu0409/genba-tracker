// 組み合わせの検証の2回目（2026-11-20。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_combo2.mjs
// 1) 業種ごと：急落の反発（B）・つられ下げ（A）を33業種で分ける（選ぶ・確かめるの両方で30件以上の業種だけ）
// 2) 売り方：B の持つ日数（3・5・10・20日）、利確 +5%・+10%（10日まで）、翌日の寄りで売る。A の 5・10・20日、利確 +5%・+10%
// 3) 決算の中身 × 急落（J-Quants の2年だけ。1年目／2年目）：直前（60日以内）の決算で通期の営業利益の予想を上げていたか・下げていたか
// TOPIX 連動ETF との差から往復 0.2% を引く。期間は study_patterns.mjs と同じ
import { readFileSync } from 'node:fs'

const R = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8'))
const A = '2021-11-19'
const BB = '2025-11-14'
const COST = 0.2
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
const f = v => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) : '  —  ')
const benchRaw = R('./bench1306.json')
const bench = []
for (const b of benchRaw) {
  const p = bench[bench.length - 1]
  if (p && (b.c / p.c > 1.3 || b.c / p.c < 0.7)) continue
  bench.push(b)
}
const bi = new Map(bench.map((b, i) => [b.date, i]))
const bGap = d => {
  const i = bi.get(d)
  return i > 0 ? (bench[i].o / bench[i - 1].c - 1) * 100 : null
}
const bTo = (d0, d1, fromOpen = true) => {
  if (!bi.has(d0) || !bi.has(d1)) return null
  const a = bench[bi.get(d0)]
  return (bench[bi.get(d1)].c / (fromOpen ? a.o : a.c) - 1) * 100
}
const master = R('../jq_master.json')
const S33 = {}
for (const x of master.first.concat(master.last)) S33[x.Code.slice(0, 4)] = x.S33Nm
// 決算：コード4桁 → [{date, rev(通期の営業利益の予想の変化%)}]
const fins = R('../jq_fins.json')
const finsBy = {}
{
  const all = []
  for (const list of Object.values(fins)) all.push(...list)
  all.sort((a, b) => (a.DiscDate + a.DiscTime).localeCompare(b.DiscDate + b.DiscTime))
  const lastF = {}
  for (const r of all) {
    const c = r.Code.slice(0, 4)
    const fop = r.FOP === '' ? null : Number(r.FOP)
    const k = c + '|' + r.CurFYSt
    const prev = lastF[k]
    if (fop !== null) lastF[k] = fop
    if (r.CurPerType === 'FY' && r.NxFOP && r.NxtFYSt) lastF[c + '|' + r.NxtFYSt] = Number(r.NxFOP)
    if (fop === null || prev === undefined || !prev) continue
    ;(finsBy[c] ||= []).push({ date: r.DiscDate, rev: (fop / prev - 1) * 100 * Math.sign(prev) })
  }
}

const GA = []
const GB = []
const wide = R('../wide.json')
for (const [code, w] of Object.entries(wide)) {
  const B = (w?.d || []).map(([date, o, h, l, c, v]) => ({ date, o, h, l, c, v })).filter(b => b.o > 0 && b.c > 0 && b.l > 0)
  if (B.length < 300) continue
  const n = B.length
  let st = 0
  let last = -99
  for (let i = 0; i < n; i++) {
    st += B[i].c * B[i].v
    if (i >= 20) st -= B[i - 20].c * B[i - 20].v
    if (i < 260 || i + 21 >= n || st / 20 < 1e8 || B[i - 1].c < 100) continue
    const ex = (e, h) => {
      const bm = bTo(B[e].date, B[e + h - 1].date)
      return bm === null ? null : (B[e + h - 1].c / B[e].o - 1) * 100 - bm
    }
    const tp = (e, pct, maxD) => {
      const entry = B[e].o
      for (let k = e; k < e + maxD; k++) {
        if (k > e && B[k].o >= entry * (1 + pct / 100)) return { k, px: B[k].o }
        if (B[k].h >= entry * (1 + pct / 100)) return { k, px: entry * (1 + pct / 100) }
      }
      return { k: e + maxD - 1, px: B[e + maxD - 1].c }
    }
    const exTp = (e, pct, maxD) => {
      const t = tp(e, pct, maxD)
      const bm = bTo(B[e].date, B[t.k].date)
      return bm === null ? null : (t.px / B[e].o - 1) * 100 - bm
    }
    const gap = (B[i].o / B[i - 1].c - 1) * 100
    const tg = bGap(B[i].date)
    if (gap <= -5 && tg !== null && tg <= -1.5 && B[i - 1].c >= 300) {
      GA.push({ date: B[i].date, sec: S33[code], h5: ex(i, 5), h10: ex(i, 10), h20: ex(i, 20), tp5: exTp(i, 5, 10), tp10: exTp(i, 10, 20) })
    }
    if (B[i].c / B[i - 5].c <= 0.85 && B[i].c >= 300) {
      const first = i - last > 10
      last = i
      if (!first) continue
      const e = i + 1
      if (B[e].h === B[e].l) continue
      const fb = (finsBy[code] || []).filter(x => x.date <= B[i].date && x.date >= B[Math.max(0, i - 60)].date).pop()
      const nm = bi.has(B[i].date) && bi.has(B[e].date) ? (B[e].o / B[i].c - 1) * 100 - (bench[bi.get(B[e].date)].o / bench[bi.get(B[i].date)].c - 1) * 100 : null
      GB.push({ date: B[i].date, sec: S33[code], h3: ex(e, 3), h5: ex(e, 5), h10: ex(e, 10), h20: ex(e, 20), tp5: exTp(e, 5, 10), tp10: exTp(e, 10, 10), nextOpen: nm, rev: fb ? fb.rev : null })
    }
  }
}
function judge(name, rows, key, a = A, b = BB, min = 50) {
  const z = rows.filter(r => r[key] !== null && r[key] !== undefined)
  const s1 = z.filter(r => r.date < a).map(r => r[key])
  const s2 = z.filter(r => r.date >= a && r.date < b).map(r => r[key])
  const s3 = z.filter(r => r.date >= b).map(r => r[key])
  const m = [mean(s1) - COST, mean(s2) - COST, mean(s3) - COST]
  let v
  if (s1.length >= min && s2.length >= min) v = m[0] > 0 && m[1] > 0 ? (s3.length >= 20 && m[2] > 0 ? '◎◎' : '◎') : mean(s1) < 0 && mean(s2) < 0 ? '×' : '△'
  else v = '少'
  console.log(`  ${name.padEnd(30)} ${String(z.length).padStart(5)}件  選ぶ${f(m[0])}（${s1.length}）  確かめる${f(m[1])}（${s2.length}）  最後${f(m[2])}（${s3.length}）  ${v}`)
  return { v, m }
}
console.log('■ 売り方：急落の反発（翌日の寄りで買う）')
judge('翌日の寄りで売る（買った日の寄り→翌朝ではなく、買う前の参考：合図の日の引け→翌日の寄り）', GB, 'nextOpen')
for (const k of ['h3', 'h5', 'h10', 'h20']) judge(`${k.slice(1)}日持つ`, GB, k)
judge('利確 +5%（10日まで）', GB, 'tp5')
judge('利確 +10%（10日まで）', GB, 'tp10')
console.log('\n■ 売り方：つられ下げ（その日の寄りで買う）')
for (const k of ['h5', 'h10', 'h20']) judge(`${k.slice(1)}日持つ`, GA, k)
judge('利確 +5%（10日まで）', GA, 'tp5')
judge('利確 +10%（20日まで）', GA, 'tp10')
console.log('\n■ 業種ごと：急落の反発（5日持つ。選ぶ・確かめるの両方で30件以上の業種）')
const secs = [...new Set(GB.map(r => r.sec).filter(Boolean))]
const okB = []
for (const s of secs) {
  const z = GB.filter(r => r.sec === s)
  if (z.filter(r => r.date < A).length < 30 || z.filter(r => r.date >= A && r.date < BB).length < 30) continue
  const r = judge(s, z, 'h5', A, BB, 30)
  okB.push([s, r])
}
console.log('\n■ 業種ごと：つられ下げ（10日持つ。選ぶ・確かめるの両方で30件以上の業種）')
for (const s of [...new Set(GA.map(r => r.sec).filter(Boolean))]) {
  const z = GA.filter(r => r.sec === s)
  if (z.filter(r => r.date < A).length < 30 || z.filter(r => r.date >= A && r.date < BB).length < 30) continue
  judge(s, z, 'h10', A, BB, 30)
}
console.log('\n■ 決算の中身 × 急落の反発（J-Quants の2年。1年目〜2025-08-27／2年目。5日持つ）')
const Y2 = '2025-08-28'
const J = GB.filter(r => r.date >= '2024-08-28')
judge('直前60日の決算で予想を上げていた（+5%以上）', J.filter(r => r.rev !== null && r.rev >= 5), 'h5', Y2, '9999', 15)
judge('ほぼ据え置き（±5%）', J.filter(r => r.rev !== null && Math.abs(r.rev) < 5), 'h5', Y2, '9999', 15)
judge('予想を下げていた（−5%以下）', J.filter(r => r.rev !== null && r.rev <= -5), 'h5', Y2, '9999', 15)
judge('直前60日に決算なし', J.filter(r => r.rev === null), 'h5', Y2, '9999', 15)
