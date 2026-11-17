// 年度の営業利益の増減（IR BANK）と、本決算の発表後の株価。約10年。
// 本決算の発表日は取れないので、「決算期末から47日後（発表の期限45日をすぎたころ）の最初の営業日の始値」で買う。
// 同じ日に買った全銘柄の平均との差（超過）で比べる。相場全体の上げ下げを取り除くため。
import { readFileSync } from 'node:fs'
const wide = JSON.parse(readFileSync(new URL('./wide.json', import.meta.url), 'utf-8'))
const ir = JSON.parse(readFileSync(new URL('./irbank.json', import.meta.url), 'utf-8'))
const SPLIT = '2021-07-01'
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0))
const entries = [] // {code, date, r20, r40, cls}
for (const [code, rows] of Object.entries(ir)) {
  const d = wide[code]?.d; if (!d || rows.length < 2) continue
  for (let k = 1; k < rows.length; k++) {
    const a = rows[k - 1], b = rows[k]
    if (a.op == null || b.op == null) continue
    const [y, m] = b.fy.split('-').map(Number), [py, pm] = a.fy.split('-').map(Number)
    if (y * 12 + m - (py * 12 + pm) !== 12) continue // 決算期の変更の年は外す
    const t = lastDay(y, m); t.setUTCDate(t.getUTCDate() + 47)
    const ds = t.toISOString().slice(0, 10)
    const e = d.findIndex(x => x[0] >= ds); if (e < 30 || e + 40 >= d.length) continue
    let to = 0; for (let j = e - 20; j < e; j++) to += d[j][5] * d[j][4]; if (to / 20 < 5e7) continue
    let cls
    if (a.op <= 0 && b.op > 0) cls = '黒字転換'
    else if (a.op > 0 && b.op <= 0) cls = '赤字転落'
    else if (a.op <= 0 && b.op <= 0) cls = b.op > a.op ? '赤字縮小' : '赤字拡大'
    else { const g = (b.op / a.op - 1) * 100; cls = g >= 30 ? '増益30%以上' : g >= 10 ? '増益10〜30%' : g >= 0 ? '増益0〜10%' : g >= -20 ? '減益0〜20%' : '減益20%以上' }
    const o = d[e][1]
    entries.push({ code, date: d[e][0], cls, r20: (d[e + 19][4] / o - 1) * 100, r40: (d[e + 39][4] / o - 1) * 100 })
  }
}
// 同じ日に買った全銘柄の平均との差
const byDate = {}; for (const x of entries) (byDate[x.date] ||= []).push(x)
for (const l of Object.values(byDate)) { const m20 = l.reduce((s, x) => s + x.r20, 0) / l.length, m40 = l.reduce((s, x) => s + x.r40, 0) / l.length; for (const x of l) { x.ex20 = x.r20 - m20; x.ex40 = x.r40 - m40; x.peers = l.length } }
const ok = entries.filter(x => x.peers >= 5)
const fm = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
const st = l => l.length ? `n=${String(l.length).padStart(4)} 超過20日${fm(l.reduce((s, x) => s + x.ex20, 0) / l.length).padStart(7)} 超過40日${fm(l.reduce((s, x) => s + x.ex40, 0) / l.length).padStart(7)} 超過がプラス${(l.filter(x => x.ex40 > 0).length / l.length * 100).toFixed(0)}%` : 'n=0'
console.log('銘柄', Object.keys(ir).filter(c => ir[c].length).length, '件', ok.length, '期間', ok.map(x => x.date).sort()[0], '〜', ok.map(x => x.date).sort().at(-1))
for (const c of ['黒字転換', '増益30%以上', '増益10〜30%', '増益0〜10%', '減益0〜20%', '減益20%以上', '赤字転落', '赤字縮小', '赤字拡大']) {
  const l = ok.filter(x => x.cls === c)
  console.log(c.padEnd(10), '前半', st(l.filter(x => x.date < SPLIT)), '| 後半', st(l.filter(x => x.date >= SPLIT)))
}
const good = ok.filter(x => ['黒字転換', '増益30%以上', '増益10〜30%'].includes(x.cls)), bad = ok.filter(x => ['減益20%以上', '赤字転落', '赤字拡大'].includes(x.cls))
console.log('--- 年ごと（良い：黒字転換・増益10%以上 / 悪い：減益20%以上・赤字転落・赤字拡大。超過40日）')
const av = l => l.length ? fm(l.reduce((s, x) => s + x.ex40, 0) / l.length) : '-'
for (let yy = 2016; yy <= 2026; yy++) { const f = x => x.date.startsWith(yy); console.log(' ', yy, '良い', String(good.filter(f).length).padStart(4), av(good.filter(f)).padStart(7), '| 悪い', String(bad.filter(f).length).padStart(4), av(bad.filter(f)).padStart(7)) }
