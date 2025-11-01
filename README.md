# XRift CLI

XRift のワールドやアバターをコマンドラインからアップロードするための公式CLIツールです。

## 機能

- 新規プロジェクトの作成（テンプレートから）
- ブラウザ認証によるログイン
- ワールドのアップロード（複数ファイル対応）
- 新規作成と更新の自動判定
- アップロード進捗の可視化
- インタラクティブプロンプトでタイトル・説明を入力
- ビルドコマンド自動実行（アップロード前）
- サムネイル画像の設定

## インストール

```bash
npm install -g @xrift/cli
```

## クイックスタート

```bash
# XRiftにログイン
xrift login

# 対話式モードで新規プロジェクトを作成（推奨）
xrift create

# または、コマンドラインで指定
xrift create my-world

# プロジェクトに移動（新しいディレクトリに作成した場合）
cd my-world

# 開発サーバーを起動
npm run dev

# ワールドをアップロード（buildCommandが設定されていれば自動でビルドされます）
xrift upload world
```

## 使い方

### 1. 新規プロジェクトを作成

テンプレートから新しいワールドプロジェクトを作成します。

#### 対話式モード（推奨）

基本的に対話式で、省略されたオプションのみ質問します：

```bash
# 全て対話式で選択
xrift create

# プロジェクト名だけ指定、残りは対話式
xrift create my-world

# 場所も指定、テンプレートとインストールは対話式
xrift create my-world --here
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
xrift create my-world -y
xrift create my-world --no-interactive

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
    "distDir": "./dist",
    "title": "My Awesome World",
    "description": "A beautiful VR world",
    "thumbnailPath": "thumbnail.png",
    "buildCommand": "npm run build"
  }
}
```

**設定項目:**
- `distDir` (必須): アップロードするビルド済みファイルが格納されているディレクトリ
- `title` (任意): ワールドのタイトル（設定されていればプロンプトのデフォルト値になります）
- `description` (任意): ワールドの説明（設定されていればプロンプトのデフォルト値になります）
- `thumbnailPath` (任意): `distDir`内のサムネイル画像の相対パス（例: `thumbnail.png`）
- `buildCommand` (任意): アップロード前に自動実行するビルドコマンド

注：`xrift create` で作成したプロジェクトには自動的に `xrift.json` が含まれています。

### 4. ワールドをアップロード

```bash
xrift upload world
```

**アップロードの流れ:**

1. **ビルドコマンドの実行** (設定されている場合)
   - `xrift.json`の`buildCommand`が自動実行されます
   - ビルドに失敗した場合、アップロードは中止されます

2. **メタデータの入力** (新規作成時のみ)
   - タイトル（必須）
   - 説明（任意）
   - `xrift.json`に設定があれば、デフォルト値として使用されます

3. **ファイルのアップロード**
   - `distDir`内の全ファイルがアップロードされます
   - サムネイル画像（`thumbnailPath`で指定）も含まれます
   - 進捗バーで状況を確認できます

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
    "distDir": "./dist",
    "title": "My Awesome World",
    "description": "A beautiful VR world",
    "thumbnailPath": "thumbnail.png",
    "buildCommand": "npm run build"
  }
}
```

全てのフィールドは`distDir`以外は任意です。

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
