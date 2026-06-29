var APP = Object.freeze({
  VERSION: '0.4.8',
  MONTHLY_STOP_LABEL: '当月停止',
  LEGACY_HOLD_LABEL: '請求保留',
  TIMEZONE: 'Asia/Tokyo',
  PROPERTY_KEYS: {
    BILLING_SS_ID: 'BILLING_SPREADSHEET_ID',
    MASTER_SS_ID: 'MASTER_SPREADSHEET_ID',
    DEBUG_PERFORMANCE: 'DEBUG_PERFORMANCE'
  },
  SETTINGS_KEYS: {
    MASTER_SPREADSHEET_ID: 'MASTER_SPREADSHEET_ID',
    BASIC_INFO_SHEET_NAME: 'BASIC_INFO_SHEET_NAME',
    ENDED_USER_SHEET_NAME: 'ENDED_USER_SHEET_NAME',
    MASTER_ID_COLUMN: 'MASTER_ID_COLUMN',
    MASTER_CACHE_SYNCED_AT: 'MASTER_CACHE_SYNCED_AT'
  },
  DEFAULT_SETTINGS: {
    MASTER_SPREADSHEET_ID: '',
    BASIC_INFO_SHEET_NAME: '基本情報マスタ',
    ENDED_USER_SHEET_NAME: '利用終了者マスタ',
    MASTER_ID_COLUMN: 'ID',
    MASTER_CACHE_SYNCED_AT: ''
  },
  SHEETS: {
    MONTH: '請求月管理',
    HONOBONO: 'ほのぼの取込',
    ADJUSTMENT: '請求調整',
    CASH_MASTER: '現金支払いマスタ',
    ESHU: 'e集ちゃん取込',
    RECONCILE: '照合結果',
    HISTORY: '操作履歴',
    NAME_CONFIRMED: '氏名確認済み',
    SETTINGS: '設定',
    MASTER_CACHE: '利用者マスタキャッシュ',
    BILLING_CACHE: '請求計算キャッシュ',
    BILLING_MEMO: '請求整理メモ'
  },
  MONTH_STATUS: {
    WORKING: '作業中',
    RECONCILED: '照合済',
    CONFIRMED: '確定済'
  },
  MASTER_CATEGORY: {
    ACTIVE: '利用中',
    ENDED: '終了者',
    UNREGISTERED: '未登録'
  },
  ADJUSTMENT_TYPES: {
    CASH: '現金支払い',
    HOLD: '当月停止',
    ADDITIONAL: '追加請求',
    PAST_ONLY: '過去分のみ請求',
    AMOUNT_FIX: '金額修正'
  },
  RECONCILE_JUDGMENT: {
    OK: 'OK',
    AMOUNT_MISMATCH: '金額不一致',
    NOT_INPUT: '未入力',
    EXTRA_INPUT: '余計な入力',
    ID_UNREGISTERED: 'ID未登録',
    NAME_WARNING: '氏名注意'
  },
  IMPORT_JUDGMENT: {
    OK: 'OK',
    ID_ERROR: 'IDエラー',
    AMOUNT_ERROR: '金額エラー',
    AMOUNT_WARNING: '金額注意',
    ID_UNREGISTERED: 'ID未登録'
  },
  HEADERS: {
    MONTH: [
      '対象月', '状態', 'ほのぼの取込日時', 'ほのぼの取込件数', 'ほのぼの取込合計額',
      '現金件数', '現金合計額', '保留件数', '保留合計額', '入力対象件数', '入力対象合計額',
      'e集ちゃん取込日時', 'e集ちゃん件数', 'e集ちゃん合計額', '不一致件数',
      '確定日時', '確定者', '確定解除日時', '確定解除者', '確定解除理由',
      '完了マーク照合用ID', '最終コピー照合用ID', '最終コピー日時', '最終コピー金額'
    ],
    HONOBONO: [
      '対象月', '取込回数', '取込日時', '行番号', '利用者番号', '照合用ID', '利用者名',
      '基本情報氏名', 'マスタ区分', '請求額', '取込判定', '備考'
    ],
    ADJUSTMENT: [
      '調整ID', '対象月', '照合用ID', '氏名', '調整区分', '対象請求月', '調整金額',
      '理由', 'メモ', '有効', '作成日時', '作成者', '更新日時', '更新者', '削除日時', '削除者'
    ],
    CASH_MASTER: [
      '照合用ID', '氏名', '通常現金', '適用開始月', '適用終了月', '理由・メモ',
      '作成日時', '作成者', '更新日時', '更新者'
    ],
    ESHU: [
      '対象月', '取込回数', '取込日時', '行番号', '顧客番号', '照合用ID', '顧客名',
      '基本情報氏名', 'マスタ区分', '請求金額', '取込判定', '備考'
    ],
    RECONCILE: [
      '対象月', '照合日時', '照合用ID', '基本情報氏名', 'ほのぼの氏名', 'e集ちゃん氏名',
      '請求状態', 'ほのぼの請求額', '追加請求額', '最終請求額', 'e集ちゃん請求金額', '差額',
      '判定', '備考'
    ],
    HISTORY: [
      '履歴ID', '日時', '操作者', '対象月', '操作種別', '対象ID', '対象氏名',
      '変更前', '変更後', 'メモ'
    ],
    SETTINGS: ['設定キー', '設定値', '説明'],
    NAME_CONFIRMED: [
      '照合用ID', '氏名', '確認日時', '確認者', 'メモ'
    ],
    MASTER_CACHE: [
      '照合用ID', '顧客番号', '氏名', 'フリガナ', 'マスタ区分', '同期日時'
    ],
    BILLING_CACHE: [
      '対象月', '更新日時', '照合用ID', '顧客番号', '氏名', '基本情報氏名', 'フリガナ', 'マスタ区分',
      '請求状態', 'ほのぼの氏名', 'ほのぼの請求額', '追加請求額', '過去分金額', '最終請求額',
      '入力対象', '当月停止', '照合対象', '入力一覧表示', '金額コピー可', '取込判定', '警告', '調整JSON'
    ],
    BILLING_MEMO: [
      '対象月', '照合用ID', '氏名', 'メモ', '更新日時', '更新者'
    ]
  },
  HONOBONO_CSV: {
    ID: '利用者番号',
    NAME: '利用者名',
    AMOUNT: '請求額',
    ID_ALIASES: ['利用者番号', '利用者ID', 'ID'],
    NAME_ALIASES: ['利用者名', '氏名', '名前'],
    AMOUNT_ALIASES: ['請求額', '請求金額', '金額', '合計請求額']
  },
  ESHU_CSV: {
    ID: '顧客番号',
    NAME: '顧客名',
    AMOUNT: '請求金額',
    ID_ALIASES: ['顧客番号', '顧客コード', '利用者番号', '利用者ID', '顧客ID', 'コード', 'ID'],
    NAME_ALIASES: ['顧客名', '利用者名', '氏名', '名前', 'お客様名'],
    AMOUNT_ALIASES: ['請求金額', '請求額', '振替金額', '引落金額', '集金額', '金額', '合計請求額', '合計金額', '合計']
  },
  HISTORY_TYPES: {
    HONOBONO_IMPORT: 'ほのぼの取込',
    ESHU_IMPORT: 'e集ちゃん取込',
    ADJUSTMENT_ADD: '調整追加',
    ADJUSTMENT_UPDATE: '調整変更',
    ADJUSTMENT_DELETE: '調整削除',
    CASH_ADD: '現金マスタ追加',
    CASH_UPDATE: '現金マスタ変更',
    CASH_DELETE: '現金マスタ削除',
    RECONCILE: '照合',
    CONFIRM: '確定',
    UNCONFIRM: '確定解除',
    NAME_CONFIRM: '氏名確認'
  }
});
