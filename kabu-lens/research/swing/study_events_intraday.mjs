// 企業の行動（自社株買い〈良い条件1つ以上〉・増配）の翌日：寄りで買って何時に売るか、場中の損切りを入れるか（60分足・約2年。2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_events_intraday.mjs
// 60分足は research/day/hour.json（9:00・10:00・11:00・12:30・13:00・14:00・15:00 の足。分の数＝その足の始まり）
// 売る時：10:00／11:00／前場の引け／13:00／14:00／大引け（今）。各足の終値で売ったとする
// 損切り：寄値から −2%・−3%・−5% に届いたらそこで売る（届かなければ大引け）。足の安値で判定
// TOPIX は引かない（そのままの%）。手数料 0.2% を引く。前半（〜2025-05-31）／後半
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt } from './lib_signals.mjs'

const hour = JSON.parse(readFileSync(new URL('../day/hour.json', import.meta.url), 'utf-8'))
const D = loadAll({ withSwing: false })
const { stocks } = D
const rows = []
for (const e of D.events) {
  if (e.kind === 'split' || (e.kind === 'buyback' && !(e.score >= 1))) continue
  const B = stocks[e.code].bars
  const k = e.i + 1
  if (k >= B.length) continue
  const day = B[k].date
  const H = hour[e.code]?.[day]
  if (!H || H.length < 5) continue
  const o = H[0][1]
  if (!(o > 0) || o > e.limit || B[k].h === B[k].l) continue
  const at = m => {
    let last = null
    for (const b of H) if (b[0] <= m) last = b
    return last ? last[4] : null
  }
  const close = H[H.length - 1][4]
  const ret = p => (p / o - 1) * 100 - 0.2
  const stopAt = pct => {
    const s = o * (1 - pct / 100)
    for (const b of H) if (b[3] <= s) return ret(s)
    return ret(close)
  }
  const tpAt = (pct, sl) => {
    const t = o * (1 + pct / 100)
    const s = sl ? o * (1 - sl / 100) : 0
    for (const b of H) {
      if (sl && b[3] <= s) return ret(s)
      if (b[2] >= t) return ret(t)
    }
    return ret(close)
  }
  rows.push({
    tp2: tpAt(2), tp3: tpAt(3), tp5: tpAt(5), tp3s5: tpAt(3, 5), tp5s5: tpAt(5, 5),
    date: day,
    t10: ret(at(540)), t11: ret(at(600)), am: ret(at(660)), t13: ret(at(750)), t14: ret(at(840)), cl: ret(close),
    s2: stopAt(2), s3: stopAt(3), s5: stopAt(5),
    hi: (Math.max(...H.map(b => b[2])) / o - 1) * 100
  })
}
const half = r => (r.date < '2025-06-01' ? 0 : 1)
console.log(`${rows.length}件（${rows.map(r => r.date).sort()[0]}〜）。そのままの% − 0.2%（前半／後半）`)
for (const [k, n] of [['t10', '10:00 に売る'], ['t11', '11:00 に売る'], ['am', '前場の引け'], ['t13', '13:00'], ['t14', '14:00'], ['cl', '大引け（今）'], ['s2', '−2%で損切り'], ['s3', '−3%で損切り'], ['s5', '−5%で損切り'], ['tp2', '+2%で利確'], ['tp3', '+3%で利確'], ['tp5', '+5%で利確'], ['tp3s5', '+3%利確・−5%損切り'], ['tp5s5', '+5%利確・−5%損切り']]) {
  const c = [0, 1].map(h => { const a = rows.filter(r => half(r) === h).map(r => r[k]); return `${fmt(mean(a))}(${a.length})` })
  console.log(`  ${n.padEnd(12)} ${c.join('  ')}  勝ち ${(rows.filter(r => r[k] > 0).length / rows.length * 100).toFixed(0)}%`)
}
console.log(`  参考：寄りからの高値の平均 ${fmt(mean(rows.map(r => r.hi)))}%`)
for (const k of ['cl', 's5', 'tp5s5']) {
  const a = rows.map(r => r[k]).sort((x, y) => x - y)
  console.log(`  ${k}：最悪 ${fmt(a[0])}・下から1% ${fmt(a[Math.floor(a.length * 0.01)])}・下から5% ${fmt(a[Math.floor(a.length * 0.05)])}`)
}
