# 🎂 UP Birthday

あなたの Universal Profile の「誕生日」（作成日）を表示するミニアプリ

## 特徴 ✨

- 📱 UniversalEverything Grid で自動検出
- 🔍 手動入力も可能
- ⛓️ LUKSO Indexer API で高速取得
- 🚀 Vercel で即デプロイ可能

## デモ 🌐

https://up-birthday.vercel.app

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

### 3. 開発サーバーの起動

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

## 技術スタック 📦

- **React 19** - UI フレームワーク
- **TypeScript** - 型安全な開発
- **Vite** - ビルドツール
- **@lukso/up-provider** - Universal Profile 接続
- **graphql-request** - LUKSO Indexer API クライアント

## 使い方 💡

### UniversalEverything Grid
UniversalEverything の Grid にミニアプリとして追加すると、自動的に UP が検出されます。

### 手動入力
アドレスを直接入力して Check ボタンをクリック。

### URL 共有
`?address=0x...` を URL に追加して共有可能。

## ライセンス

MIT

