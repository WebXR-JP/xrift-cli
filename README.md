# XRift CLI

XRift のワールドやアバターをコマンドラインからアップロードするための公式CLIツールです。

## 機能

- ブラウザ認証によるログイン
- ワールドのアップロード（複数ファイル対応）
- 新規作成と更新の自動判定
- アップロード進捗の可視化

## インストール

```bash
npm install -g xrift-cli
```

## 使い方

### 1. ログイン

まず、ブラウザ認証でログインします。

```bash
xrift login
```

ブラウザが自動的に開き、XRift での認証を行います。認証が完了すると、トークンが `~/.xrift/config.json` に保存されます。

### 2. プロジェクト設定

プロジェクトのルートディレクトリに `xrift.json` を作成します。

```json
{
  "world": {
    "distDir": "./dist"
  }
}
```

- `distDir`: アップロードするビルド済みファイルが格納されているディレクトリ

### 3. ワールドをアップロード

```bash
xrift upload world
```

初回実行時は新規ワールドが作成され、`.xrift/world.json` にワールドIDが保存されます。
2回目以降は既存のワールドが更新されます。

### その他のコマンド

#### 現在のログインユーザーを確認

```bash
xrift whoami
```

#### ログアウト

```bash
xrift logout
```

#### バージョン確認

```bash
xrift --version
```

#### ヘルプ表示

```bash
xrift --help
xrift upload --help
```

## 設定ファイル

### `xrift.json`（プロジェクト設定）

プロジェクトルートに配置し、gitにコミットします。

```json
{
  "world": {
    "distDir": "./dist"
  }
}
```

### `.xrift/world.json`（ワールドメタデータ）

CLI が自動生成します。gitignore に含めてください。

```json
{
  "id": "world_123abc",
  "createdAt": "2025-01-15T10:00:00Z",
  "lastUploadedAt": "2025-01-15T12:30:00Z"
}
```

## `.gitignore` の設定

プロジェクトの `.gitignore` に以下を追加してください：

```
.xrift/
```

## 対応ファイル形式

ワールドアップロードでは、以下のファイル形式に対応しています：

- `.glb`, `.gltf` - 3Dモデル
- `.png`, `.jpg`, `.jpeg`, `.webp` - 画像
- `.json` - 設定ファイル
- `.js` - スクリプト
- `.html`, `.css` - Webファイル
- その他のファイル

## トラブルシューティング

### ログインできない

- ブラウザが自動で開かない場合、ターミナルに表示されたURLを手動でブラウザにコピーしてください
- ファイアウォールでポート3000がブロックされていないか確認してください

### トークンが無効

再度ログインしてください：

```bash
xrift logout
xrift login
```

### ワールドアップロードが失敗する

- `xrift.json` が正しく設定されているか確認してください
- `distDir` が存在し、アップロードするファイルが含まれているか確認してください
- ログインしているか確認してください（`xrift whoami`）

## 開発に貢献する

開発環境のセットアップや公開手順については [CONTRIBUTING.md](CONTRIBUTING.md) をご覧ください。

## ライセンス

MIT
