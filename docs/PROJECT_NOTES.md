# 現場記録（Genba Tracker）プロジェクトノート

アイドル現場の支出（チケット・チェキ・グッズ・ドリンク・交通・宿泊）を記録するPWA。
開発で得たノウハウ・設計ルール・過去のバグの教訓をここに集約する。**機能追加や修正はまずこのノートを読んでから考える。**

- 本番: https://genba-tracker.onrender.com/genba
- リポジトリ: https://github.com/nakamu0409/genba-tracker
- 独自ドメイン: genbalog.com（Cloudflareで取得済み。メール送信に使用中、サイトはまだ onrender.com）

## インフラ構成

| 役割 | サービス | 備考 |
|---|---|---|
| ホスティング | Render（無料プラン） | masterへのpushで自動デプロイ（render.yaml） |
| DB | Turso（libSQL） | **ローカル開発と本番が同一DB**。破壊的な検証は厳禁 |
| メール送信 | Resend | ログイン用マジックリンク。差出人 `現場記録 <login@genbalog.com>`（ドメイン検証済み） |
| 画像ストレージ | Cloudflare R2 | バケット名 `genba-photo`（**sなし**）。公開URLは `pub-xxx.r2.dev`（公共開発用URL有効化済み） |
| CI | GitHub Actions | **pnpm** を使用（ローカルはnpm併用）→ 後述の教訓参照 |
| スリープ防止 | GitHub Actions (keepalive.yml) | 10分おきに `/api/genba/ping` へping。60日コミットがないと自動停止される点に注意 |

環境変数（値は `.env`＝gitignore済み、本番はRenderダッシュボードのEnvironmentに設定）:
`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` / `GENBA_ADMIN_KEY` / `RESEND_API_KEY` /
`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL_BASE`

## データモデルとスコープ設計（最重要）

すべてのデータは `device_id` 列で持ち主を区別する。

- 未ログイン: httpOnly Cookie `genba_device_id`（UUID）
- ログイン後: `u<ユーザーID>`（例 `u4`）。ログイン時に旧device_idのデータを全テーブル移行する
- **共有データは `device_id = ''`**。現在共有なのは**会場マスタのみ**（管理者だけが編集可）

| テーブル | 内容 | 備考 |
|---|---|---|
| genba_events | 現場（費用・評価・メモ） | rating(1-5), lodging_fee あり |
| genba_items | チェキ・グッズ明細 | event_id紐づけ。device_idは持たない（イベント経由で判定） |
| genba_photos | チェキフォト | photo_urlはR2公開URL |
| genba_budgets | 月予算 | PK(device_id, year_month)。`year_month='default'` が毎月共通のデフォルト予算 |
| genba_venues | 会場マスタ | 共有＋個人。drink_fee列（標準ドリンク代、nullは不明） |
| genba_idols / genba_groups | 推し・グループマスタ | **常に個人データ**（共有は2026-07に廃止）。UNIQUE(name, device_id) |
| genba_users / genba_login_tokens | メール認証 | トークンは30分・使い捨て |

### 絶対に守るSQLルール

**genba_idols とのJOINは必ずデバイスを限定する。**
同じ推し名が複数デバイスに存在するため、`ON gi.name = i.member_name` だけで結合すると明細が行数分増幅される（実際に起きた「チェキ増殖バグ」2026-07-08）。

```sql
-- ○ 正しい
LEFT JOIN genba_idols gi ON gi.name = i.member_name AND gi.device_id = e.device_id
-- ✕ バグる（同名行の数だけチェキが増える）
LEFT JOIN genba_idols gi ON gi.name = i.member_name
```

UPDATE/DELETEも同様に `AND device_id = ?` を付ける（last_unit_priceの更新で他人のマスタを書き換えかけた前例あり）。

### ログイン時のデータ移行（server/utils/genbaUserRepository.ts）

- genba_events / genba_photos: 単純UPDATE
- マスタ・予算（ユニーク制約あり）: `UPDATE OR IGNORE` → 残りをDELETE（移行先優先）
- **新テーブルを追加したらここへの追加を忘れない**（genba_budgetsの移行漏れで予算が消えるバグの前例あり）

## 主要な仕様の要点

- **予定**: 開催日が未来（JST基準）の現場は「予定」。判定はクライアント `app/utils/genbaPlanned.ts`、サーバー `server/utils/genbaDate.ts`（`genbaTodayString()`＝Asia/Tokyo）。一覧・カレンダー・予算先読みには含める、**集計・年間まとめ・推しトレンドからは除外**
- **月予算**: 月別設定 > デフォルト（`year_month='default'`）の優先順。予算カードの使用金額は**絞り込みを無視した月全体**で計算する
- **ドリンク代自動入力**: 会場選択時、①自分がその会場で最後に払った額 → ②会場マスタのdrink_fee。手入力値は上書きしない。自動入力値のまま会場を変えたら差し替え
- **チェキ単価の学習**: 明細保存時に自デバイスの genba_idols.last_unit_price を更新。ワンタップ追加・単価プリフィルに使う
- **認証**: マジックリンクは `/genba/login-confirm?token=` に飛ばし、ボタン押下（POST /api/genba/auth/confirm）で初めてトークン消費。**GETで消費するとメールスキャナーに食われる**（前例あり）。送信は同一アドレス2分に1回のレート制限（トークンのexpires_atから発行時刻を逆算）
- **チェキフォト**: クライアントで長辺1600px/JPEG化（`app/utils/genbaImage.ts`）→ multipart POST → R2に `genba-events/` プレフィックスで保存。写真削除・現場削除時はR2オブジェクトも削除。R2は公開バケットなのでURLを知っていれば誰でも閲覧可（URLは推測不能なUUID）
- **管理者**: `genba_admin_key` Cookie。共有会場の編集とマスタタブの表示のみに使用

## 過去のバグと教訓

| 事象 | 原因 | 教訓 |
|---|---|---|
| チェキ増殖（表示が3倍） | genba_idolsを名前だけでJOIN | JOINは必ずdevice_id限定。マスタのデータ移行をしたら集計系のJOINを全部見直す |
| CI失敗（lockfile不整合） | npmでインストールしpnpm-lock.yaml未更新 | 依存を追加/削除したら `npx pnpm install` でlockfile同期。CIはpnpm |
| マジックリンクが無効 | メールスキャナーがGETリンクを先に踏んで消費 | ワンタイムトークンはGETで消費しない。確認ページ＋POST |
| ログインで予算が消えた | データ移行にgenba_budgetsが漏れ | テーブル追加時は移行処理・削除カスケードもセットで考える |
| R2が403/404 | トークンのバケット限定が不発／バケット名違い（genba-photo） | 認証系は疎通テストスクリプトで即検証。バケット名はダッシュボードからコピー |
| 検証データが本番に混入しかけ | admin Cookie未転送で個人スコープに保存 | テストは新規Cookieの隔離スコープで行い、終わったら必ず削除 |

## 開発・検証の作法

- **ローカル=本番DB**。検証は必ず「新規デバイスCookieの隔離スコープ」で行い、作ったデータは最後に削除する。実データの一括削除は厳禁
- 検証スクリプトはNode fetchでAPIを直接叩くE2E形式（scratchpadに使い捨てで書く）。Set-Cookieは全部引き継ぐこと
- 施策前後で `npx eslint <変更ファイル>` と `npm run typecheck`。IDEの診断は古いことがあるので鵜呑みにしない
- デプロイ: masterへpush → GitHub Actions(ci) → Renderが自動ビルド（数分）。デプロイ確認は新機能のAPIレスポンス変化を見るのが確実
- コミットは日本語1行サマリ＋必要なら箇条書き本文

## 次にやること（2026-07-18時点の作業途中メモ）

- **リグレッションテストの常設（着手済み・途中）**: vitestはインストール済み。残作業は
  ①genbaDb.tsのensureSchemaをexport ②vitest.config.ts（`#imports`のエイリアススタブが必要）
  ③tests/にリポジトリ層のテスト（:memory:のlibsqlクライアント＋ensureSchemaで実スキーマ再現、
  genbaDbモジュールをvi.mockして差し込む。最優先はdevice_idスコープJOINの増殖防止テスト）
  ④package.jsonにtestスクリプト ⑤ci.ymlにテストステップ追加
- **dev/本番DB分離**: ユーザーが増えてきたら実施（Tursoのブランチ機能を使う想定）

## 保留中のアイデア

- 推しへの累計投資額（生涯まとめ）、月間まとめのシェア画像
- オフライン対応（会場の電波問題向け。PWA基盤はあり、工数大きめ）
- バックアップ自動化（週次エクスポート等。現状はCSV手動のみ）
- IP単位のレート制限（現状はメールアドレス単位のみ）
- 閉館済み会場（マイナビBLITZ赤坂等）のマスタ整理
- ※外部イベント情報の自動取り込みは規約・形式の問題で見送り（イベント名候補は自分の履歴からの補完で対応済み 2026-07-08）

## 独自ドメイン（genbalog.com）の割り当て状況

render.yaml に `domains: genbalog.com / www.genbalog.com` を設定済み（2026-07-08）。
有効化には Cloudflare 側のDNSレコード設定と Render 側の検証完了が必要。
レコードの値は Render ダッシュボード → genba-tracker → Settings → Custom Domains の表示に従う（apexはA 216.24.57.1、wwwはCNAME genba-tracker.onrender.com が通例）。Cloudflareのプロキシは「DNSのみ」（グレー雲）にするのが無難。
