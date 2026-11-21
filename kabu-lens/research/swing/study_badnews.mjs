// 悪い知らせ（15:00以降の発表）の翌朝、寄りで安く始まった株を寄りで買うと、その日のうちに戻すか（2026-11-21 本人の希望。先に一覧と分け方を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_badnews.mjs
// 種類（見出しで判定）：下方修正、減配・無配、特別損失・減損、増資など（公募・第三者割当・新株予約権）、不祥事（調査委員会・不適切・不正）、優待の廃止
// 買い方：翌日の寄りで買い（成行。寄りの値段 ×1.001）、その日の引けで売る（1日）と5営業日目の引け（5日）。TOPIX との差 − 0.2%
// 分け方：決算と同じ日か別の日か、寄りの窓（−3%より下か）。売買代金1億円以上
// 結果（11/21）：決まりには入れない
//   決算と同じ日の悪い知らせは、翌日も下げ続ける（減配・無配 その日 −1.63／−1.76／−1.54、特別損失 −1.12／−0.92／−0.07、増資 −0.62／−1.07／+0.63）
//   決算と別の日で、寄りが −3% より下に開いたもの（6種類まとめて126件）は、その日 +0.15(62)／+0.63(47)／+4.22(17) と戻るが、前半は小さく、5日は −0.64／+1.17／+4.94 とそろわない
//   減配・無配（決算と別の日）は その日 +0.62(37)／+0.23(11)／+5.57(9)。件数が少ない
//   優待の廃止（決算と別の日・寄りで成行）は その日 +0.30(21)／+0.50(27)／0(4)。study_events_more2 の +1.1%（寄指で買えた分）より小さく、買い方で変わる＝まだ弱い手がかり
//   「下方修正」は見出しに出ないことが多く（「業績予想の修正」）拾えなかった。2年の決算データでは、下方修正のあと寄りで下げた株は5日後 −1.1%（続けて下げる）
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const irev = JSON.parse(readFileSync(new URL('../irevents.json', import.meta.url), 'utf-8'))
const irh = JSON.parse(readFileSync(new URL('../irhist.json', import.meta.url), 'utf-8'))
const bi = new Map(bench.map((b, i) => [b.date, i]))
const KINDS = {
  down: ['下方修正', t => /下方修正/.test(t)],
  divcut: ['減配・無配', t => /(減配|無配)/.test(t) && !/(復配|増配)/.test(t)],
  loss: ['特別損失・減損', t => /(特別損失|減損損失)/.test(t)],
  dilution: ['増資など', t => /(公募|第三者割当|新株予約権|新株式発行|売出し)/.test(t) && !/(結果|払込完了|行使状況|取得及び消却|消却)/.test(t)],
  scandal: ['不祥事', t => /(調査委員会|不適切|不正)/.test(t) && !/(結果|再発防止策の実施状況)/.test(t)],
  yutai_end: ['優待の廃止', t => /株主優待/.test(t) && /(廃止|中止|休止)/.test(t)]
}
const rows = []
for (const [code, list] of Object.entries(irev)) {
  const st = stocks[code]
  if (!st || !Array.isArray(list)) continue
  const kd = new Set((irh[code] || []).map(r => r.date))
  const seen = new Set()
  for (const r of list) {
    if (!r || !r.title || r.time < '15:00') continue
    for (const [kind, [, f]] of Object.entries(KINDS)) {
      if (!f(r.title)) continue
      const i = st.idx.get(r.date)
      if (i === undefined || i < 60 || st.turn[i] < 1e8 || seen.has(kind + i)) continue
      seen.add(kind + i)
      const B = st.bars
      const k = i + 1
      if (k + 5 >= B.length || B[k].h === B[k].l) continue
      const k0 = bi.get(B[k].date)
      const k4 = bi.get(B[k + 4].date)
      if (k0 === undefined || k4 === undefined) continue
      const earn = kd.has(r.date) || list.some(x => x && x.date === r.date && /決算/.test(x.title || ''))
      const o = B[k].o * 1.001
      rows.push({
        kind, date: r.date, earn,
        gap: (B[k].o / B[i].c - 1) * 100,
        d1: (B[k].c / o - 1) * 100 - (bench[k0].c / bench[k0].o - 1) * 100 - 0.2,
        d5: (B[k + 4].c / o - 1) * 100 - (bench[k4].c / bench[k0].o - 1) * 100 - 0.2
      })
    }
  }
}
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
const line = (n, z) => console.log(`  ${n.padEnd(16)} ${String(z.length).padStart(4)}件 窓${fmt(mean(z.map(r => r.gap))).padStart(6)}  その日 ${[0, 1, 2].map(p => { const a = z.filter(r => per(r) === p).map(r => r.d1); return `${fmt(mean(a))}(${a.length})` }).join(' ')}  5日 ${[0, 1, 2].map(p => fmt(mean(z.filter(r => per(r) === p).map(r => r.d5)))).join('/')}`)
console.log('悪い知らせの翌朝、寄りで買う（TOPIX との差 − 0.2%。選ぶ／確かめる／最後の確認）')
for (const [k, [n]] of Object.entries(KINDS)) {
  const z = rows.filter(r => r.kind === k)
  console.log(`■ ${n}`)
  line('全部', z)
  line('決算と別の日', z.filter(r => !r.earn))
  line('決算と同じ日', z.filter(r => r.earn))
  line('窓 −3%より下', z.filter(r => r.gap <= -3))
  line('窓 −3%より下・別の日', z.filter(r => r.gap <= -3 && !r.earn))
}
console.log('■ 参考：どの知らせでも、窓 −3%より下で始まった（決算と別の日）')
line('まとめて', rows.filter(r => r.gap <= -3 && !r.earn))
