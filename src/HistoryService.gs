function appendHistory_(payload) {
  var ss = getBillingSpreadsheet_();
  var sheet = ensureSheet_(ss, APP.SHEETS.HISTORY, APP.HEADERS.HISTORY);
  appendSheetObjects_(sheet, APP.HEADERS.HISTORY, [{
    '履歴ID': generateId_('HIS'),
    '日時': formatDateTime_(new Date()),
    '操作者': getOperator_(),
    '対象月': payload.targetMonth || '',
    '操作種別': payload.type || '',
    '対象ID': payload.targetId || '',
    '対象氏名': payload.targetName || '',
    '変更前': payload.before == null ? '' : toJson_(payload.before),
    '変更後': payload.after == null ? '' : toJson_(payload.after),
    'メモ': payload.memo || ''
  }]);
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
