function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('請求確定チェックアプリ')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function bootstrapApp() {
  validateConfig_();
  return {
    version: APP.VERSION
  };
}

function getMonthInfo(targetMonth) {
  validateConfig_();
  var month = normalizeYearMonth_(targetMonth);
  if (!month) throw new Error('対象月が不正です。');
  var row = ensureMonthRow_(month);
  return buildMonthResponse_(row);
}

function getAppState(targetMonth) {
  return getMonthView(targetMonth);
}

/** 月情報＋集計サマリー（照合結果は含めない） */
function getMonthView(targetMonth) {
  validateConfig_();
  var month = normalizeYearMonth_(targetMonth);
  if (!month) throw new Error('対象月が不正です。');
  ensureMonthRow_(month);
  return {
    month: getMonthInfo(targetMonth),
    dashboard: getBillingBreakdown(month)
  };
}

function getCoreMonthState(targetMonth) {
  return getMonthView(targetMonth);
}

function getMonthSnapshot(targetMonth) {
  return getMonthView(targetMonth);
}

/**
 * 初回セットアップ用。Apps Script エディタから1回だけ実行する。
 * @param {string} masterSpreadsheetId 既存マスタのスプレッドシートID
 */
function runInitialSetup(masterSpreadsheetId) {
  var masterId = String(masterSpreadsheetId || '').trim();
  if (!masterId) {
    throw new Error('既存マスタのスプレッドシートIDを引数に指定してください。');
  }

  var props = PropertiesService.getScriptProperties();
  var billingId = props.getProperty(APP.PROPERTY_KEYS.BILLING_SS_ID);
  var billingSs;

  if (billingId) {
    billingSs = SpreadsheetApp.openById(billingId);
  } else {
    billingSs = SpreadsheetApp.create('請求確定チェック');
    billingId = billingSs.getId();
    props.setProperty(APP.PROPERTY_KEYS.BILLING_SS_ID, billingId);
  }

  props.setProperty(APP.PROPERTY_KEYS.MASTER_SS_ID, masterId);
  setupApplicationSheets();

  var billingSs = SpreadsheetApp.openById(billingId);
  var settingsSheet = billingSs.getSheetByName(APP.SHEETS.SETTINGS);
  if (settingsSheet) {
    var settingsRow = readSheetObjects_(settingsSheet).find(function(row) {
      return normalizeString_(row['設定キー']) === 'MASTER_SPREADSHEET_ID';
    });
    if (settingsRow) {
      settingsRow['設定値'] = masterId;
      upsertRowByKey_(settingsSheet, APP.HEADERS.SETTINGS, '設定キー', settingsRow);
    }
  }

  return {
    message: '初期セットアップが完了しました。',
    billingSpreadsheetId: billingId,
    billingSpreadsheetUrl: billingSs.getUrl(),
    masterSpreadsheetId: masterId,
    version: APP.VERSION
  };
}

function getSetupStatus() {
  var props = PropertiesService.getScriptProperties();
  return {
    version: APP.VERSION,
    billingSpreadsheetId: props.getProperty(APP.PROPERTY_KEYS.BILLING_SS_ID) || '',
    masterSpreadsheetId: props.getProperty(APP.PROPERTY_KEYS.MASTER_SS_ID) || ''
  };
}
