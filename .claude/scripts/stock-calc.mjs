#!/usr/bin/env node
// 株の値付け用の計算スクリプト（/dcf と /comps から呼ぶ）。
// AIに暗算させると桁や割り算を間違えることがあるので、数字の計算はここで確定させる。
//
// 使い方:
//   node .claude/scripts/stock-calc.mjs dcf   <input.json>
//   node .claude/scripts/stock-calc.mjs comps <input.json>
//
// 金額の単位は入力でそろえていれば何でもよい（例: 億円）。株数は「株」ではなく
// 金額と同じ単位で割り切れるように（例: 金額が億円なら株数は「億株」）入れる。

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * DCF法で理論株価を出す。
 * @param {object} p
 * @param {number} p.baseFcf 直近のフリーキャッシュフロー（年間）
 * @param {number[]} p.growthRates 予測期間の各年のFCF成長率（例: [0.08, 0.07, 0.06, 0.05, 0.04]）
 * @param {number} p.wacc 割引率（例: 0.07）
 * @param {number} p.terminalGrowth 予測期間後の永久成長率（例: 0.01）
 * @param {number} p.netDebt 純有利子負債（有利子負債 − 現金。現金の方が多ければマイナス）
 * @param {number} p.shares 発行済株式数（自己株式を除く）
 * @param {number} [p.price] 今の株価（入れると安全域を出す）
 */
export function dcf(p) {
  const { baseFcf, growthRates, wacc, terminalGrowth, netDebt, shares, price } = p
  if (!(wacc > terminalGrowth)) throw new Error('割引率(wacc)は永久成長率(terminalGrowth)より大きくしてください')
  if (!(shares > 0)) throw new Error('株数(shares)は正の数にしてください')
  if (!Array.isArray(growthRates) || growthRates.length === 0) throw new Error('growthRates を1年分以上入れてください')

  let fcf = baseFcf
  let pvSum = 0
  const years = growthRates.map((g, i) => {
    fcf = fcf * (1 + g)
    const df = 1 / (1 + wacc) ** (i + 1)
    const pv = fcf * df
    pvSum += pv
    return { year: i + 1, growth: g, fcf, discountFactor: df, pv }
  })
  const n = growthRates.length
  const terminalValue = (fcf * (1 + terminalGrowth)) / (wacc - terminalGrowth)
  const pvTerminal = terminalValue / (1 + wacc) ** n
  const enterpriseValue = pvSum + pvTerminal
  const equityValue = enterpriseValue - netDebt
  const perShare = equityValue / shares
  const result = {
    years,
    pvForecast: pvSum,
    terminalValue,
    pvTerminal,
    terminalShare: pvTerminal / enterpriseValue,
    enterpriseValue,
    equityValue,
    perShare
  }
  if (price != null) {
    result.price = price
    result.marginOfSafety = (perShare - price) / perShare
    result.upside = perShare / price - 1
  }
  return result
}

/** 割引率 × 永久成長率、成長率の上下 × 割引率 の感応度表 */
export function sensitivity(p, opts = {}) {
  const waccSteps = opts.waccSteps ?? [-0.01, -0.005, 0, 0.005, 0.01]
  const tgSteps = opts.tgSteps ?? [-0.005, 0, 0.005]
  const growthShifts = opts.growthShifts ?? [-0.02, -0.01, 0, 0.01, 0.02]
  const waccs = waccSteps.map(d => round(p.wacc + d, 4))
  const safe = (q) => {
    try {
      return dcf(q).perShare
    } catch {
      return null
    }
  }
  const waccVsTerminal = {
    rowLabel: '永久成長率',
    colLabel: '割引率',
    cols: waccs,
    rows: tgSteps.map((d) => {
      const tg = round(p.terminalGrowth + d, 4)
      return { key: tg, values: waccs.map(w => safe({ ...p, wacc: w, terminalGrowth: tg })) }
    })
  }
  const growthVsWacc = {
    rowLabel: '成長率の上下',
    colLabel: '割引率',
    cols: waccs,
    rows: growthShifts.map(s => ({
      key: s,
      values: waccs.map(w => safe({ ...p, wacc: w, growthRates: p.growthRates.map(g => g + s) }))
    }))
  }
  return { waccVsTerminal, growthVsWacc }
}

/**
 * 同業比較。各社のPER・EV/EBITDA・PBRを出し、同業の中央値から対象企業の目安株価を出す。
 * @param {object} p
 * @param {string} p.target 対象企業の名前（companies の name と一致させる）
 * @param {{name:string, price:number, shares:number, netIncome:number, netDebt?:number, ebitda?:number, equity?:number, profitGrowth?:number}[]} p.companies
 */
export function comps(p) {
  const rows = p.companies.map((c) => {
    const marketCap = c.price * c.shares
    const eps = c.netIncome / c.shares
    const ev = c.netDebt != null ? marketCap + c.netDebt : null
    return {
      name: c.name,
      price: c.price,
      marketCap,
      eps,
      per: c.netIncome > 0 ? c.price / eps : null,
      evEbitda: ev != null && c.ebitda > 0 ? ev / c.ebitda : null,
      pbr: c.equity > 0 ? marketCap / c.equity : null,
      profitGrowth: c.profitGrowth ?? null
    }
  })
  const target = rows.find(r => r.name === p.target)
  if (!target) throw new Error(`target "${p.target}" が companies にありません`)
  const peers = rows.filter(r => r !== target)
  const peerMedian = {
    per: median(peers.map(r => r.per)),
    evEbitda: median(peers.map(r => r.evEbitda)),
    pbr: median(peers.map(r => r.pbr))
  }
  const t = p.companies.find(c => c.name === p.target)
  const implied = {}
  if (peerMedian.per != null && t.netIncome > 0) implied.byPer = peerMedian.per * (t.netIncome / t.shares)
  if (peerMedian.evEbitda != null && t.ebitda > 0 && t.netDebt != null) {
    implied.byEvEbitda = (peerMedian.evEbitda * t.ebitda - t.netDebt) / t.shares
  }
  if (peerMedian.pbr != null && t.equity > 0) implied.byPbr = peerMedian.pbr * (t.equity / t.shares)
  for (const k of Object.keys(implied)) implied[k + 'Upside'] = implied[k] / t.price - 1
  return { rows, peerMedian, implied }
}

function median(xs) {
  const v = xs.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b)
  if (v.length === 0) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

function round(x, d) {
  const k = 10 ** d
  return Math.round(x * k) / k
}

// ---- 表示（Markdown） ----
const pct = x => (x == null ? '-' : `${(x * 100).toFixed(1)}%`)
const num = x => (x == null ? '-' : x.toLocaleString('ja-JP', { maximumFractionDigits: 1 }))
const yen = x => (x == null ? '-' : Math.round(x).toLocaleString('ja-JP'))
const mult = x => (x == null ? '-' : `${x.toFixed(1)}倍`)

function renderTable(t, fmtKey) {
  const head = `| ${t.rowLabel} ＼ ${t.colLabel} | ${t.cols.map(pct).join(' | ')} |`
  const sep = `|${' --- |'.repeat(t.cols.length + 1)}`
  const body = t.rows.map(r => `| ${fmtKey(r.key)} | ${r.values.map(yen).join(' | ')} |`)
  return [head, sep, ...body].join('\n')
}

function renderDcf(p) {
  const r = dcf(p)
  const s = sensitivity(p)
  const out = []
  out.push('## DCF計算結果')
  out.push('')
  out.push('| 年 | 成長率 | FCF | 割引係数 | 現在価値 |')
  out.push('| --- | --- | --- | --- | --- |')
  for (const y of r.years) out.push(`| ${y.year}年目 | ${pct(y.growth)} | ${num(y.fcf)} | ${y.discountFactor.toFixed(3)} | ${num(y.pv)} |`)
  out.push('')
  out.push(`- 予測期間の現在価値合計: ${num(r.pvForecast)}`)
  out.push(`- 継続価値（現在価値）: ${num(r.pvTerminal)}（企業価値に占める割合 ${pct(r.terminalShare)}）`)
  out.push(`- 企業価値(EV): ${num(r.enterpriseValue)}`)
  out.push(`- 株主価値: ${num(r.equityValue)}（EV − 純有利子負債 ${num(p.netDebt)}）`)
  out.push(`- **理論株価: ${yen(r.perShare)}円**`)
  if (r.price != null) {
    out.push(`- 今の株価: ${yen(r.price)}円`)
    out.push(`- **安全域: ${pct(r.marginOfSafety)}**（理論株価から見て今の株価がどれだけ安いか。マイナスなら割高）`)
  }
  if (r.terminalShare > 0.75) out.push(`- ⚠️ 企業価値の${pct(r.terminalShare)}が継続価値です。永久成長率と割引率の前提に結果が大きく左右されます。`)
  out.push('')
  out.push('### 感応度表①（理論株価・円）')
  out.push(renderTable(s.waccVsTerminal, pct))
  out.push('')
  out.push('### 感応度表②（理論株価・円）')
  out.push(renderTable(s.growthVsWacc, k => (k > 0 ? '+' : '') + pct(k)))
  return out.join('\n')
}

function renderComps(p) {
  const r = comps(p)
  const out = []
  out.push('## 同業比較')
  out.push('')
  out.push('| 会社 | 株価 | 時価総額 | PER | EV/EBITDA | PBR | 利益の伸び |')
  out.push('| --- | --- | --- | --- | --- | --- | --- |')
  for (const x of r.rows) {
    const name = x.name === p.target ? `**${x.name}**` : x.name
    out.push(`| ${name} | ${yen(x.price)} | ${num(x.marketCap)} | ${mult(x.per)} | ${mult(x.evEbitda)} | ${mult(x.pbr)} | ${pct(x.profitGrowth)} |`)
  }
  out.push(`| 同業の中央値 | | | ${mult(r.peerMedian.per)} | ${mult(r.peerMedian.evEbitda)} | ${mult(r.peerMedian.pbr)} | |`)
  out.push('')
  out.push('### 同業並みの倍率で評価した場合の目安株価')
  if (r.implied.byPer != null) out.push(`- PER基準: ${yen(r.implied.byPer)}円（今の株価比 ${pct(r.implied.byPerUpside)}）`)
  if (r.implied.byEvEbitda != null) out.push(`- EV/EBITDA基準: ${yen(r.implied.byEvEbitda)}円（今の株価比 ${pct(r.implied.byEvEbitdaUpside)}）`)
  if (r.implied.byPbr != null) out.push(`- PBR基準: ${yen(r.implied.byPbr)}円（今の株価比 ${pct(r.implied.byPbrUpside)}）`)
  return out.join('\n')
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const [mode, file] = process.argv.slice(2)
  if (!['dcf', 'comps'].includes(mode) || !file) {
    console.error('使い方: node .claude/scripts/stock-calc.mjs <dcf|comps> <input.json>')
    process.exit(1)
  }
  const input = JSON.parse(readFileSync(file, 'utf8'))
  console.log(mode === 'dcf' ? renderDcf(input) : renderComps(input))
}
