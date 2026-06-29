function buildHistoryRow_(payload, now, operator) {
  return {
    '履歴ID': generateId_('HIS'),
    '日時': now || formatDateTime_(new Date()),
    '操作者': operator || getOperator_(),
    '対象月': payload.targetMonth || '',
    '操作種別': payload.type || '',
    '対象ID': payload.targetId || '',
    '対象氏名': payload.targetName || '',
    '変更前': payload.before == null ? '' : toJson_(payload.before),
    '変更後': payload.after == null ? '' : toJson_(payload.after),
    'メモ': payload.memo || ''
  };
}

function appendHistory_(payload) {
  var ss = getBillingSpreadsheet_();
  var sheet = ensureSheet_(ss, APP.SHEETS.HISTORY, APP.HEADERS.HISTORY);
  appendSheetObjectsFast_(sheet, APP.HEADERS.HISTORY, [buildHistoryRow_(payload)]);
}

function appendHistoryBatch_(entries) {
  if (!entries || !entries.length) return;
  var ss = getBillingSpreadsheet_();
  var sheet = ensureSheet_(ss, APP.SHEETS.HISTORY, APP.HEADERS.HISTORY);
  var now = formatDateTime_(new Date());
  var operator = getOperator_();
  appendSheetObjectsFast_(sheet, APP.HEADERS.HISTORY, entries.map(function(entry) {
    return buildHistoryRow_(entry, now, operator);
  }));
}

function getHistory(targetMonth) {
  validateConfig_();
  var sheet = getBillingSpreadsheet_().getSheetByName(APP.SHEETS.HISTORY);
  if (!sheet) return [];
  var month = normalizeYearMonth_(targetMonth);
  return readSheetObjects_(sheet).filter(function(row) {
    if (!month) return true;
    return normalizeYearMonth_(row['対象月']) === month;
  }).reverse();
}
