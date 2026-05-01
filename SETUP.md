# 自宅デスクトップでのセットアップ手順

このプロジェクトを動かすには Node.js が必要です。

## 1. Node.js をインストール

https://nodejs.org からLTS版（v20以上）をダウンロードしてインストールしてください。インストール後、コマンドプロンプト（またはPowerShell）で確認:

```bash
node --version
npm --version
```

## 2. このフォルダで依存パッケージをインストール

```bash
cd shisetsu-tensu
npm install
```

数分かかります。

## 3. ローカルで動作確認

```bash
npm run dev
```

ブラウザが自動で開かない場合は `http://localhost:5173/shisetsu-tensu/` にアクセス。

## 4. テストを実行

```bash
npm test
```

15件のテストがすべてpassすればOKです。

## 5. GitHub に push

GitHub で `shisetsu-tensu` というPublicリポジトリを作成済みであれば:

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/<あなたのユーザー名>/shisetsu-tensu.git
git push -u origin main
```

## 6. GitHub Pages を有効化

1. GitHubのリポジトリページ → **Settings** → **Pages**
2. **Source** を **GitHub Actions** に変更
3. リポジトリのトップ → **Actions** タブ → "Deploy to GitHub Pages" のワークフローが緑色になるのを待つ（数分）

完了すると `https://<ユーザー名>.github.io/shisetsu-tensu/` でアプセス可能になります。

## 7. iPad で開く

職場のiPadのSafariで上記URLを開き、共有ボタン → 「ホーム画面に追加」。これで完了です。

## 改善・修正するとき

```bash
# コードを修正
npm run dev  # ローカルで確認

# 良ければ push
git add .
git commit -m "改善内容"
git push
```

数分後にiPadのアプリを開き直せば最新版になります。データはそのまま残ります。

## 困ったときに確認すること

- ビルドエラー → `npm install` を再実行
- iPadでアイコンが古いまま → アプリを完全に閉じて再度開く（iOSのアプリスイッチャーから上にスワイプ）
- データが消えた → 設定画面の「JSONインポート」で iCloud Drive のバックアップから復元

## 重要: 最初の運用ルール

1. **最初に動作確認したら、すぐにJSONバックアップを取る**（設定画面）
2. **月初の請求作業後は必ずバックアップ**を iCloud Drive に保存
3. **公開URLは絶対に変えない**（リポジトリ名を変えるとデータが全部消えます）
