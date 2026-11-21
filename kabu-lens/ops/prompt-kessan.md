# 決算の記録（上方修正の追跡）

- スケジュール: `CRON_TZ=Asia/Tokyo 38 21 * * 1-5`
- 毎回新しいセッションで実行、スマホ通知あり、環境はデフォルト
- `<記録帳のURL>` は、実際の指示文ではトレード記録帳のURL（Artifact の list で探す）

## 指示文の要点（2026-11-21 時点）

この控えは要点だけ。動いている指示文の全文は、スケジュールの get_trigger で読む（ここに全文を写すと古くなるため。2026-11-21 に要点だけに変えた）。`<記録帳のURL>` は実際にはトレード記録帳のURL。

- 保有株の適時開示の見張り（`--tdnet`。DILUTION・DANGER・LOSS は PDF の1〜2ページ目を読む）、今日の上方修正と前営業日の反応の大きい決算の記録（kessan）、決算短信の数字の記録（`--tanshin` → archive の tanshin-<日付>）、買おうとした銘柄（considered）と場中の判定（intraday）の答え合わせ。
- **11/21 本人と決定：通知は、保有株（放置の保有も含む）に flagged の開示（DILUTION・DANGER・LOSS・REVISION・TOB・DELAY）があった日だけ**。ほかの日は記録と答え合わせだけで、結果は最後の返答に書く。
- 書いてよいのは kessan・considered・intraday・settings の kessan_stats・considered_stats・intraday_stats・archive（kessan と tanshin）だけ。
