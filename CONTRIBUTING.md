# 開発ガイド

XRift CLI の開発に貢献していただき、ありがとうございます！

## 開発環境のセットアップ

```bash
# リポジトリをクローン
git clone https://github.com/WebXR-JP/xrift-cli.git
cd xrift-cli

# 依存関係をインストール
npm install

# ビルド
npm run build
```

## 開発ワークフロー

### ビルド

```bash
npm run build
```

### 開発モードで実行

```bash
npm run dev -- --help
npm run dev -- login
npm run dev -- upload world
```

### 型チェック

```bash
npm run type-check
```

### Lint と フォーマット

```bash
# Lint
npm run lint

# フォーマット
npm run format
```

### ローカルでテスト

グローバルにリンクして、実際の `xrift` コマンドとしてテストできます：

```bash
npm link
xrift --version
xrift --help
```

テスト後、リンクを解除：

```bash
npm unlink -g @xrift/cli
```

## プロジェクト構造

```
xrift-cli/
├── src/
│   ├── commands/         # CLI コマンド
│   │   ├── login.ts      # ログインコマンド
│   │   ├── logout.ts     # ログアウトコマンド
│   │   ├── whoami.ts     # ユーザー情報表示
│   │   └── upload.ts     # アップロードコマンド
│   ├── lib/              # コアライブラリ
│   │   ├── api.ts        # API クライアント
│   │   ├── auth.ts       # 認証処理
│   │   ├── config.ts     # 設定ファイル管理
│   │   ├── constants.ts  # 定数定義
│   │   ├── project-config.ts # プロジェクト設定
│   │   └── upload.ts     # アップロード処理
│   ├── types/            # TypeScript 型定義
│   │   └── index.ts
│   └── index.ts          # エントリーポイント
├── dist/                 # ビルド出力（.gitignore）
├── package.json
├── tsconfig.json
└── README.md
```

## npm パッケージ公開

### 1. ビルドと検証

```bash
# 型チェック + ビルド
npm run prepublishOnly

# パッケージ内容を確認
npm pack --dry-run
```

### 2. バージョンアップ

```bash
# パッチバージョン（バグフィックス）: 0.1.0 -> 0.1.1
npm version patch

# マイナーバージョン（機能追加）: 0.1.0 -> 0.2.0
npm version minor

# メジャーバージョン（破壊的変更）: 0.1.0 -> 1.0.0
npm version major
```

### 3. npm にログイン（初回のみ）

```bash
npm login
```

### 4. パッケージを公開

```bash
npm publish
```

### 5. GitHub にプッシュ

```bash
git push origin main
git push --tags
```

## コーディング規約

- TypeScript の strict モードを使用
- ESLint と Prettier でコードスタイルを統一
- すべての関数に JSDoc コメントを記述
- エラーハンドリングを適切に実装
- ユーザーフレンドリーなエラーメッセージを提供

## テスト

現在、自動テストは未実装です。手動テストを行ってください：

```bash
# ローカルでリンク
npm link

# 各コマンドをテスト
xrift --version
xrift --help
xrift login
xrift whoami
xrift logout

# テスト用のxrift.jsonを作成
echo '{"world":{"distDir":"./dist"}}' > xrift.json

# ワールドアップロードテスト（distディレクトリに適当なファイルを配置）
mkdir -p dist
echo "test" > dist/test.txt
xrift upload world
```

## バックエンドAPI開発

CLI が正しく動作するには、以下のバックエンドAPIエンドポイントが必要です：

### 認証API

- `GET /cli-login?callback=URL&state=STATE`
  - ブラウザ認証ページを表示
  - 認証後、`callback?token=TOKEN&state=STATE` にリダイレクト

- `GET /api/auth/verify`
  - Headers: `Authorization: Bearer TOKEN`
  - Response: `{ valid: boolean, userId?: string, username?: string, email?: string }`

### ワールドAPI

- `POST /api/worlds`
  - Headers: `Authorization: Bearer TOKEN`
  - Body: `{ name: string }`
  - Response: `{ id: string, name?: string }`

- `POST /api/worlds/:id/upload-urls`
  - Headers: `Authorization: Bearer TOKEN`
  - Body: `{ files: [{ path: string, size: number }] }`
  - Response: `[{ url: string, key: string }]`

## 環境変数

開発時に異なるAPIエンドポイントを使用する場合：

```bash
export XRIFT_API_URL=http://localhost:8787
npm run dev -- login
```

## トラブルシューティング

### ビルドエラー

```bash
# node_modules を削除して再インストール
rm -rf node_modules package-lock.json
npm install
npm run build
```

### 型エラー

```bash
# 型チェックのみ実行
npm run type-check
```

## コントリビューション

1. Issue を作成して機能追加やバグ修正を提案
2. フォークしてブランチを作成
3. 変更を加えてコミット
4. プルリクエストを作成

## ライセンス

MIT
