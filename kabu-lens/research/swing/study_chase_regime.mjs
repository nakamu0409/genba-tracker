// 低位株・荒い株が場中に前日比+10%に届いた日、+10%の値段で買って引けで売ったら（日足で近似）。その日の TOPIX の動きで分ける
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_chase_regime.mjs
// ・対象：前日終値500円未満、または1日の値幅（14日平均）が4%以上。売買代金1億円以上。寄りから+10%以上なら寄りで買う
// ・日足なので「何時に+10%に届いたか」は分からない（場中の追いかけの近似）。ストップ高で1日じゅう張り付いた日は買えないので除く
import { loadAll, mean, median, fmt, SPLIT_DATE } from './lib_signals.mjs'
const D = loadAll({ withSwing: false })
const bIdx = new Map(D.bench.map((b, i) => [b.date, i]))
const rows = []
for (const st of Object.values(D.stocks)) {
  const B = st.bars
  let tr = 0
  for (let i = 1; i < B.length; i++) {
    const t = Math.max(B[i].h - B[i].l, Math.abs(B[i].h - B[i - 1].c), Math.abs(B[i].l - B[i - 1].c))
    tr = i < 15 ? tr + t / 14 : tr * 13 / 14 + t / 14
    if (i < 20) continue
    const pc = B[i - 1].c
    const atrPct = tr / pc * 100
    if (!(pc < 500 || atrPct >= 4) || st.turn[i - 1] < 1e8) continue
    const trig = pc * 1.1
    const b = B[i]
    if (b.h < trig || b.h === b.l || b.c / pc > 1.6) continue
    const entry = Math.max(b.o, trig) * 1.001
    const bi = bIdx.get(b.date)
    if (bi === undefined || bi < 1) continue
    const mkt = (D.bench[bi].c / D.bench[bi - 1].c - 1) * 100
    const mktOpen = (D.bench[bi].o / D.bench[bi - 1].c - 1) * 100
    const nxt = B[i + 1]
    rows.push({ date: b.date, r: (b.c * 0.999 / entry - 1) * 100, rN: nxt ? (nxt.c / entry - 1) * 100 : null, closeHigh: b.c >= b.h * 0.999, mkt, mktOpen })
  }
}
const line = (name, z) => {
  if (z.length < 20) return console.log(`${name.padEnd(28)} ${z.length}件（少ない）`)
  const A = z.filter(x => x.date < SPLIT_DATE)
  const Bh = z.filter(x => x.date >= SPLIT_DATE)
  console.log(`${name.padEnd(28)} ${String(z.length).padStart(5)}件 引けまで 平均${fmt(mean(z.map(x => x.r))).padStart(6)}% 中央${fmt(median(z.map(x => x.r))).padStart(6)}% 勝率${(z.filter(x => x.r > 0).length / z.length * 100).toFixed(0)}% 高値引け${(z.filter(x => x.closeHigh).length / z.length * 100).toFixed(0)}% ／前半${fmt(mean(A.map(x => x.r)))} 後半${fmt(mean(Bh.map(x => x.r)))} ／翌日の引けまで${fmt(mean(z.filter(x => x.rN !== null).map(x => x.rN)))}%`)
}
console.log('低位株・荒い株が前日比+10%に届いた日（+10%で買って引けで売る。日足の近似）')
line('全部', rows)
console.log('\n-- その日の TOPIX（引けで分かる。場中には途中までしか分からない）')
line('TOPIX −3%以下（大きく下げた日）', rows.filter(x => x.mkt <= -3))
line('TOPIX −3〜−1%', rows.filter(x => x.mkt > -3 && x.mkt <= -1))
line('TOPIX −1〜+1%', rows.filter(x => x.mkt > -1 && x.mkt < 1))
line('TOPIX +1%以上', rows.filter(x => x.mkt >= 1))
console.log('\n-- その日の TOPIX の寄り（朝のうちに分かる）')
line('寄りで −2%以下', rows.filter(x => x.mktOpen <= -2))
line('寄りで −2〜−0.5%', rows.filter(x => x.mktOpen > -2 && x.mktOpen <= -0.5))
line('寄りで −0.5〜+0.5%', rows.filter(x => x.mktOpen > -0.5 && x.mktOpen < 0.5))
line('寄りで +0.5%以上', rows.filter(x => x.mktOpen >= 0.5))
