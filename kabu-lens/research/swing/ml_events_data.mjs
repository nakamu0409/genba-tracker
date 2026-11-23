// 機械学習で企業の行動（自社株買い・増配）を選べるかの検証用データを作る（2026-11-23 本人の希望。ml_events.py が読む）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/ml_events_data.mjs > /tmp/ml_events.csv
// 1行＝1件の発表（決算と別の日の15時以降。今の本番と同じ選び方）。特徴は「発表の夜に分かること」だけ（未来を見ない）
// 目的（y）：翌日の寄指（終値×1.02以下）で買えたときの寄り→引け − TOPIX 連動ETF の同じ日の寄り→引け（%）。買えなかった行は y を空にする
import { readFileSync } from 'node:fs'
import { loadAll } from './lib_signals.mjs'

const R = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8'))
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const BBD = R('../bb_detail.json')
let DIV = {}
try { DIV = R('../div_detail.json') } catch {}
const cols = ['date', 'code', 'kind_bb', 'kind_div', 'score', 'repeat0', 'early', 'below25', 'bb_pct', 'bb_pct_known', 'bb_days', 'bb_market', 'bb_trust', 'div_up', 'div_known', 'log_turn', 'log_price', 'r1', 'r5', 'r20', 'r60', 'dev25', 'atrp', 'volr', 'time_min', 'wday', 'tpx_r20', 'tpx_dev200', 'same_day_n', 'filled', 'y', 'cur_rank']
console.log(cols.join(','))
const perDay = new Map()
for (const e of D.events) if (e.kind !== 'split') perDay.set(e.date, (perDay.get(e.date) || 0) + 1)
for (const e of D.events) {
  if (e.kind === 'split') continue
  const st = stocks[e.code]
  const B = st.bars
  const i = e.i
  if (i < 61 || i + 1 >= B.length) continue
  const k = bi.get(B[i].date)
  if (k === undefined || k < 200) continue
  let m25 = 0
  for (let j = i - 24; j <= i; j++) m25 += B[j].c
  m25 /= 25
  let atr = 0
  for (let j = i - 13; j <= i; j++) atr += Math.max(B[j].h, B[j - 1].c) - Math.min(B[j].l, B[j - 1].c)
  atr /= 14
  let v20 = 0
  for (let j = i - 20; j < i; j++) v20 += B[j].v
  v20 /= 20
  let m200 = 0
  for (let j = k - 199; j <= k; j++) m200 += bench[j].c
  m200 /= 200
  const bd = BBD[`${e.code}|${e.date}|${e.time}`] || {}
  const dd = DIV[`${e.code}|${e.date}|${e.time}`] || {}
  const x = B[i + 1]
  const kb = bi.get(x.date)
  const filled = x.h !== x.l && x.o <= e.limit && kb !== undefined
  const y = filled ? (x.c / x.o - 1) * 100 - (bench[kb].c / bench[kb].o - 1) * 100 : ''
  const [hh, mm] = e.time.split(':').map(Number)
  const sc = e.score ?? 0
  const sz = (e.score ?? 0) + ((bd.pct ?? 0) >= 2 ? 1 : 0)
  // 今の本番の並べ方（小さいほど先）：小さめの会社の大きい自社株買い → 自社株買い（良い条件2つ以上）→ 増配 → 自社株買い（1つ）→ 見送り
  const hot = e.kind === 'buyback' && (bd.pct ?? 0) >= 2 && st.turn[i] < 3e8
  const cur = e.kind === 'buyback' ? (sz < 2 ? 9 : hot ? 0 : 1) : 2
  const row = {
    date: e.date, code: e.code, kind_bb: e.kind === 'buyback' ? 1 : 0, kind_div: e.kind === 'divup' ? 1 : 0, score: sc,
    repeat0: '', early: hh * 60 + mm < 930 ? 1 : 0, below25: B[i].c < m25 ? 1 : 0,
    bb_pct: bd.pct ?? '', bb_pct_known: bd.pct != null ? 1 : 0, bb_days: bd.days ?? '', bb_market: bd.method === '市場' ? 1 : 0, bb_trust: bd.method === '信託' ? 1 : 0,
    div_up: dd.up_pct ?? '', div_known: dd.up_pct != null ? 1 : 0,
    log_turn: Math.log10(st.turn[i]).toFixed(4), log_price: Math.log10(B[i].c).toFixed(4),
    r1: ((B[i].c / B[i - 1].c - 1) * 100).toFixed(3), r5: ((B[i].c / B[i - 5].c - 1) * 100).toFixed(3), r20: ((B[i].c / B[i - 20].c - 1) * 100).toFixed(3), r60: ((B[i].c / B[i - 60].c - 1) * 100).toFixed(3),
    dev25: ((B[i].c / m25 - 1) * 100).toFixed(3), atrp: (atr / B[i].c * 100).toFixed(3), volr: v20 > 0 ? (B[i].v / v20).toFixed(3) : '',
    time_min: hh * 60 + mm, wday: new Date(e.date).getUTCDay(),
    tpx_r20: ((bench[k].c / bench[k - 20].c - 1) * 100).toFixed(3), tpx_dev200: ((bench[k].c / m200 - 1) * 100).toFixed(3),
    same_day_n: perDay.get(e.date) || 1, filled: filled ? 1 : 0, y: y === '' ? '' : y.toFixed(4), cur_rank: cur
  }
  console.log(cols.map(c => row[c]).join(','))
}
