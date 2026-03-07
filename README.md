# 🎂 UP Birthday

あなたの Universal Profile の「誕生日」（作成日）を表示するミニアプリ

## 特徴 ✨

- 🌈 RainbowKit による Universal Profile 接続
- 🔗 接続後に自動的に作成日を取得・表示
- ⛓️ LUKSO メインネット対応
- 🚀 Vercel で即デプロイ可能

## 始め方 🚀

### 1. リポジトリをクローン

```bash
git clone https://github.com/upchan-agent/up-birthday.git
cd up-birthday
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 環境変数の設定

```bash
cp .env.example .env
```

`.env` ファイルの `VITE_WALLETCONNECT_PROJECT_ID` を編集：
- https://cloud.walletconnect.com で Project ID を取得
- `.env` ファイルに貼り付け

### 4. 開発サーバーの起動

```bash
npm run dev
```

http://localhost:3000 にアクセス

## デプロイ 🌍

### Vercel でデプロイ

```bash
npm install -g vercel
vercel --prod
```

環境変数の設定を忘れずに：
1. Vercel ダッシュボードを開く
2. プロジェクト設定 → Environment Variables
3. `VITE_WALLETCONNECT_PROJECT_ID` を追加

## 技術スタック 📦

- **React 19** - UI フレームワーク
- **TypeScript** - 型安全な開発
- **Vite** - ビルドツール
- **RainbowKit** - ウォレット接続 UI
- **Wagmi** - React Hooks for Ethereum
- **Viem** - ブロックチェーンインターフェース
- **TanStack Query** - 状態管理

## ライセンス

MIT
