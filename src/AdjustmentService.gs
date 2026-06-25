function getActiveAdjustments_(targetMonth) {
  var month = normalizeYearMonth_(targetMonth);
  var sheet = getBillingSpreadsheet_().getSheetByName(APP.SHEETS.ADJUSTMENT);
  if (!sheet) return {};
  return readSheetObjects_(sheet).filter(function(row) {
    return normalizeYearMonth_(row['対象月']) === month && isActiveFlag_(row['有効']);
  }).reduce(function(map, row) {
    var matchId = normalizeIdForMatch_(row['照合用ID']);
    if (!matchId) return map;
    if (!map[matchId]) map[matchId] = [];
    map[matchId].push({
      id: normalizeString_(row['調整ID']),
      matchId: matchId,
      name: normalizeString_(row['氏名']),
      type: normalizeString_(row['調整区分']),
      targetBillingMonth: normalizeYearMonth_(row['対象請求月']),
      amount: Number(row['調整金額']) || 0,
      reason: normalizeString_(row['理由']),
      memo: normalizeString_(row['メモ']),
      row: row
    });
    return map;
  }, {});
}

function getAdjustments(targetMonth) {
  validateConfig_();
  var map = getActiveAdjustments_(targetMonth);
  var list = [];
  Object.keys(map).forEach(function(key) {
    map[key].forEach(function(item) {
      list.push(item);
    });
  });
  return list.sort(function(a, b) {
    return a.matchId.localeCompare(b.matchId);
  });
}

function saveAdjustmentNoLock_(payload) {
  var month = normalizeYearMonth_(payload.targetMonth);
  if (!month) throw new Error('対象月が不正です。');
  assertMonthEditable_(month);

  var matchId = normalizeIdForMatch_(payload.matchId);
  if (!matchId) throw new Error('照合用IDが不正です。');
  var type = normalizeString_(payload.type);
  var allowed = Object.keys(APP.ADJUSTMENT_TYPES).map(function(key) {
    return APP.ADJUSTMENT_TYPES[key];
  });
  if (allowed.indexOf(type) < 0) throw new Error('調整区分が不正です。');

    var users = loadMasterUsers_();
    var master = lookupMasterUser_(users, matchId);
    var name = normalizeString_(payload.name) || (master ? master.name : '');
    var now = formatDateTime_(new Date());
    var operator = getOperator_();
    var ss = getBillingSpreadsheet_();
    var sheet = ensureSheet_(ss, APP.SHEETS.ADJUSTMENT, APP.HEADERS.ADJUSTMENT);
    var adjustmentId = normalizeString_(payload.adjustmentId) || generateId_('ADJ');
    var existing = readSheetObjects_(sheet).find(function(row) {
      return normalizeString_(row['調整ID']) === adjustmentId;
    });

    var row = {
      '調整ID': adjustmentId,
      '対象月': month,
      '照合用ID': matchId,
      '氏名': name,
      '調整区分': type,
      '対象請求月': normalizeYearMonth_(payload.targetBillingMonth),
      '調整金額': Number(payload.amount) || 0,
      '理由': normalizeString_(payload.reason),
      'メモ': normalizeString_(payload.memo),
      '有効': '有効',
      '作成日時': existing ? existing['作成日時'] : now,
      '作成者': existing ? existing['作成者'] : operator,
      '更新日時': now,
      '更新者': operator,
      '削除日時': '',
      '削除者': ''
    };

    upsertRowByKey_(sheet, APP.HEADERS.ADJUSTMENT, '調整ID', row);
    appendHistory_({
      targetMonth: month,
      type: existing ? APP.HISTORY_TYPES.ADJUSTMENT_UPDATE : APP.HISTORY_TYPES.ADJUSTMENT_ADD,
      targetId: matchId,
      targetName: name,
      before: existing || null,
      after: row,
      memo: type
    });
  refreshMonthSummary_(month);
  return { success: true, adjustmentId: adjustmentId };
}

function saveAdjustment(payload) {
  validateConfig_();
  return withScriptLock_(function() {
    return saveAdjustmentNoLock_(payload);
  });
}

function deleteAdjustmentNoLock_(adjustmentId) {
  var ss = getBillingSpreadsheet_();
  var sheet = getRequiredSheet_(ss, APP.SHEETS.ADJUSTMENT);
  var existing = readSheetObjects_(sheet).find(function(row) {
    return normalizeString_(row['調整ID']) === normalizeString_(adjustmentId);
  });
  if (!existing) throw new Error('調整データが見つかりません。');
  assertMonthEditable_(existing['対象月']);

  var now = formatDateTime_(new Date());
  var operator = getOperator_();
  existing['有効'] = '';
  existing['削除日時'] = now;
  existing['削除者'] = operator;
  existing['更新日時'] = now;
  existing['更新者'] = operator;
  upsertRowByKey_(sheet, APP.HEADERS.ADJUSTMENT, '調整ID', existing);

  appendHistory_({
    targetMonth: existing['対象月'],
    type: APP.HISTORY_TYPES.ADJUSTMENT_DELETE,
    targetId: existing['照合用ID'],
    targetName: existing['氏名'],
    before: existing,
    after: null,
    memo: ''
  });
  refreshMonthSummary_(existing['対象月']);
  return { success: true };
}

function deleteAdjustment(adjustmentId) {
  validateConfig_();
  return withScriptLock_(function() {
    return deleteAdjustmentNoLock_(adjustmentId);
  });
}

function ensureCashAdjustmentsFromMaster_(targetMonth, matchIds) {
  var month = normalizeYearMonth_(targetMonth);
  var cashMap = getActiveCashMasterMap_(month);
  var adjustments = getActiveAdjustments_(month);
  matchIds.forEach(function(matchId) {
    if (!cashMap[matchId]) return;
    var list = adjustments[matchId] || [];
    var hasCash = list.some(function(item) {
      return item.type === APP.ADJUSTMENT_TYPES.CASH;
    });
    var hasHold = list.some(function(item) {
      return item.type === APP.ADJUSTMENT_TYPES.HOLD;
    });
    if (hasCash || hasHold) return;
    saveAdjustmentNoLock_({
      targetMonth: month,
      matchId: matchId,
      name: cashMap[matchId]['氏名'],
      type: APP.ADJUSTMENT_TYPES.CASH,
      amount: 0,
      reason: '通常現金マスタ',
      memo: normalizeString_(cashMap[matchId]['理由・メモ'])
    });
  });
}

function upsertAdjustmentByType_(targetMonth, matchId, type, payload) {
  var month = normalizeYearMonth_(targetMonth);
  var adjustments = getActiveAdjustments_(month)[matchId] || [];
  var existing = adjustments.find(function(item) {
    return item.type === type;
  });
  return saveAdjustmentNoLock_({
    adjustmentId: existing ? existing.id : '',
    targetMonth: month,
    matchId: matchId,
    name: payload.name,
    type: type,
    targetBillingMonth: payload.targetBillingMonth || '',
    amount: payload.amount || 0,
    reason: payload.reason || '',
    memo: payload.memo || ''
  });
}

function removeAdjustmentByType_(targetMonth, matchId, type) {
  var month = normalizeYearMonth_(targetMonth);
  var adjustments = getActiveAdjustments_(month)[matchId] || [];
  adjustments.filter(function(item) {
    return item.type === type;
  }).forEach(function(item) {
    deleteAdjustmentNoLock_(item.id);
  });
}

function setBillingStatus(targetMonth, matchId, statusType) {
  validateConfig_();
  return withScriptLock_(function() {
    var month = normalizeYearMonth_(targetMonth);
    assertMonthEditable_(month);
    var matchIdNorm = normalizeIdForMatch_(matchId);
    var users = loadMasterUsers_();
    var master = lookupMasterUser_(users, matchIdNorm);
    var name = master ? master.name : '';

    removeAdjustmentByType_(month, matchIdNorm, APP.ADJUSTMENT_TYPES.CASH);
    removeAdjustmentByType_(month, matchIdNorm, APP.ADJUSTMENT_TYPES.HOLD);

    if (statusType === APP.ADJUSTMENT_TYPES.CASH) {
      upsertAdjustmentByType_(month, matchIdNorm, APP.ADJUSTMENT_TYPES.CASH, { name: name, reason: '手動設定' });
    } else if (statusType === APP.ADJUSTMENT_TYPES.HOLD) {
      upsertAdjustmentByType_(month, matchIdNorm, APP.ADJUSTMENT_TYPES.HOLD, { name: name, reason: '手動設定' });
    }
    refreshMonthSummary_(month);
    return { success: true };
  });
}

function restoreBillingTarget(targetMonth, matchId) {
  validateConfig_();
  return withScriptLock_(function() {
    var month = normalizeYearMonth_(targetMonth);
    assertMonthEditable_(month);
    var matchIdNorm = normalizeIdForMatch_(matchId);
    removeAdjustmentByType_(month, matchIdNorm, APP.ADJUSTMENT_TYPES.CASH);
    removeAdjustmentByType_(month, matchIdNorm, APP.ADJUSTMENT_TYPES.HOLD);
    refreshMonthSummary_(month);
    return { success: true };
  });
}
