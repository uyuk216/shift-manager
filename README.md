# シフト管理

ブラウザで動くオープンソースのシフト管理ツール。各自が自分のシフトを入力し、給料を計算し、端末のカレンダーへ一括反映できる。

- Google ログイン／ユーザーごとにデータ分離
- 時給計算：深夜割増・残業割増・休憩自動控除・勤務先ごと/曜日ごとの時給・交通費（同日同勤務先は1回）
- 時刻は5分刻み、日跨ぎ対応
- `.ics` 書き出し（iPhone / Android / Google / Outlook）。UID固定なので再取り込みしても重複しない
- ビルド不要の静的サイト（GitHub Pages）＋ Supabase 無料枠 → 完全無料

## セットアップ
1. [Supabase](https://supabase.com) で無料プロジェクトを作成
2. SQL Editor に `supabase/schema.sql` を貼って実行（RLSで「自分の行だけ」に制限）
3. `js/config.js` に Project URL と anon key を記入（anon key は公開OK）
4. Authentication → Providers で Google を有効化（Google Cloud の OAuth クライアントが必要）
5. Authentication → URL Configuration の Site URL に、公開先URL（`https://<user>.github.io/<repo>/`）を設定
6. GitHub の Settings → Pages で main ブランチを公開

`config.js` が空ならログインなしのローカルモード（ブラウザ保存）で動く。

## 注意
- Supabase 無料プロジェクトは1週間アクセスがないと一時停止する（ダッシュボードから再開可能）
- 計算は目安。休憩は勤務の中央で取る前提、割増は加算方式、日ごとに残業判定。実際の給与明細と異なる場合がある

## 開発
```
npm test        # 計算ロジックのテスト
npm run serve   # http://localhost:8080
```
