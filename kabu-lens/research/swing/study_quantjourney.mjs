// 海外の公開ライブラリ（QuantJourney の W16 短期の反転・W04/W15 12か月モメンタム）を日本株10年で確かめる（2026-11-24 本人の希望。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=9000 kabu-lens/research/swing/study_quantjourney.mjs
// 対象：wide.json＋wide_small.json（約3,600社）のうち、20日平均の売買代金1億円以上・株価100円以上（スイングと同じ）。買うだけ（空売りはしない）
// A) 短期の反転：毎週の最後の営業日の引けまでの1週間（5営業日）の騰落で並べ、下げの大きい順に10社・20社・下から10%を、次の営業日の寄りで買い、その週の最後の営業日の引けで売る
// B) 12か月モメンタム：毎月の最後の営業日に、12か月前→1か月前の騰落（直近1か月は除く）で並べ、上から10社・20社・上から10%を、次の営業日の寄りで買い、その月の最後の営業日の引けで売る
// 比べる相手：同じ期間の TOPIX 連動ETF（寄り→引け）。手数料・すべり 往復0.2% を引く。期間：前半（〜2021-11-18）／後半（〜2025-11-13）／直近
// 注意：今も上場している会社だけ（下げて上場廃止になった会社が入らない＝反転は良く出やすい）
// 結果（2026-11-24）：どちらも採らない。
//   A 短期の反転：下げの大きい10社 −0.15／−0.80／−1.60%（勝った週 44／39／28%）、下から10% −0.13／−0.32／−0.64%。全部（比べる相手）−0.29／−0.33／−0.30%。前半だけ全部より少しまし、後半・直近は悪い
//   B 12か月モメンタム：上から10社 −1.92／−3.39／−3.64%（1か月）、上から10% −0.86／−0.71／−1.40%。全部 −0.42／−0.58／−0.50% より悪い＝日本株では1年強かった株は次の月に負けやすい
//   （全部がマイナスなのは、TOPIX が大きい会社中心で、小さい会社を同じ金額ずつ持つと負けやすい10年だったため）
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
const BB = '2025-11-14'
const per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const COST = 0.2
const D = loadAll({ withSwing: false, withSmall: true, evMinTurn: 1e12 })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const days = bench.map(b => b.date).filter(d => d >= '2016-06-01')
const list = Object.values(stocks)
// 週・月の最後の営業日
const lastOf = key => { const out = []; for (let i = 0; i < days.length; i++) if (i + 1 === days.length || key(days[i + 1]) !== key(days[i])) out.push(i); return out }
const weekKey = d => { const t = new Date(d + 'T00:00:00Z'); const mon = new Date(t - ((t.getUTCDay() + 6) % 7) * 864e5); return mon.toISOString().slice(0, 10) }
const run = (name, ends, lookback, skip, pickDir) => {
  const groups = { '10社': [[], [], []], '20社': [[], [], []], '10%': [[], [], []], '全部（比べる相手）': [[], [], []] }
  for (let k = 0; k + 1 < ends.length; k++) {
    const d0 = days[ends[k]], d1 = days[ends[k] + 1], d2 = days[ends[k + 1]]
    const b1 = bi.get(d1), b2 = bi.get(d2)
    const bret = (bench[b2].c / bench[b1].o - 1) * 100
    const rows = []
    for (const st of list) {
      const i = st.idx.get(d0), j = st.idx.get(d1), e = st.idx.get(d2)
      if (i === undefined || j === undefined || e === undefined || i < lookback + 1) continue
      if (st.turn[i] < 1e8 || st.bars[i].c < 100) continue
      const B = st.bars
      if (B[j].h === B[j].l) continue
      const sig = (B[i - skip].c / B[i - lookback].c - 1) * 100
      rows.push({ sig, r: (B[e].c / B[j].o - 1) * 100 - bret - COST })
    }
    if (rows.length < 100) continue
    rows.sort((a, b) => pickDir * (b.sig - a.sig))
    const p = per(d1)
    groups['10社'][p].push(mean(rows.slice(0, 10).map(x => x.r)))
    groups['20社'][p].push(mean(rows.slice(0, 20).map(x => x.r)))
    groups['10%'][p].push(mean(rows.slice(0, Math.floor(rows.length / 10)).map(x => x.r)))
    groups['全部（比べる相手）'][p].push(mean(rows.map(x => x.r)))
  }
  console.log(`\n■ ${name}（TOPIX 比・手数料0.2%を引いた1回の平均%／勝った回の割合／回数）前半／後半／直近`)
  for (const [g, P] of Object.entries(groups)) console.log(`  ${g.padEnd(12)} ` + P.map(a => `${fmt(mean(a))}%・${(a.filter(x => x > 0).length / a.length * 100).toFixed(0)}%・${a.length}`).join('  ／  '))
}
run('A 短期の反転（1週間で下げた株を1週間持つ）', lastOf(weekKey), 5, 0, -1)
run('B 12か月モメンタム（12か月前→1か月前で上げた株を1か月持つ）', lastOf(d => d.slice(0, 7)), 250, 21, 1)
