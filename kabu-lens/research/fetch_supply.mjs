// 需給のデータを集める（2026-11-24 本人の希望。信用残・機関の空売り残高・大量保有報告）。いつもの約1,150銘柄（記録帳の universe-wide.json）
// 使い方: node kabu-lens/research/fetch_supply.mjs <margin|short|share> <universe-wide.json>
//   margin：株探の週ごとの信用残（約5年・10ページ）→ supply_margin.json {code: [[YYYY-MM-DD, 終値, 売り残, 買い残, 信用倍率], ...]}
//   short：IRBANK の機関の空売り残高の報告（0.5%以上）→ supply_short.json {code: [[YYYY-MM-DD, 報告者, 残高%], ...]}（義務消失は 0 と同じ扱いの行として pct に null）
//   share：IRBANK の大量保有報告（報告義務が発生した日）→ supply_share.json {code: [[YYYY-MM-DD, 保有者, 変化%, 後の%], ...]}
// 途中から再開できる（取れた銘柄は飛ばす）。相手のサイトに負担をかけないよう、2本ずつ・1回ごとに少し待つ
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const [mode, uniFile] = process.argv.slice(2)
const out = new URL(`./supply_${mode}.json`, import.meta.url)
const data = existsSync(out) ? JSON.parse(readFileSync(out, 'utf-8')) : {}
const codes = JSON.parse(readFileSync(uniFile, 'utf-8')).map(x => x.code)
const get = url => { try { return execFileSync('curl', ['-s', '-A', 'Mozilla/5.0', '--max-time', '30', url], { encoding: 'utf-8', maxBuffer: 20e6 }) } catch { return '' } }
const clean = h => h.replace(/&#8594;/g, '→').replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, '|').replace(/\|[\s|]*/g, '|')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const num = s => Number(String(s).replace(/,/g, ''))
async function one(code) {
  if (mode === 'margin') {
    const rows = []
    for (let pg = 1; pg <= 10; pg++) {
      const t = clean(get(`https://kabutan.jp/stock/kabuka?code=${code}&ashi=wek&margin_balances=1&page=${pg}`))
      const re = /\|(\d\d)\/(\d\d)\/(\d\d)\|([\d,.]+)\|([-+\d.]+)\|([\d,]+)\|([\d,]+)\|([\d,]+)\|([\d,]+)\|([\d.,\-－]+)(?=\|)/g
      let m, n = 0
      while ((m = re.exec(t))) { rows.push([`20${m[1]}-${m[2]}-${m[3]}`, num(m[4]), num(m[8]), num(m[9]), /^[-－]$/.test(m[10]) ? null : num(m[10])]); n++ }
      if (!n) break
      await sleep(300)
    }
    return rows
  }
  if (mode === 'short') {
    const t = clean(get(`https://irbank.net/${code}/short`)).split('|')
    const rows = []
    let y = null
    const i0 = t.indexOf('日付')
    for (let i = i0; i >= 0 && i < t.length - 3; i++) {
      if (/^20\d\d$/.test(t[i])) { y = t[i]; continue }
      if (y && /^\d\d\/\d\d$/.test(t[i]) && /%$/.test(t[i + 2])) {
        const lost = t.slice(i + 3, i + 6).some(x => /義務消失/.test(x))
        rows.push([`${y}-${t[i].replace('/', '-')}`, t[i + 1], lost ? null : Number(t[i + 2].replace('%', ''))])
      }
    }
    return rows
  }
  if (mode === 'share') {
    const page = get(`https://irbank.net/${code}/short`)
    const ec = (page.match(/href="\/(E\d{5})\/share"/) || [])[1]
    if (!ec) return []
    await sleep(300)
    const t = clean(get(`https://irbank.net/${ec}/share`)).split('|')
    const rows = []
    let y = null
    for (let i = 0; i < t.length - 4; i++) {
      const ym = t[i].match(/^(20\d\d)年に報告義務発生/)
      if (ym) { y = ym[1]; continue }
      if (y && /^\d\d\/\d\d$/.test(t[i]) && /^[-+±][\d.]+%$/.test(t[i + 2])) {
        // 「被保有」の側（この会社の株を誰かが持つ）だけ。後の%は「a→|b|%」か「b%」
        const after = /→$/.test(t[i + 3]) ? Number(t[i + 4]) : Number(String(t[i + 3]).replace('%', ''))
        rows.push([`${y}-${t[i].replace('/', '-')}`, t[i + 1], Number(t[i + 2].replace(/[%±+]/g, '')), after])
      }
    }
    return rows
  }
}
let done = 0
const todo = codes.filter(c => !data[c])
for (let k = 0; k < todo.length; k += 2) {
  await Promise.all(todo.slice(k, k + 2).map(async c => { data[c] = await one(c) }))
  done += 2
  if (done % 50 === 0) { writeFileSync(out, JSON.stringify(data)); console.error(`${mode} ${done} / ${todo.length}`) }
  await sleep(mode === 'margin' ? 300 : 600)
}
writeFileSync(out, JSON.stringify(data))
console.error(`${mode} done ${Object.keys(data).length}`)
