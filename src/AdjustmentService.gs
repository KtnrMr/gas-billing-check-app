function buildActiveAdjustmentsMap_(targetMonth, rows) {
  var month = normalizeYearMonth_(targetMonth);
  return (rows || []).filter(function(row) {
    return normalizeYearMonth_(row['対象月']) === month && isActiveFlag_(row['有効']);
  }).reduce(function(map, row) {
    var matchId = normalizeIdForMatch_(row['照合用ID']);
    if (!matchId) return map;
    if (!map[matchId]) map[matchId] = [];
    map[matchId].push({
      id: normalizeString_(row['調整ID']),
      matchId: matchId,
      name: normalizeString_(row['氏名']),
      type: isMonthlyStopType_(row['調整区分']) ? APP.ADJUSTMENT_TYPES.HOLD : normalizeString_(row['調整区分']),
      targetBillingMonth: normalizeYearMonth_(row['対象請求月']),
      amount: Number(row['調整金額']) || 0,
      reason: normalizeString_(row['理由']),
      memo: normalizeString_(row['メモ']),
      row: row
    });
    return map;
  }, {});
}

function getActiveAdjustments_(targetMonth) {
  var sheet = getBillingSpreadsheet_().getSheetByName(APP.SHEETS.ADJUSTMENT);
  if (!sheet) return {};
  return buildActiveAdjustmentsMap_(targetMonth, readSheetObjects_(sheet));
}

function buildAdjustmentIdIndex_(rows) {
  var index = {};
  (rows || []).forEach(function(row, rowIndex) {
    var id = normalizeString_(row['調整ID']);
    if (id) index[id] = rowIndex;
  });
  return index;
}

function adjustmentItemFromRow_(row) {
  var matchId = normalizeIdForMatch_(row['照合用ID']);
  return {
    id: normalizeString_(row['調整ID']),
    matchId: matchId,
    name: normalizeString_(row['氏名']),
    type: isMonthlyStopType_(row['調整区分']) ? APP.ADJUSTMENT_TYPES.HOLD : normalizeString_(row['調整区分']),
    targetBillingMonth: normalizeYearMonth_(row['対象請求月']),
    amount: Number(row['調整金額']) || 0,
    reason: normalizeString_(row['理由']),
    memo: normalizeString_(row['メモ']),
    row: row
  };
}

function upsertCtxAdjustmentItem_(ctx, row) {
  var item = adjustmentItemFromRow_(row);
  if (!item.matchId) return;
  if (!ctx.adjustments[item.matchId]) ctx.adjustments[item.matchId] = [];
  var existingIndex = ctx.adjustments[item.matchId].findIndex(function(entry) {
    return entry.id === item.id;
  });
  if (existingIndex >= 0) {
    ctx.adjustments[item.matchId][existingIndex] = item;
  } else {
    ctx.adjustments[item.matchId].push(item);
  }
}

function removeCtxAdjustmentItem_(ctx, adjustmentId) {
  var id = normalizeString_(adjustmentId);
  Object.keys(ctx.adjustments).forEach(function(matchId) {
    ctx.adjustments[matchId] = (ctx.adjustments[matchId] || []).filter(function(item) {
      return item.id !== id;
    });
  });
}

function getMasterUserFromBatchCtx_(ctx, matchId) {
  if (!ctx.masterUsers) ctx.masterUsers = loadMasterUsers_();
  return lookupMasterUser_(ctx.masterUsers, matchId);
}

function initHonobonoBillingBatchContext_(month) {
  var ss = getBillingSpreadsheet_();
  var adjustmentSheet = ensureSheet_(ss, APP.SHEETS.ADJUSTMENT, APP.HEADERS.ADJUSTMENT);
  var adjustmentRows = readSheetObjects_(adjustmentSheet);
  return {
    month: month,
    batchMode: true,
    adjustments: buildActiveAdjustmentsMap_(month, adjustmentRows),
    honobono: getLatestHonobonoMap_(month),
    recordMap: {},
    adjustmentSheet: adjustmentSheet,
    adjustmentRows: adjustmentRows,
    adjustmentById: buildAdjustmentIdIndex_(adjustmentRows),
    dirtyAdjustmentIndexes: {},
    newAdjustmentIndexes: {},
    pendingHistory: [],
    masterUsers: null,
    cashMaster: getActiveCashMasterMap_(month)
  };
}

function saveAdjustmentInBatch_(ctx, payload) {
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

  var master = getMasterUserFromBatchCtx_(ctx, matchId);
  var name = normalizeString_(payload.name) || (master ? master.name : '');
  var now = formatDateTime_(new Date());
  var operator = getOperator_();
  var adjustmentId = normalizeString_(payload.adjustmentId) || generateId_('ADJ');
  var existing = ctx.adjustmentById[adjustmentId] == null
    ? null
    : ctx.adjustmentRows[ctx.adjustmentById[adjustmentId]];

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

  var rowIndex = ctx.adjustmentById[adjustmentId];
  if (rowIndex == null) {
    rowIndex = ctx.adjustmentRows.length;
    ctx.adjustmentById[adjustmentId] = rowIndex;
    ctx.adjustmentRows.push(row);
    ctx.newAdjustmentIndexes[rowIndex] = true;
  } else {
    ctx.adjustmentRows[rowIndex] = row;
    ctx.dirtyAdjustmentIndexes[rowIndex] = true;
  }
  upsertCtxAdjustmentItem_(ctx, row);
  ctx.pendingHistory.push({
    targetMonth: month,
    type: existing ? APP.HISTORY_TYPES.ADJUSTMENT_UPDATE : APP.HISTORY_TYPES.ADJUSTMENT_ADD,
    targetId: matchId,
    targetName: name,
    before: existing || null,
    after: row,
    memo: type
  });
  return { success: true, adjustmentId: adjustmentId };
}

function deleteAdjustmentInBatch_(ctx, adjustmentId) {
  var id = normalizeString_(adjustmentId);
  if (ctx.adjustmentById[id] == null) return;
  var existing = ctx.adjustmentRows[ctx.adjustmentById[id]];
  if (!existing) return;
  assertMonthEditable_(existing['対象月']);

  var now = formatDateTime_(new Date());
  var operator = getOperator_();
  existing['有効'] = '';
  existing['削除日時'] = now;
  existing['削除者'] = operator;
  existing['更新日時'] = now;
  existing['更新者'] = operator;
  ctx.adjustmentRows[ctx.adjustmentById[id]] = existing;
  ctx.dirtyAdjustmentIndexes[ctx.adjustmentById[id]] = true;
  removeCtxAdjustmentItem_(ctx, id);
  ctx.pendingHistory.push({
    targetMonth: existing['対象月'],
    type: APP.HISTORY_TYPES.ADJUSTMENT_DELETE,
    targetId: existing['照合用ID'],
    targetName: existing['氏名'],
    before: existing,
    after: null,
    memo: ''
  });
}

function flushHonobonoBillingBatch_(ctx) {
  if (!ctx || !ctx.batchMode) return;
  var newIndexes = Object.keys(ctx.newAdjustmentIndexes || {}).map(function(index) {
    return Number(index);
  }).sort(function(a, b) {
    return a - b;
  });
  var dirtyExistingIndexes = Object.keys(ctx.dirtyAdjustmentIndexes || {}).filter(function(index) {
    return !ctx.newAdjustmentIndexes[index];
  });
  updateSheetObjectsAtDataIndexes_(ctx.adjustmentSheet, APP.HEADERS.ADJUSTMENT, ctx.adjustmentRows, dirtyExistingIndexes);
  if (newIndexes.length) {
    appendSheetObjects_(ctx.adjustmentSheet, APP.HEADERS.ADJUSTMENT, newIndexes.map(function(index) {
      return ctx.adjustmentRows[index];
    }));
  }
  if (ctx.pendingHistory.length) appendHistoryBatch_(ctx.pendingHistory);
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

function saveAdjustmentNoLockWithoutRefresh_(payload) {
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
  return { success: true, adjustmentId: adjustmentId };
}

function saveAdjustmentNoLock_(payload) {
  var result = saveAdjustmentNoLockWithoutRefresh_(payload);
  refreshMonthSummary_(normalizeYearMonth_(payload.targetMonth));
  return result;
}

function saveAdjustment(payload) {
  validateConfig_();
  return withScriptLock_(function() {
    return saveAdjustmentNoLock_(payload);
  });
}

function deleteAdjustmentNoLock_(adjustmentId, skipRefresh) {
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
  if (!skipRefresh) refreshMonthSummary_(existing['対象月']);
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
      return isMonthlyStopType_(item.type);
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

function removeAdjustmentByType_(targetMonth, matchId, type, skipRefresh) {
  var month = normalizeYearMonth_(targetMonth);
  var adjustments = getActiveAdjustments_(month)[matchId] || [];
  adjustments.filter(function(item) {
    return item.type === type;
  }).forEach(function(item) {
    deleteAdjustmentNoLock_(item.id, !!skipRefresh);
  });
}

function upsertAdjustmentByType_(targetMonth, matchId, type, payload, skipRefresh) {
  var month = normalizeYearMonth_(targetMonth);
  var adjustments = getActiveAdjustments_(month)[matchId] || [];
  var existing = adjustments.find(function(item) {
    return item.type === type;
  });
  var saveFn = skipRefresh ? saveAdjustmentNoLockWithoutRefresh_ : saveAdjustmentNoLock_;
  return saveFn({
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

function upsertAdjustmentByTypeWithContext_(ctx, matchId, type, payload) {
  var adjustments = ctx.adjustments[matchId] || [];
  var existing = adjustments.find(function(item) {
    return item.type === type;
  });
  if (ctx.batchMode) {
    return saveAdjustmentInBatch_(ctx, {
      adjustmentId: existing ? existing.id : '',
      targetMonth: ctx.month,
      matchId: matchId,
      name: payload.name,
      type: type,
      targetBillingMonth: payload.targetBillingMonth || '',
      amount: payload.amount || 0,
      reason: payload.reason || '',
      memo: payload.memo || ''
    });
  }
  return upsertAdjustmentByType_(ctx.month, matchId, type, payload, true);
}

function addAdditionalAdjustmentsNoRefresh_(month, matchId, name, amounts) {
  (amounts || []).forEach(function(amount) {
    var num = Number(amount) || 0;
    if (num <= 0) return;
    saveAdjustmentNoLockWithoutRefresh_({
      targetMonth: month,
      matchId: matchId,
      name: name,
      type: APP.ADJUSTMENT_TYPES.ADDITIONAL,
      amount: num,
      reason: '合算請求',
      memo: ''
    });
  });
}

function addAdditionalAdjustments_(month, matchId, name, amounts) {
  addAdditionalAdjustmentsNoRefresh_(month, matchId, name, amounts);
  refreshMonthSummary_(month);
}

function removeAdjustmentsByTypeFromContext_(ctx, matchId, type) {
  var list = ctx.adjustments[matchId] || [];
  list.filter(function(item) {
    return item.type === type;
  }).forEach(function(item) {
    if (ctx.batchMode) {
      deleteAdjustmentInBatch_(ctx, item.id);
    } else {
      deleteAdjustmentNoLock_(item.id, true);
    }
  });
  ctx.adjustments[matchId] = (ctx.adjustments[matchId] || []).filter(function(item) {
    return item.type !== type;
  });
}

function amountsEqual_(left, right) {
  var a = (left || []).map(function(value) { return Number(value) || 0; }).filter(function(value) {
    return value > 0;
  }).sort(function(x, y) { return x - y; });
  var b = (right || []).map(function(value) { return Number(value) || 0; }).filter(function(value) {
    return value > 0;
  }).sort(function(x, y) { return x - y; });
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function syncAdditionalAdjustmentsFromContext_(ctx, matchId, name, amounts) {
  var existing = (ctx.adjustments[matchId] || []).filter(function(item) {
    return item.type === APP.ADJUSTMENT_TYPES.ADDITIONAL;
  }).map(function(item) { return item.amount; });
  if (amountsEqual_(existing, amounts)) return;

  removeAdjustmentsByTypeFromContext_(ctx, matchId, APP.ADJUSTMENT_TYPES.ADDITIONAL);
  (amounts || []).forEach(function(amount) {
    var num = Number(amount) || 0;
    if (num <= 0) return;
    var payload = {
      targetMonth: ctx.month,
      matchId: matchId,
      name: name,
      type: APP.ADJUSTMENT_TYPES.ADDITIONAL,
      amount: num,
      reason: '合算請求',
      memo: ''
    };
    var result = ctx.batchMode
      ? saveAdjustmentInBatch_(ctx, payload)
      : saveAdjustmentNoLockWithoutRefresh_(payload);
    if (!ctx.adjustments[matchId]) ctx.adjustments[matchId] = [];
    if (!ctx.batchMode) {
      ctx.adjustments[matchId].push({
        id: result.adjustmentId,
        matchId: matchId,
        name: name,
        type: APP.ADJUSTMENT_TYPES.ADDITIONAL,
        amount: num
      });
    }
  });
}

function applyHonobonoBillingRowWithContext_(ctx, matchId, status, additionalAmounts) {
  var matchIdNorm = normalizeIdForMatch_(matchId);
  if (!matchIdNorm) throw new Error('照合用IDが不正です。');

  var record = ctx.recordMap[matchIdNorm];
  var name = record ? record.name : '';
  var statusType = normalizeString_(status);
  var adjList = ctx.adjustments[matchIdNorm] || [];
  var hasCash = adjList.some(function(item) { return item.type === APP.ADJUSTMENT_TYPES.CASH; });
  var hasHold = adjList.some(function(item) { return isMonthlyStopType_(item.type); });
  var hasAdditional = adjList.some(function(item) { return item.type === APP.ADJUSTMENT_TYPES.ADDITIONAL; });

  if (statusType === '通常' && !hasCash && !hasHold && !hasAdditional) return;

  removeAdjustmentsByTypeFromContext_(ctx, matchIdNorm, APP.ADJUSTMENT_TYPES.CASH);
  removeAdjustmentsByTypeFromContext_(ctx, matchIdNorm, APP.ADJUSTMENT_TYPES.HOLD);
  removeAdjustmentsByTypeFromContext_(ctx, matchIdNorm, APP.ADJUSTMENT_TYPES.ADDITIONAL);

  if (statusType === APP.ADJUSTMENT_TYPES.CASH) {
    upsertAdjustmentByTypeWithContext_(ctx, matchIdNorm, APP.ADJUSTMENT_TYPES.CASH, {
      name: name,
      reason: '手動設定'
    });
  } else if (statusType === APP.ADJUSTMENT_TYPES.HOLD) {
    upsertAdjustmentByTypeWithContext_(ctx, matchIdNorm, APP.ADJUSTMENT_TYPES.HOLD, {
      name: name,
      reason: '手動設定'
    });
  } else if (statusType === '合算') {
    var amounts = Array.isArray(additionalAmounts) ? additionalAmounts : [additionalAmounts];
    syncAdditionalAdjustmentsFromContext_(ctx, matchIdNorm, name, amounts);
  }
}

function applyPastOnlyBillingRowWithContext_(ctx, matchId, name, amount, remove) {
  var matchIdNorm = normalizeIdForMatch_(matchId);
  if (!matchIdNorm) throw new Error('照合用IDが不正です。');
  if (ctx.honobono.rows[matchIdNorm]) {
    throw new Error('ID ' + matchIdNorm + ' はほのぼの取込済みのため過去分のみ追加できません。');
  }
  removeAdjustmentsByTypeFromContext_(ctx, matchIdNorm, APP.ADJUSTMENT_TYPES.PAST_ONLY);
  if (remove) return;
  var num = Number(amount) || 0;
  if (num <= 0) return;
  var payload = {
    targetMonth: ctx.month,
    matchId: matchIdNorm,
    name: normalizeString_(name),
    type: APP.ADJUSTMENT_TYPES.PAST_ONLY,
    amount: num,
    reason: '過去分のみ請求',
    memo: ''
  };
  if (ctx.batchMode) {
    saveAdjustmentInBatch_(ctx, payload);
  } else {
    saveAdjustmentNoLockWithoutRefresh_(payload);
  }
}

function applyHonobonoBillingRowNoLock_(month, matchId, status, additionalAmounts) {
  var ctx = {
    month: month,
    adjustments: getActiveAdjustments_(month),
    honobono: getLatestHonobonoMap_(month),
    recordMap: {}
  };
  computeBillingRecords_(month).forEach(function(row) {
    ctx.recordMap[row.matchId] = row;
  });
  applyHonobonoBillingRowWithContext_(ctx, matchId, status, additionalAmounts);
}

function applyPastOnlyBillingRowNoLock_(month, matchId, name, amount, remove) {
  var ctx = {
    month: month,
    adjustments: getActiveAdjustments_(month),
    honobono: getLatestHonobonoMap_(month),
    recordMap: {}
  };
  applyPastOnlyBillingRowWithContext_(ctx, matchId, name, amount, remove);
}

function saveHonobonoBillingBatch(targetMonth, payload) {
  validateConfig_();
  return withScriptLock_(function() {
    return runWithPerfLog_('saveHonobonoBillingBatch', { month: targetMonth }, function(perf) {
      var month = normalizeYearMonth_(targetMonth);
      assertMonthEditable_(month);
      var changedRows = (payload && payload.changedRows) || [];
      var pastOnlyRows = (payload && payload.pastOnlyRows) || [];
      var removedPastOnly = (payload && payload.removedPastOnly) || [];
      var memoRows = (payload && payload.memoRows) || [];
      var hasBillingChanges = changedRows.length || pastOnlyRows.length || removedPastOnly.length;
      var hasMemoChanges = memoRows.length;

      if (!hasBillingChanges && !hasMemoChanges) {
        return { success: true };
      }

      if (hasMemoChanges) {
        saveBillingMemos_(month, memoRows);
        perf.mark('saveBillingMemos');
      }

      if (!hasBillingChanges) {
        return {
          success: true,
          month: buildMonthResponse_(getMonthRow_(month)),
          honobonoBilling: getHonobonoBillingList(month)
        };
      }

      var ctx = initHonobonoBillingBatchContext_(month);
      perf.mark('initHonobonoBillingBatchContext');
      ctx.masterUsers = loadMasterUsers_();
      perf.mark('loadMasterUsers');
      computeBillingRecordsFromData_(month, ctx.masterUsers, ctx.honobono, ctx.adjustments, ctx.cashMaster).forEach(function(row) {
        ctx.recordMap[row.matchId] = row;
      });
      perf.mark('computeBillingRecordsFromData (initial)');

      changedRows.forEach(function(row) {
        applyHonobonoBillingRowWithContext_(ctx, row.matchId, row.status, row.additionalAmounts || []);
      });

      removedPastOnly.forEach(function(matchId) {
        var master = lookupMasterUser_(ctx.masterUsers, matchId);
        applyPastOnlyBillingRowWithContext_(ctx, matchId, master ? master.name : '', 0, true);
      });

      pastOnlyRows.forEach(function(row) {
        applyPastOnlyBillingRowWithContext_(ctx, row.matchId, row.name, row.amount, false);
      });
      perf.mark('apply changes');

      flushHonobonoBillingBatch_(ctx);
      perf.mark('flushHonobonoBillingBatch');
      var updatedRecords = computeBillingRecordsFromData_(month, ctx.masterUsers, ctx.honobono, ctx.adjustments, ctx.cashMaster);
      perf.mark('computeBillingRecordsFromData (final)');
      storeBillingRecordContext_({
        month: month,
        users: ctx.masterUsers,
        honobono: ctx.honobono,
        adjustments: ctx.adjustments,
        cashMaster: ctx.cashMaster,
        records: updatedRecords
      });
      perf.mark('storeBillingRecordContext');
      var summary = refreshMonthSummaryFromRecords_(month, updatedRecords, ctx.honobono);
      perf.mark('refreshMonthSummaryFromRecords');
      return {
        success: true,
        month: buildMonthResponse_(getMonthRow_(month)),
        honobonoBilling: attachBillingMemosToHonobonoList_(
          month,
          buildHonobonoBillingListFromRecords_(updatedRecords, ctx.honobono, summary)
        )
      };
    });
  });
}

function setHonobonoBillingRow(targetMonth, matchId, status, additionalAmounts) {
  validateConfig_();
  return withScriptLock_(function() {
    var month = normalizeYearMonth_(targetMonth);
    assertMonthEditable_(month);
    applyHonobonoBillingRowNoLock_(month, matchId, status, additionalAmounts || []);
    refreshMonthSummary_(month);
    return { success: true };
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
