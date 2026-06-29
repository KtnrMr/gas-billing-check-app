var billingContextMemoryCache_ = {};

function clearBillingContextMemoryCache_() {
  billingContextMemoryCache_ = {};
}

function getBillingContextMemoryCache_(month) {
  return billingContextMemoryCache_[month] || null;
}

function setBillingContextMemoryCache_(month, ctx) {
  if (!month || !ctx) return;
  billingContextMemoryCache_[month] = ctx;
}

function clearBillingRecordCache_(targetMonth) {
  var month = normalizeYearMonth_(targetMonth);
  if (!month) return;
  delete billingContextMemoryCache_[month];
  var sheet = getBillingSpreadsheet_().getSheetByName(APP.SHEETS.BILLING_CACHE);
  if (!sheet || sheet.getLastRow() < 2) return;
  replaceMonthRowsInSheet_(sheet, APP.HEADERS.BILLING_CACHE, '対象月', month, []);
}

function clearAllBillingRecordCache_() {
  clearBillingContextMemoryCache_();
  var sheet = getBillingSpreadsheet_().getSheetByName(APP.SHEETS.BILLING_CACHE);
  if (!sheet || sheet.getLastRow() < 2) return;
  writeSheetObjects_(sheet, APP.HEADERS.BILLING_CACHE, []);
}

function serializeAdjustmentsForCache_(adjList) {
  return JSON.stringify((adjList || []).map(function(item) {
    return {
      id: item.id,
      matchId: item.matchId,
      name: item.name,
      type: item.type,
      targetBillingMonth: item.targetBillingMonth,
      amount: item.amount,
      reason: item.reason,
      memo: item.memo
    };
  }));
}

function deserializeAdjustmentsFromCache_(text) {
  if (!text) return [];
  try {
    var parsed = JSON.parse(String(text));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function serializeWarningsForCache_(warnings) {
  return JSON.stringify(warnings || []);
}

function deserializeWarningsFromCache_(text) {
  if (!text) return [];
  try {
    var parsed = JSON.parse(String(text));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function billingRecordToCacheRow_(month, syncedAt, record) {
  var pastOnlyAmount = (record.adjustments || []).filter(function(item) {
    return item.type === APP.ADJUSTMENT_TYPES.PAST_ONLY;
  }).reduce(function(sum, item) {
    return sum + item.amount;
  }, 0);
  return {
    '対象月': month,
    '更新日時': syncedAt,
    '照合用ID': record.matchId,
    '顧客番号': record.rawId,
    '氏名': record.name,
    '基本情報氏名': record.masterName || '',
    'フリガナ': record.masterKana || '',
    'マスタ区分': record.masterCategory || '',
    '請求状態': record.billingStatus,
    'ほのぼの氏名': record.honobonoName || '',
    'ほのぼの請求額': record.honobonoAmount,
    '追加請求額': record.additionalOnlyAmount,
    '過去分金額': pastOnlyAmount,
    '最終請求額': record.finalAmount,
    '入力対象': record.isInputTarget ? '1' : '',
    '当月停止': record.isMonthlyStop ? '1' : '',
    '照合対象': record.isReconcileTarget ? '1' : '',
    '入力一覧表示': record.showOnInputList ? '1' : '',
    '金額コピー可': record.canCopyAmount ? '1' : '',
    '取込判定': record.importJudgment || '',
    '警告': serializeWarningsForCache_(record.warnings),
    '調整JSON': serializeAdjustmentsForCache_(record.adjustments)
  };
}

function billingRecordFromCacheRow_(row) {
  var matchId = normalizeIdForMatch_(row['照合用ID']);
  if (!matchId) return null;
  var additionalOnlyAmount = Number(row['追加請求額']) || 0;
  var pastOnlyAmount = Number(row['過去分金額']) || 0;
  var isMonthlyStop = isTruthyFlag_(row['当月停止']);
  var finalAmount = Number(row['最終請求額']) || 0;
  return {
    matchId: matchId,
    rawId: normalizeString_(row['顧客番号']),
    name: normalizeString_(row['氏名']),
    honobonoName: normalizeString_(row['ほのぼの氏名']),
    masterName: normalizeString_(row['基本情報氏名']) || normalizeString_(row['氏名']),
    masterKana: normalizeString_(row['フリガナ']),
    masterCategory: normalizeString_(row['マスタ区分']) || APP.MASTER_CATEGORY.UNREGISTERED,
    billingStatus: normalizeString_(row['請求状態']),
    honobonoAmount: Number(row['ほのぼの請求額']) || 0,
    additionalAmount: additionalOnlyAmount + pastOnlyAmount,
    additionalOnlyAmount: additionalOnlyAmount,
    finalAmount: finalAmount,
    isInputTarget: isTruthyFlag_(row['入力対象']),
    isMonthlyStop: isMonthlyStop,
    showOnInputList: isTruthyFlag_(row['入力一覧表示']),
    canCopyAmount: isTruthyFlag_(row['金額コピー可']),
    isReconcileTarget: isTruthyFlag_(row['照合対象']),
    inputDisplay: isMonthlyStop ? APP.MONTHLY_STOP_LABEL : String(finalAmount),
    adjustments: deserializeAdjustmentsFromCache_(row['調整JSON']),
    warnings: deserializeWarningsFromCache_(row['警告']),
    importJudgment: normalizeString_(row['取込判定'])
  };
}

function readBillingRecordCache_(targetMonth) {
  var month = normalizeYearMonth_(targetMonth);
  if (!month) return null;
  var sheet = getBillingSpreadsheet_().getSheetByName(APP.SHEETS.BILLING_CACHE);
  if (!sheet || sheet.getLastRow() < 2) return null;

  var records = [];
  readSheetObjects_(sheet).forEach(function(row) {
    if (!yearMonthKeyEquals_(row['対象月'], month)) return;
    var record = billingRecordFromCacheRow_(row);
    if (record) records.push(record);
  });
  return records.length ? records : null;
}

function writeBillingRecordCache_(targetMonth, records) {
  var month = normalizeYearMonth_(targetMonth);
  if (!month) return;
  if (!records || !records.length) {
    clearBillingRecordCache_(month);
    return;
  }

  var syncedAt = formatDateTime_(new Date());
  var rows = records.map(function(record) {
    return billingRecordToCacheRow_(month, syncedAt, record);
  }).sort(function(a, b) {
    return compareByKanaName_(a, b);
  });
  var sheet = ensureSheet_(
    getBillingSpreadsheet_(),
    APP.SHEETS.BILLING_CACHE,
    APP.HEADERS.BILLING_CACHE
  );
  replaceMonthRowsInSheet_(sheet, APP.HEADERS.BILLING_CACHE, '対象月', month, rows);
}

function honobonoMapFromRecords_(records) {
  var rows = {};
  var list = [];
  (records || []).forEach(function(record) {
    if (!record.honobonoName && !(record.honobonoAmount > 0)) return;
    var entry = {
      matchId: record.matchId,
      rawId: record.rawId,
      name: record.honobonoName,
      masterName: record.masterName,
      masterCategory: record.masterCategory,
      amount: record.honobonoAmount,
      judgment: record.importJudgment || '',
      note: ''
    };
    rows[record.matchId] = entry;
    list.push(entry);
  });
  return { batch: 0, rows: rows, list: list };
}

function adjustmentsMapFromRecords_(records) {
  var map = {};
  (records || []).forEach(function(record) {
    if (!record.adjustments || !record.adjustments.length) return;
    map[record.matchId] = record.adjustments;
  });
  return map;
}

function buildBillingContextFromCachedRecords_(month, records) {
  return {
    month: month,
    users: null,
    honobono: honobonoMapFromRecords_(records),
    adjustments: adjustmentsMapFromRecords_(records),
    cashMaster: {},
    records: records
  };
}

function storeBillingRecordContext_(ctx) {
  if (!ctx || !ctx.month || !ctx.records) return;
  setBillingContextMemoryCache_(ctx.month, ctx);
  writeBillingRecordCache_(ctx.month, ctx.records);
}
