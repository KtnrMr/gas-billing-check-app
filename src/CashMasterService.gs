function getCashMasterList() {
  validateConfig_();
  var sheet = getBillingSpreadsheet_().getSheetByName(APP.SHEETS.CASH_MASTER);
  if (!sheet) return [];
  return readSheetObjects_(sheet).sort(function(a, b) {
    return normalizeString_(a['氏名']).localeCompare(normalizeString_(b['氏名']), 'ja');
  });
}

function saveCashMaster(payload) {
  validateConfig_();
  return withScriptLock_(function() {
    var ss = getBillingSpreadsheet_();
    var sheet = ensureSheet_(ss, APP.SHEETS.CASH_MASTER, APP.HEADERS.CASH_MASTER);
    var matchId = normalizeIdForMatch_(payload.matchId);
    if (!matchId) throw new Error('照合用IDが不正です。');

    var users = loadMasterUsers_();
    var master = lookupMasterUser_(users, matchId);
    var name = normalizeString_(payload.name) || (master ? master.name : '');
    var now = formatDateTime_(new Date());
    var operator = getOperator_();
    var existing = readSheetObjects_(sheet).find(function(row) {
      return normalizeIdForMatch_(row['照合用ID']) === matchId;
    });

    var row = {
      '照合用ID': matchId,
      '氏名': name,
      '通常現金': isTruthyFlag_(payload.usuallyCash) ? '1' : '',
      '適用開始月': normalizeYearMonth_(payload.startMonth),
      '適用終了月': normalizeYearMonth_(payload.endMonth),
      '理由・メモ': normalizeString_(payload.memo),
      '作成日時': existing ? existing['作成日時'] : now,
      '作成者': existing ? existing['作成者'] : operator,
      '更新日時': now,
      '更新者': operator
    };

    upsertRowByKey_(sheet, APP.HEADERS.CASH_MASTER, '照合用ID', row);
    appendHistory_({
      targetMonth: '',
      type: existing ? APP.HISTORY_TYPES.CASH_UPDATE : APP.HISTORY_TYPES.CASH_ADD,
      targetId: matchId,
      targetName: name,
      before: existing || null,
      after: row,
      memo: ''
    });
    return { success: true };
  });
}

function getActiveCashMasterMap_(targetMonth) {
  var month = normalizeYearMonth_(targetMonth);
  return getCashMasterList().reduce(function(map, row) {
    if (!isTruthyFlag_(row['通常現金'])) return map;
    var matchId = normalizeIdForMatch_(row['照合用ID']);
    if (!matchId) return map;
    if (!isMonthInRange_(month, row['適用開始月'], row['適用終了月'])) return map;
    map[matchId] = row;
    return map;
  }, {});
}
