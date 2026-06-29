var BILLING_SPREADSHEET_CACHE_ = null;
var MASTER_SPREADSHEET_CACHE_ = null;

function getScriptProperty_(key) {
  return String(PropertiesService.getScriptProperties().getProperty(key) || '').trim();
}

function getConfig_() {
  return {
    BILLING_SS_ID: getScriptProperty_(APP.PROPERTY_KEYS.BILLING_SS_ID),
    MASTER_SS_ID: getScriptProperty_(APP.PROPERTY_KEYS.MASTER_SS_ID)
  };
}

function validateConfig_() {
  var config = getConfig_();
  var missing = [];
  if (!config.BILLING_SS_ID) missing.push(APP.PROPERTY_KEYS.BILLING_SS_ID);
  if (!config.MASTER_SS_ID) missing.push(APP.PROPERTY_KEYS.MASTER_SS_ID);
  if (missing.length) {
    throw new Error(missing.join(', ') + ' が Script Properties に設定されていません。');
  }
}

function getBillingSpreadsheet_() {
  validateConfig_();
  if (!BILLING_SPREADSHEET_CACHE_) {
    BILLING_SPREADSHEET_CACHE_ = SpreadsheetApp.openById(getConfig_().BILLING_SS_ID);
  }
  return BILLING_SPREADSHEET_CACHE_;
}

function getMasterSpreadsheet_() {
  validateConfig_();
  if (!MASTER_SPREADSHEET_CACHE_) {
    MASTER_SPREADSHEET_CACHE_ = SpreadsheetApp.openById(getConfig_().MASTER_SS_ID);
  }
  return MASTER_SPREADSHEET_CACHE_;
}

function readSettingsMap_() {
  var ss = getBillingSpreadsheet_();
  var sheet = ss.getSheetByName(APP.SHEETS.SETTINGS);
  if (!sheet || sheet.getLastRow() < 2) {
    return Object.assign({}, APP.DEFAULT_SETTINGS);
  }
  var settings = Object.assign({}, APP.DEFAULT_SETTINGS);
  readSheetObjects_(sheet).forEach(function(row) {
    var key = normalizeString_(row['設定キー']);
    if (!key) return;
    settings[key] = normalizeString_(row['設定値']);
  });
  return settings;
}

function getAppSettings_() {
  var settings = readSettingsMap_();
  var config = getConfig_();
  if (!settings.MASTER_SPREADSHEET_ID) {
    settings.MASTER_SPREADSHEET_ID = config.MASTER_SS_ID;
  }
  return settings;
}

function getMasterSpreadsheetFromSettings_() {
  var settings = getAppSettings_();
  var masterId = settings.MASTER_SPREADSHEET_ID || getConfig_().MASTER_SS_ID;
  if (!masterId) {
    throw new Error('MASTER_SPREADSHEET_ID が設定されていません。');
  }
  if (!MASTER_SPREADSHEET_CACHE_) {
    MASTER_SPREADSHEET_CACHE_ = SpreadsheetApp.openById(masterId);
  }
  return MASTER_SPREADSHEET_CACHE_;
}

function saveAppSetting_(key, value) {
  var normalizedKey = normalizeString_(key);
  if (!normalizedKey) return;
  var ss = getBillingSpreadsheet_();
  var sheet = ensureSheet_(ss, APP.SHEETS.SETTINGS, APP.HEADERS.SETTINGS);
  var existing = readSheetObjects_(sheet).find(function(row) {
    return normalizeString_(row['設定キー']) === normalizedKey;
  });
  upsertRowByKey_(sheet, APP.HEADERS.SETTINGS, '設定キー', {
    '設定キー': normalizedKey,
    '設定値': value == null ? '' : String(value),
    '説明': existing ? existing['説明'] : (getSettingsDescription_(normalizedKey) || '')
  });
}
