# XRift CLI

XRift のワールドやアバターをコマンドラインからアップロードするための公式CLIツールです。

## 機能

- 新規プロジェクトの作成（テンプレートから）
- ブラウザ認証によるログイン
- ワールドのアップロード（複数ファイル対応）
- 新規作成と更新の自動判定
- アップロード進捗の可視化

## クイックスタート

```bash
# 対話式モードで新規プロジェクトを作成（推奨）
npx @xrift/cli create

# または、コマンドラインで指定
npx @xrift/cli create my-world

# プロジェクトに移動（新しいディレクトリに作成した場合）
cd my-world

# 開発サーバーを起動
npm run dev

# ビルド
npm run build

# XRiftにログイン
npx @xrift/cli login

# ワールドをアップロード
npx @xrift/cli upload world
```

## インストール

グローバルインストール（オプション）：

```bash
npm install -g @xrift/cli
```

グローバルインストールしない場合は `npx @xrift/cli` で実行できます。

## 使い方

### 1. 新規プロジェクトを作成

テンプレートから新しいワールドプロジェクトを作成します。

#### 対話式モード（推奨）

基本的に対話式で、省略されたオプションのみ質問します：

```bash
# 全て対話式で選択
npx @xrift/cli create

# プロジェクト名だけ指定、残りは対話式
npx @xrift/cli create my-world

# 場所も指定、テンプレートとインストールは対話式
xrift create my-world --here

# グローバルインストール後
xrift create
```

対話式モードでは以下を選択できます：
- プロジェクト名（省略時）
- 作成場所（`--here` がない場合）
- テンプレート（`--template` がない場合）
- 依存関係のインストール有無（`--skip-install` がない場合）

#### 完全自動モード

対話を無効にして、全てコマンドラインで指定することもできます：

```bash
# 対話なし（プロジェクト名は必須）
npx @xrift/cli create my-world -y
npx @xrift/cli create my-world --no-interactive

# 全てのオプションを指定
xrift create my-world --here --template WebXR-JP/custom-template --skip-install -y
```

**オプション一覧:**
- `-y, --no-interactive` - 対話式を無効化（CI/スクリプト用）
- `--here` - カレントディレクトリに作成
- `-t, --template <repo>` - カスタムテンプレート
- `--skip-install` - npm install をスキップ

作成されたプロジェクトには以下が含まれます：
- React Three Fiber + Three.js のセットアップ
- Rapier 物理エンジンの統合
- Vite ビルド設定
- TypeScript 設定
- 開発用サンプルワールド

### 2. ログイン

まず、ブラウザ認証でログインします。

```bash
xrift login
```

ブラウザが自動的に開き、XRift での認証を行います。認証が完了すると、トークンが `~/.xrift/config.json` に保存されます。

### 3. プロジェクト設定

プロジェクトのルートディレクトリに `xrift.json` を作成します。

```json
{
  "world": {
    "distDir": "./dist"
  }
}
```

- `distDir`: アップロードするビルド済みファイルが格納されているディレクトリ

注：`xrift create` で作成したプロジェクトには自動的に `xrift.json` が含まれています。

### 4. ワールドをアップロード

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
