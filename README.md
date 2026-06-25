# 請求確定チェックアプリ

通所介護施設の月次請求作業を補助する Google Apps Script Web アプリです。  
ほのぼのの請求CSV取込、e集ちゃんⅡへの入力作業補助、照合、請求確定までを行います。

## ファイル構成

```text
src/
  appsscript.json
  Code.gs
  Constants.gs
  Config.gs
  Utils.gs
  SheetRepository.gs
  Setup.gs
  MasterService.gs
  MonthService.gs
  ImportService.gs
  AdjustmentService.gs
  CashMasterService.gs
  BillingService.gs
  ReconcileService.gs
  ConfirmService.gs
  HistoryService.gs
  index.html
  script.html
  style.html
```

## Script Properties

GAS エディタの「プロジェクトの設定」→「スクリプト プロパティ」で設定します。

| プロパティ名 | 必須 | 説明 |
|---|---|---|
| `BILLING_SPREADSHEET_ID` | はい | 請求専用スプレッドシートID（新規作成） |
| `MASTER_SPREADSHEET_ID` | はい | 既存の基本情報マスタ等があるスプレッドシートID |

設定シートでも `MASTER_SPREADSHEET_ID` やシート名を上書きできます。

## 初回セットアップ

1. このリポジトリを clasp で紐付ける（`.clasp.example.json` を参考）
2. `npm install && npm run clasp:push` でコードを反映
3. Apps Script エディタで `runInitialSetup('MASTER_SPREADSHEET_ID')` を1回実行
4. Webアプリとしてデプロイ
5. デプロイ URL を開いて動作確認

詳細は [HANDOFF.md](HANDOFF.md) を参照。

## 主な機能（初期版）

- シート自動作成（請求月管理・取込・調整・照合・履歴・設定）
- ほのぼのCSV / e集ちゃんCSV 取込
- 現金支払いマスタ・請求調整
- 最終請求一覧とダッシュボード
- e集ちゃん入力作業モード（金額コピー・完了マーク）
- 照合結果表示
- 確定・確定解除・操作履歴

## 照合ルール

- ID照合は先頭0を無視して正規化
- 氏名は照合に使わず、表示・注意確認のみ
- 現金支払い・請求保留は e集ちゃん 入力対象から除外
- 合算・追加請求があっても同一利用者は1件

## clasp 同期

```bash
npm install
npm run clasp:login   # 初回のみ
npm run clasp:push
```

`.clasp.json` と `.clasprc.json` は GitHub へ登録しません。

## 初期版での前提・確認事項

| 項目 | 初期版の扱い |
|---|---|
| ログイン認証 | なし（GAS Webアプリのデプロイ権限で制御） |
| 金額修正 | ほのぼの請求額を調整金額で上書き |
| 再取込 | 取込回数を増やして追記。計算は最新回のみ使用 |
| 完了マーク | 請求月管理シートに保存 |
| 氏名注意 | ID単位で一度「確認済み」にすると翌月以降は表示しない |
| CSV文字コード | UTF-8 前提。文字化けする場合は Excel で「CSV UTF-8」として保存 |

## 金額修正について

| 調整区分 | 計算の意味 |
|---|---|
| 追加請求 | ほのぼの請求額に**足す** |
| 金額修正 | ほのぼの請求額を**無視し、調整金額を最終請求額とする** |
| 過去分のみ請求 | ほのぼのにいない人向け。調整金額が最終請求額 |

**例（ほのぼの請求額 12,340円の場合）**

| 調整 | 最終請求額 |
|---|---:|
| なし | 12,340 |
| 追加請求 +1,000 | 13,340 |
| 金額修正 12,000 | 12,000（+1,000 の追加請求があっても無視） |

金額修正は「ほのぼのの金額がおかしい／当月だけ変えたい」ときに使います。  
月遅れ分を足すだけなら「追加請求」を使ってください。
