// 調べもののデータ（wide.json・day/five.json など。.gitignore で git に入らない）を、記録帳の asset から戻す
// しまい方：元の JSON を gzip → base64 → 14MB ごとの .txt に分けて記録帳に asset で置く。どの asset がどのファイルかは、
//   記録帳の DB の research_store コレクション（doc_id は置いた日）に入っている（URL はここに書かない）
// 戻し方：
//   1. ArtifactData で research_store の一番新しい doc を読み、index.json に保存する
//   2. Artifact の read（path に asset の id）で、parts に並ぶ asset を全部落とす（<id>.txt で保存される）
//   3. node kabu-lens/research/restore_data.mjs index.json <落とした先のフォルダ>
//   → kabu-lens/research/ の下に元のファイルを戻し、sha256 が合うか確かめる
// index の形：{ files: [{ name, path, sha256, parts: [id...], bundle? }] }
//   bundle があるものは、その id の .txt が {name: base64} の JSON（小さいファイルをまとめたもの）
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'

const [idxPath, dir] = process.argv.slice(2)
if (!idxPath || !dir) {
  console.error('使い方: node restore_data.mjs index.json <asset を落としたフォルダ>')
  process.exit(1)
}
const idx = JSON.parse(readFileSync(idxPath, 'utf-8'))
const root = new URL('.', import.meta.url).pathname
const bundles = new Map()
const readPart = id => readFileSync(join(dir, id + '.txt'), 'utf-8')
let bad = 0
for (const f of idx.files) {
  let b64
  if (f.bundle) {
    if (!bundles.has(f.bundle)) bundles.set(f.bundle, JSON.parse(readPart(f.bundle)))
    b64 = bundles.get(f.bundle)[f.name]
  } else {
    const missing = f.parts.filter(id => !existsSync(join(dir, id + '.txt')))
    if (missing.length) {
      console.log(`× ${f.path}: asset が足りない ${missing.join(',')}`)
      bad++
      continue
    }
    b64 = f.parts.map(readPart).join('')
  }
  const buf = gunzipSync(Buffer.from(b64, 'base64'))
  const sha = createHash('sha256').update(buf).digest('hex')
  if (sha !== f.sha256) {
    console.log(`× ${f.path}: sha256 が合わない`)
    bad++
    continue
  }
  const out = join(root, f.path)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, buf)
  console.log(`○ ${f.path}（${(buf.length / 1e6).toFixed(1)}MB）`)
}
process.exit(bad ? 1 : 0)
