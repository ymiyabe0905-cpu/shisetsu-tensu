# shisetsu-tensu（施設点数管理アプリ）開発メモ

このファイルは Claude（Claude Code / Cowork）へのプロジェクト引き継ぎ用です。
**作業を始める前に必ずこのファイルを読んでください。**

## プロジェクト概要

薬局向け、**居宅療養管理指導費（介護）** および **在宅患者訪問薬剤管理指導料（医療）** の
人数判定・点数算出を補助する iPad PWA。事務員1名が iPad 1台で使う想定。

- 1薬局内のみで使用
- 外部API・サーバーなし。データは IndexedDB（ブラウザ内）に保存
- バックアップは JSON/CSV エクスポートで対応
- GitHub Pages で配信（無料運用）

## 技術スタック

- React 18 + TypeScript + Vite
- 状態管理: 自前の `useStore`（`src/state/store.tsx`）
- 永続化: IndexedDB（`src/storage/db.ts`）
- テスト: vitest
- デプロイ: GitHub Actions → GitHub Pages
- PWA: manifest + Service Worker（オフライン動作・iPadホーム画面追加可）

## 画面構成（7画面）

1. ダッシュボード
2. 施設一覧（棟ユニット・別建物トグル）
3. 患者一覧
4. 月別訪問登録（メイン画面・タップで訪問あり/なし切替）
5. 入退院記録（PatientEvent管理）
6. 計算結果（区分判定の根拠表示・CSV出力・印刷）
7. 設定（点数マスター変更・データバックアップ）

## ドメインルール（重要・必ず守る）

### 訪問記録

- 1ヶ月1回まで（複数回訪問しても1件のみ記録）
- タップ日 = 訪問日（再タップで取消）
- 加算・対面/オンライン区別はなし

### 区分判定（通し番号方式）

介護点数: 518（1人）/ 379（2-9人）/ 342（10人以上）
医療点数: 650（1人）/ 320（2-9人）/ 290（10人以上）

**継続者と新規者で個別に判定する：**

- 継続者（前月も訪問あり）: 前月区分のまま据置
- 新規者: 「前月人数 + 当月新規の中での順番」を通し番号として個別判定
  - 並び順は訪問日昇順、同日は患者ID昇順

例：前月7人(379) → 当月 継続7 + 新規3人 の場合

- 継続7人 = 379
- 新規1人目（通し番号8）= 379
- 新規2人目（通し番号9）= 379
- 新規3人目（通し番号10）= 342（境界の人だけ下がる）

前月実績ゼロから当月新規開始の場合、1人目は 518、2人目以降から 379。

### 特例（一律適用）

- **10%特例**: 戸数の10%以下なら全員1人区分（518/650）
- **20戸未満特例**: 戸数20未満かつ対象2人以下なら全員1人区分
- **個人宅同一世帯特例**: 同一世帯に2人以上いれば全員1人区分

### 棟移動

- すべての施設タイプで棟ユニット移動可能
- 各棟ユニットに「別建物として算定」トグル
  - ON → 別グループとして個別に区分判定
  - OFF → 親施設に合算
- グループホームでユニットが3つ以下なら自動的に `separateBuilding=true`

### 棟移動時の訪問記録自動置換（重要）

同月内に棟移動イベントがあり、既存の訪問が移動日より前の場合：

- 移動後の棟でタップしたら **削除ではなく日付を今日に置換**
- 結果として「移動後の最新訪問のみ」が残る
- 実装: `src/features/Visits.tsx` の `toggleVisit` 関数

## 主要ファイル

```
src/
├── domain/
│   ├── types.ts        … 型定義（AppData, Facility, Patient, VisitRecord, PatientEvent, Settings）
│   ├── calc.ts         … 区分判定・通し番号方式の本体（classifyBySerial, calculateMonth）
│   └── calc.test.ts    … vitest テスト
├── state/
│   └── store.tsx       … reducer + dispatch（useStore）
├── storage/
│   └── db.ts           … IndexedDB
├── features/
│   ├── Dashboard.tsx
│   ├── Facilities.tsx
│   ├── Patients.tsx
│   ├── Visits.tsx      … 月別訪問登録（toggleVisit に棟移動置換ロジック）
│   ├── Events.tsx
│   ├── Results.tsx     … 計算結果・CSV出力・印刷
│   └── Settings.tsx
├── components/
│   ├── MonthPicker.tsx
│   └── Modal.tsx
├── utils.ts
└── styles.css          … 前月✓タグはピンク赤（.tag-prev）
```

## デプロイ手順（ノートPC・デスクトップ共通）

```bash
# 作業開始前
git pull

# 変更後
npm test                 # 全テスト通ること確認
git add .
git commit -m "変更内容"
git push                 # GitHub Actions が自動デプロイ
```

数分後に iPad のアプリ（GitHub Pagesのホーム画面アイコン）にも反映されます。
iPad のデータ（IndexedDB）はアプリ更新後も消えません。

## 開発時の起動

```bash
npm install     # 初回のみ
npm run dev     # http://localhost:5173
```

## 過去のUI調整メモ

- 前月✓タグはピンク赤（目立たせるため）
- 患者ボタンに訪問日（M/D 訪問）を表示
- 計算結果画面で「継続/新規」を別表示・前月区分と当月区分の差分表示

## 注意・制約

- レセコンの代替ではなく**請求前チェック用の補助ツール**
- 最終請求はレセコンと制度確認を前提
- 外部API禁止・ダミーデータ以外の患者情報は扱わない
