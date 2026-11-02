# 睡眠日誌（Sleep Diary）— 機能開発版 v0.1.0

© 2021–2026 Dobhar-chú

**これは開発・検証版です。実名・実際の服薬情報など、機微なデータは入力しないでください。**

## できること

- Firebase Authentication（メール＋パスワード）の登録・ログイン・メール認証
- メールアドレスの変更（現在のパスワードで再認証後、新メール確認）
- パスワード再設定メールの送信
- Firestore への日付別睡眠・休息・服薬、眠気、出来事の記録
- 月間ガントチャート（2026年9月〜、24時間×30分単位）
- 「通常の睡眠時間帯」は表の時刻見出しのみ色を付ける
- カラー印刷・白黒印刷で識別できる塗りつぶし、太い斜線と輪郭記号
- 服用薬の開始日・終了日・変更履歴、6種類のテーマカラー
- 日次・週次・月次の**入力内容の単純集計**。医学的な分析・診断は行いません
- ブラウザの印刷機能を使う A4 横 1 ページの PDF 保存・印刷

## GitHub Pages へ置くファイル

`index.html`、`styles.css`、`app.js`、`.nojekyll` を、リポジトリの最上位（ルート）に配置してください。

1. GitHubの `sbcmt/sleep-diary` → **Add file** → **Upload files**
2. 上記の4ファイルをアップロードしてコミット
3. **Settings** → **Pages** → **Deploy from a branch** → `main` / `/(root)` → Save
4. 公開先（予定）は `https://sbcmt.github.io/sleep-diary/`。この時点では**テスターのみ**使用してください。
5. Firebase Console → **Authentication** → **Settings** → **Authorized domains** で `sbcmt.github.io` を許可（追加されていない場合）。

GitHubにはアプリのソースコードのみ置きます。利用者の医療記録・秘密鍵・管理者用認証情報は置きません。FirebaseのWeb設定 `apiKey` は一般に公開アプリへ組み込む識別用キーで、アクセス制御は Firebase Authentication と Firestore Security Rules で行います。

## Firestore データ構成

- `users/{uid}`：`name, habitBed, habitWake, theme, updatedAt`
- `users/{uid}/days/{YYYY-MM-DD}`：`slots[48], markers, wakeSleepiness, daySleepiness, note, updatedAt`
- `users/{uid}/medications/{medId}`：`name, start, end, updatedAt`

※ Firestore Security Rules はGitHubで公開するだけでは反映されません。既に Firebase Console で公開した本人・メール認証済みのルールを使います。

## 公開前に必須の検証・実装

- 実Firebase接続：新規登録、メール確認、ログイン、ブラウザ再起動、メール変更、パスワード再設定
- 実Firestoreにテスト用架空データのみで保存・復帰できること
- 別ユーザーによる `/users/{他人のuid}` と各サブコレクションの読み書きが全て拒否されること
- 権限ルール検証、入力データ検証、メール送信の悪用防止、通信断時の保存失敗表示、複数端末同時編集の競合対策
- アカウント削除時の全記録削除、バックアップ・復元、正式なプライバシーポリシーと削除依頼窓口
- 本番に向けた認証メールの表示名・文面・許可ドメイン、公開導線と運用ルール
- 自動更新の仕組み、実機スマートフォンテストと印刷検証

## 検証済み（模擬Firebaseでのブラウザ試験）

2026-11-02：ログイン画面 → 月間表、日付をまたぐ記録の2日分一括保存、休息、出来事、服用薬・設定保存、メール変更確認リンク送信、パスワード再設定メール送信、日次・週次・月次の画面遷移を確認。JS例外なし。A4横PDFは30日・31日の両方で各1ページを確認。

**実Firebase接続テスト・正式公開・安全性保証は未完了です。**
