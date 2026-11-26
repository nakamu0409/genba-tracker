// 点検：これまでの検証に「実際には買えなかった日」（ストップ高・安に張り付き／ストップ高で寄った）が混ざって、結論を変えていないか
import { readFileSync } from 'node:fs'
const SPLIT = '2022-01-01'
const fm = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
const av = l => l.length ? l.reduce((s, x) => s + x.r, 0) / l.length : NaN
const st = l => `n=${String(l.length).padStart(5)} 平均${fm(av(l)).padStart(7)} 勝率${(l.filter(x => x.r > 0).length / (l.length || 1) * 100).toFixed(0)}%`
// A. 約1,400銘柄・10年：好材料の窓開け（study6）と基準。買う日の足が張り付き・高値寄りかで分ける
{
  const data = JSON.parse(readFileSync(new URL('./wide.json', import.meta.url), 'utf-8'))
  const HOLD = 40; const gaps = [], base = []
  for (const { d } of Object.values(data)) {
    let atr = null; const tr = []
    for (let i = 1; i < d.length - 1; i++) {
      const t = Math.max(d[i][2] - d[i][3], Math.abs(d[i][2] - d[i - 1][4]), Math.abs(d[i][3] - d[i - 1][4])); tr.push(t)
      atr = atr === null ? (tr.length === 14 ? tr.reduce((a, b) => a + b, 0) / 14 : null) : (atr * 13 + t) / 14
      if (i < 260 || atr === null) continue
      const [date, o, h, l, c, v] = d[i]; const pc = d[i - 1][4]
      let va = 0, to = 0; for (let k = i - 20; k < i; k++) { va += d[k][5]; to += d[k][5] * d[k][4] } va /= 20; to /= 20
      if (to < 5e7) continue
      const e = d[i + 1]; if (!e || e[1] > c * 1.02) continue
      const stop = c - 2 * atr; if (e[1] <= stop) continue
      let r = null
      for (let k = i + 1; k <= Math.min(i + HOLD, d.length - 1); k++) { if (d[k][3] <= stop) { r = (Math.min(d[k][1], stop) / e[1] - 1) * 100; break } if (k === i + HOLD || k === d.length - 1) r = (d[k][4] / e[1] - 1) * 100 }
      if (r === null) continue
      const stuck = e[2] - e[3] <= e[2] * 0.002, openHigh = e[1] >= e[2] * 0.999
      const rec = { date, r, stuck, openHigh }
      if (i % 10 === 0) base.push(rec)
      if ((o / pc - 1) * 100 >= 2 && c > o && h > l && (c - l) / (h - l) >= 0.6 && v >= 2 * va) gaps.push(rec)
    }
  }
  console.log('A. 約1,400銘柄・10年（買うのは翌日の始値。翌日の始値が終値+2%超なら買わない）')
  for (const [nm, l] of [['基準', base], ['窓開け', gaps]]) {
    console.log(`  ${nm}：張り付き ${l.filter(x => x.stuck).length}件、高値寄り ${l.filter(x => !x.stuck && x.openHigh).length}件 / 全${l.length}件`)
    const ok = l.filter(x => !x.stuck && !x.openHigh)
    console.log('    すべて       前半', st(l.filter(x => x.date < SPLIT)), '| 後半', st(l.filter(x => x.date >= SPLIT)))
    console.log('    買えたものだけ 前半', st(ok.filter(x => x.date < SPLIT)), '| 後半', st(ok.filter(x => x.date >= SPLIT)))
  }
}
// B. 昼の急騰・急落株（1時間足・3年）：後場の始値で買う。後場の値幅が0（張り付き）のものはいくつあるか
{
  const intr = JSON.parse(readFileSync(new URL('./day/intraday.json', import.meta.url), 'utf-8'))
  let up = 0, upStuck = 0, dn = 0, dnStuck = 0
  for (const d of Object.values(intr)) for (let i = 21; i < d.length; i++) {
    const [, , , , mc, , ao, ah, al] = d[i]; const prev = d[i - 1][9]; if (!(prev > 0) || !(ao > 0)) continue
    const g = (mc / prev - 1) * 100
    const stuck = ah - al <= ah * 0.002
    if (g >= 5) { up++; if (stuck) upStuck++ } else if (g <= -5) { dn++; if (stuck) dnStuck++ }
  }
  console.log(`B. 昼の急騰株 ${up}件のうち後場ずっと張り付き ${upStuck}件（${(upStuck / up * 100).toFixed(1)}%）、急落株 ${dn}件のうち ${dnStuck}件（${(dnStuck / dn * 100).toFixed(1)}%）`)
}
// C. 大型株中心の約170銘柄（買い候補の判定・追跡の土台）：翌日の足が張り付き・高値寄りの日の割合
{
  const { stocks } = JSON.parse(readFileSync(new URL('./bars.json', import.meta.url), 'utf-8'))
  let n = 0, s = 0, oh = 0
  for (const bars of Object.values(stocks)) for (const b of bars) { n++; if (b.h - b.l <= b.h * 0.002) s++; else if (b.o >= b.h * 0.999) oh++ }
  console.log(`C. 約170銘柄の日足 ${n}本のうち、張り付き ${s}本（${(s / n * 100).toFixed(2)}%）、高値寄り ${oh}本（${(oh / n * 100).toFixed(1)}%）`)
}
