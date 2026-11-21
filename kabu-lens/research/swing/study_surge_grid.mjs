// 急騰した株の押し目：条件を組み合わせて試す。前半5年（〜2021-11-18）で順位を付け、後半5年でも効くかを見る（過去にだけ合わせる失敗を避けるため）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_surge_grid.mjs
// 組み合わせ：急騰の大きさ × 高値引けの厳しさ × 押しの深さ × 戻しの限度 × 反発の合図 × 目標 × 持つ日数 × 地合い（全部／TOPIX の25日線が下向きの日だけ）
// 損切りは押しの安値の1%下。翌日の寄りで買う（寄りで張り付きなら買えない）。滑り0.1%
import { loadAll, simulate, mean, median, fmt, SPLIT_DATE } from './lib_signals.mjs'

const D = loadAll({ withSwing: false })
const { stocks, regime } = D
const list = Object.values(stocks)

function signals({ up, closeTop, pull, retrace, trig }) {
  const out = []
  for (const st of list) {
    const B = st.bars
    const used = new Set()
    for (let i = 6; i < B.length - 2; i++) {
      const day = B[i].c / B[i - 1].c - 1
      if (!(day >= up && day <= 1) || st.turn[i - 1] < 1e8) continue
      const rng = B[i].h - B[i].l
      if (rng > 0 && (B[i].c - B[i].l) / rng < closeTop) continue
      let baseLow = Infinity
      for (let k = i - 5; k <= i; k++) baseLow = Math.min(baseLow, B[k].l)
      let hi = B[i].h
      let low = Infinity
      let pulled = false
      for (let j = i + 1; j < B.length - 1 && j <= i + 15; j++) {
        const b = B[j]
        if (!pulled) hi = Math.max(hi, b.h)
        low = Math.min(low, b.l)
        if (!pulled && b.l <= hi * (1 - pull)) pulled = true
        if (low < hi - retrace * (hi - baseLow)) break
        if (!pulled) continue
        const ok = trig === 'REV' ? b.c > B[j - 1].h && b.c > b.o : b.c > Math.max(B[j - 1].h, B[j - 2].h)
        if (ok) {
          if (!used.has(j)) out.push({ st, j, stop: low * 0.99, date: b.date })
          used.add(j)
          break
        }
      }
    }
  }
  return out
}

const rows = []
const t0 = Date.now()
for (const up of [0.10, 0.15, 0.20]) {
  for (const closeTop of [0.999, 0.8]) {
    for (const pull of [0.05, 0.08, 0.12]) {
      for (const retrace of [0.5, 0.618, 0.786]) {
        for (const trig of ['REV', '2DH']) {
          const sg = signals({ up, closeTop, pull, retrace, trig })
          for (const rMult of [2, 3, 4, 0]) {
            for (const hold of [5, 10, 20]) {
              const tr = []
              for (const s of sg) {
                const t = simulate(s.st.bars, s.j, s.stop, { rMult, maxDays: hold })
                if (t) tr.push({ date: s.date, r: t.r, down: regime.get(s.date)?.slope25Up === false })
              }
              for (const reg of ['all', 'down25']) {
                const z = reg === 'all' ? tr : tr.filter(x => x.down)
                const A = z.filter(x => x.date < SPLIT_DATE).map(x => x.r)
                const B = z.filter(x => x.date >= SPLIT_DATE).map(x => x.r)
                rows.push({ up, closeTop, pull, retrace, trig, rMult, hold, reg, nA: A.length, nB: B.length, mA: mean(A), mB: mean(B), wB: B.filter(x => x > 0).length / B.length })
              }
            }
          }
        }
      }
    }
  }
}
console.log(`組み合わせ ${rows.length} 通り（${((Date.now() - t0) / 1000).toFixed(0)}秒）`)
const label = r => `急騰${r.up * 100}%${r.closeTop > 0.9 ? '高値引け' : '上2割で引け'} 押し${r.pull * 100}% 戻し${r.retrace} ${r.trig === 'REV' ? '前日高値超えの陽線' : '2日の高値超え'} ${r.rMult ? r.rMult + 'R' : '目標なし'} ${r.hold}日 ${r.reg === 'all' ? '地合い問わず' : '25日線が下向きの日だけ'}`
const line = r => `${label(r).padEnd(70)} 前半 ${fmt(r.mA, 3)}R（${r.nA}件） → 後半 ${fmt(r.mB, 3)}R（${r.nB}件・勝率${(r.wB * 100).toFixed(0)}%）`
const cur = rows.find(r => r.up === 0.15 && r.closeTop === 0.999 && r.pull === 0.08 && r.retrace === 0.618 && r.trig === 'REV' && r.rMult === 3 && r.hold === 10 && r.reg === 'all')
console.log('\n■ 今の練習口座の決まり')
console.log(line(cur))
const ok = rows.filter(r => r.nA >= 100 && r.nB >= 100)
ok.sort((a, b) => b.mA - a.mA)
console.log(`\n■ 前半で良かった順の上位15（前半・後半とも100件以上の ${ok.length} 通りの中で）`)
for (const r of ok.slice(0, 15)) console.log(line(r))
const top50 = ok.slice(0, 50)
console.log(`\n前半の上位50通りの後半の成績：中央 ${fmt(median(top50.map(r => r.mB)), 3)}R・平均 ${fmt(mean(top50.map(r => r.mB)), 3)}R・後半もプラス ${top50.filter(r => r.mB > 0).length}/50`)
console.log(`全部の組み合わせの後半の成績：中央 ${fmt(median(ok.map(r => r.mB)), 3)}R・後半もプラス ${ok.filter(r => r.mB > 0).length}/${ok.length}`)
console.log(`前半と後半の成績の相関（組み合わせ全体）：${corr(ok.map(r => r.mA), ok.map(r => r.mB)).toFixed(2)}`)
// 1つの条件だけ変えたときの平均（ほかの条件はすべてならす）
console.log('\n■ 1つの条件ごとの平均（ほかはならす。前半 / 後半）')
for (const key of ['up', 'closeTop', 'pull', 'retrace', 'trig', 'rMult', 'hold', 'reg']) {
  const vals = [...new Set(ok.map(r => r[key]))]
  console.log('  ' + key + ': ' + vals.map(v => {
    const z = ok.filter(r => r[key] === v)
    return `${v}=${fmt(mean(z.map(r => r.mA)), 3)}/${fmt(mean(z.map(r => r.mB)), 3)}`
  }).join('  '))
}
function corr(a, b) {
  const ma = mean(a)
  const mb = mean(b)
  let s = 0
  let sa = 0
  let sb = 0
  for (let i = 0; i < a.length; i++) {
    s += (a[i] - ma) * (b[i] - mb)
    sa += (a[i] - ma) ** 2
    sb += (b[i] - mb) ** 2
  }
  return s / Math.sqrt(sa * sb)
}
