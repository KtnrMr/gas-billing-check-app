function setupApplicationSheets() {
  validateConfig_();
  return withScriptLock_(function() {
    var ss = getBillingSpreadsheet_();
    ensureSheet_(ss, APP.SHEETS.MONTH, APP.HEADERS.MONTH);
    ensureSheet_(ss, APP.SHEETS.HONOBONO, APP.HEADERS.HONOBONO);
    ensureSheet_(ss, APP.SHEETS.ADJUSTMENT, APP.HEADERS.ADJUSTMENT);
    ensureSheet_(ss, APP.SHEETS.CASH_MASTER, APP.HEADERS.CASH_MASTER);
    ensureSheet_(ss, APP.SHEETS.ESHU, APP.HEADERS.ESHU);
    ensureSheet_(ss, APP.SHEETS.RECONCILE, APP.HEADERS.RECONCILE);
    ensureSheet_(ss, APP.SHEETS.HISTORY, APP.HEADERS.HISTORY);
    ensureSheet_(ss, APP.SHEETS.NAME_CONFIRMED, APP.HEADERS.NAME_CONFIRMED);
    var settingsSheet = ensureSheet_(ss, APP.SHEETS.SETTINGS, APP.HEADERS.SETTINGS);
    seedDefaultSettings_(settingsSheet);
    return {
      message: '請求確定チェックアプリのシートを初期化しました。',
      version: APP.VERSION
    };
  });
}

function seedDefaultSettings_(sheet) {
  var existing = readSheetObjects_(sheet).reduce(function(map, row) {
    map[normalizeString_(row['設定キー'])] = true;
    return map;
  }, {});
  var rows = Object.keys(APP.DEFAULT_SETTINGS).filter(function(key) {
    return !existing[key];
  }).map(function(key) {
    return {
      '設定キー': key,
      '設定値': APP.DEFAULT_SETTINGS[key],
      '説明': getSettingsDescription_(key)
    };
  });
  appendSheetObjects_(sheet, APP.HEADERS.SETTINGS, rows);
}

function getSettingsDescription_(key) {
  var descriptions = {
    MASTER_SPREADSHEET_ID: '既存マスタのスプレッドシートID',
    BASIC_INFO_SHEET_NAME: '基本情報マスタのシート名',
    ENDED_USER_SHEET_NAME: '利用終了者マスタのシート名',
    MASTER_ID_COLUMN: 'マスタのID列名'
  };
  return descriptions[key] || '';
}
