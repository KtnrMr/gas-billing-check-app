function getNameConfirmedMap_() {
  var sheet = getBillingSpreadsheet_().getSheetByName(APP.SHEETS.NAME_CONFIRMED);
  if (!sheet) return {};
  return readSheetObjects_(sheet).reduce(function(map, row) {
    var matchId = normalizeIdForMatch_(row['照合用ID']);
    if (!matchId) return map;
    map[matchId] = {
      matchId: matchId,
      name: normalizeString_(row['氏名']),
      confirmedAt: row['確認日時'],
      confirmedBy: normalizeString_(row['確認者']),
      memo: normalizeString_(row['メモ'])
    };
    return map;
  }, {});
}

function isNameConfirmed_(matchId) {
  return !!getNameConfirmedMap_()[normalizeIdForMatch_(matchId)];
}

function shouldShowNameWarning_(matchId, nameA, nameB) {
  if (!namesDiffer_(nameA, nameB)) return false;
  return !isNameConfirmed_(matchId);
}

function getNameConfirmedList() {
  validateConfig_();
  return Object.keys(getNameConfirmedMap_()).map(function(key) {
    return getNameConfirmedMap_()[key];
  }).sort(function(a, b) {
    return a.matchId.localeCompare(b.matchId);
  });
}

function confirmNameWarning(matchId, memo, targetMonth) {
  validateConfig_();
  return withScriptLock_(function() {
    var id = normalizeIdForMatch_(matchId);
    if (!id) throw new Error('照合用IDが不正です。');

    var users = loadMasterUsers_();
    var master = lookupMasterUser_(users, id);
    var name = master ? master.name : '';
    var now = formatDateTime_(new Date());
    var operator = getOperator_();
    var ss = getBillingSpreadsheet_();
    var sheet = ensureSheet_(ss, APP.SHEETS.NAME_CONFIRMED, APP.HEADERS.NAME_CONFIRMED);
    var existing = getNameConfirmedMap_()[id];

    var row = {
      '照合用ID': id,
      '氏名': name,
      '確認日時': now,
      '確認者': operator,
      'メモ': normalizeString_(memo)
    };
    upsertRowByKey_(sheet, APP.HEADERS.NAME_CONFIRMED, '照合用ID', row);

    appendHistory_({
      targetMonth: normalizeYearMonth_(targetMonth),
      type: APP.HISTORY_TYPES.NAME_CONFIRM,
      targetId: id,
      targetName: name,
      before: existing || null,
      after: row,
      memo: normalizeString_(memo)
    });

    var month = normalizeYearMonth_(targetMonth);
    if (month) {
      var monthRow = getMonthRow_(month);
      if (monthRow && normalizeString_(monthRow['e集ちゃん取込日時'])) {
        runReconcileInternal_(month);
        refreshMonthSummary_(month);
      }
    }

    return { success: true, matchId: id };
  });
}

function removeNameConfirmation(matchId) {
  validateConfig_();
  return withScriptLock_(function() {
    var id = normalizeIdForMatch_(matchId);
    if (!id) throw new Error('照合用IDが不正です。');
    var ss = getBillingSpreadsheet_();
    var sheet = getRequiredSheet_(ss, APP.SHEETS.NAME_CONFIRMED);
    replaceRowsByFilter_(sheet, APP.HEADERS.NAME_CONFIRMED, function(row) {
      return normalizeIdForMatch_(row['照合用ID']) === id;
    }, []);
    return { success: true };
  });
}
