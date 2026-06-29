function getMonthSheet_() {
  var ss = getBillingSpreadsheet_();
  return ensureSheet_(ss, APP.SHEETS.MONTH, APP.HEADERS.MONTH);
}

function getMonthRow_(targetMonth) {
  var month = normalizeYearMonth_(targetMonth);
  if (!month) return null;
  return readSheetObjects_(getMonthSheet_()).find(function(row) {
    return normalizeYearMonth_(row['対象月']) === month;
  }) || null;
}

function assertMonthExists_(targetMonth) {
  var row = getMonthRow_(targetMonth);
  if (!row) throw new Error('対象月「' + targetMonth + '」が見つかりません。');
  return row;
}

function assertMonthEditable_(targetMonth) {
  if (!targetMonth) return;
  var row = getMonthRow_(targetMonth);
  if (row && normalizeString_(row['状態']) === APP.MONTH_STATUS.CONFIRMED) {
    throw new Error('確定済みのため編集できません。確定解除後に操作してください。');
  }
}

function getMonthList() {
  validateConfig_();
  return readSheetObjects_(getMonthSheet_()).map(function(row) {
    return {
      targetMonth: normalizeYearMonth_(row['対象月']),
      status: normalizeString_(row['状態']) || APP.MONTH_STATUS.WORKING
    };
  }).sort(function(a, b) {
    return b.targetMonth.localeCompare(a.targetMonth);
  });
}

function ensureMonthRow_(targetMonth) {
  var month = normalizeYearMonth_(targetMonth);
  if (!month) throw new Error('対象月が不正です。');
  var row = getMonthRow_(month);
  if (row) return row;
  getOrCreateMonthNoLock_(month);
  row = getMonthRow_(month);
  if (!row) throw new Error('対象月「' + month + '」の作成に失敗しました。');
  return row;
}

function getOrCreateMonthNoLock_(targetMonth) {
  var month = normalizeYearMonth_(targetMonth);
  if (!month) throw new Error('対象月は YYYY-MM 形式で指定してください。');
  var sheet = getMonthSheet_();
  var existing = getMonthRow_(month);
  if (existing) {
    return buildMonthResponse_(existing);
  }
  var row = {
    '対象月': month,
    '状態': APP.MONTH_STATUS.WORKING,
    'ほのぼの取込日時': '',
    'ほのぼの取込件数': 0,
    'ほのぼの取込合計額': 0,
    '現金件数': 0,
    '現金合計額': 0,
    '保留件数': 0,
    '保留合計額': 0,
    '入力対象件数': 0,
    '入力対象合計額': 0,
    'e集ちゃん取込日時': '',
    'e集ちゃん件数': 0,
    'e集ちゃん合計額': 0,
    '不一致件数': 0,
    '確定日時': '',
    '確定者': '',
    '確定解除日時': '',
    '確定解除者': '',
    '確定解除理由': '',
    '完了マーク照合用ID': '',
    '最終コピー照合用ID': '',
    '最終コピー日時': '',
    '最終コピー金額': ''
  };
  appendSheetObjects_(sheet, APP.HEADERS.MONTH, [row]);
  return buildMonthResponse_(row);
}

function getOrCreateMonth(targetMonth) {
  validateConfig_();
  return withScriptLock_(function() {
    return getOrCreateMonthNoLock_(targetMonth);
  });
}

function buildMonthResponse_(row) {
  return {
    targetMonth: normalizeYearMonth_(row['対象月']),
    status: normalizeString_(row['状態']) || APP.MONTH_STATUS.WORKING,
    honobonoImportedAt: row['ほのぼの取込日時'] || '',
    honobonoCount: Number(row['ほのぼの取込件数']) || 0,
    honobonoTotal: Number(row['ほのぼの取込合計額']) || 0,
    cashCount: Number(row['現金件数']) || 0,
    cashTotal: Number(row['現金合計額']) || 0,
    holdCount: Number(row['保留件数']) || 0,
    holdTotal: Number(row['保留合計額']) || 0,
    inputCount: Number(row['入力対象件数']) || 0,
    inputTotal: Number(row['入力対象合計額']) || 0,
    eshuImportedAt: row['e集ちゃん取込日時'] || '',
    eshuCount: Number(row['e集ちゃん件数']) || 0,
    eshuTotal: Number(row['e集ちゃん合計額']) || 0,
    mismatchCount: Number(row['不一致件数']) || 0,
    confirmedAt: row['確定日時'] || '',
    confirmedBy: row['確定者'] || '',
    completeMarkId: normalizeString_(row['完了マーク照合用ID']),
    lastCopyId: normalizeString_(row['最終コピー照合用ID']),
    lastCopyAt: row['最終コピー日時'] || '',
    lastCopyAmount: row['最終コピー金額'] || ''
  };
}

function updateMonthRow_(targetMonth, patch) {
  var month = normalizeYearMonth_(targetMonth);
  if (!month) throw new Error('対象月が不正です。');
  var sheet = getMonthSheet_();
  var rowIndex = findRowIndexByKey_(sheet, '対象月', month);
  if (rowIndex < 0) {
    getOrCreateMonthNoLock_(month);
    rowIndex = findRowIndexByKey_(sheet, '対象月', month);
  }
  if (rowIndex < 0) throw new Error('対象月が見つかりません。');

  var headers = APP.HEADERS.MONTH;
  var headerRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0]
    .map(function(value) { return normalizeString_(value); });
  var values = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  var row = {};
  headerRow.forEach(function(header, index) {
    if (!header) return;
    row[header] = normalizeSheetValueForClient_(values[index]);
  });
  Object.keys(patch).forEach(function(key) {
    row[key] = patch[key];
  });
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([headers.map(function(header) {
    return row[header] == null ? '' : row[header];
  })]);
  return row;
}

function saveWorkState(targetMonth, payload) {
  validateConfig_();
  return withScriptLock_(function() {
    assertMonthEditable_(targetMonth);
    var month = normalizeYearMonth_(targetMonth);
    var patch = {};
    if (payload.completeMarkId !== undefined) {
      patch['完了マーク照合用ID'] = normalizeIdForMatch_(payload.completeMarkId);
    }
    if (payload.lastCopy) {
      patch['最終コピー照合用ID'] = normalizeIdForMatch_(payload.lastCopy.matchId);
      patch['最終コピー日時'] = formatDateTime_(new Date());
      patch['最終コピー金額'] = payload.lastCopy.amount;
    }
    updateMonthRow_(month, patch);
    var response = { targetMonth: month };
    if (payload.completeMarkId !== undefined) {
      response.completeMarkId = normalizeString_(patch['完了マーク照合用ID'] || '');
    }
    if (payload.lastCopy) {
      response.lastCopyId = normalizeString_(patch['最終コピー照合用ID'] || '');
      response.lastCopyAt = patch['最終コピー日時'] || '';
      response.lastCopyAmount = patch['最終コピー金額'] || '';
    }
    return response;
  });
}

function refreshMonthSummary_(targetMonth) {
  clearBillingRecordCache_(targetMonth);
  var ctx = buildBillingRecordContext_(targetMonth);
  return refreshMonthSummaryFromRecords_(targetMonth, ctx.records, ctx.honobono);
}

function refreshMonthSummaryFromRecords_(targetMonth, records, honobono, mismatchCount) {
  var summary = summarizeBillingRecords_(records || [], honobono || { rows: {} });
  if (mismatchCount == null) mismatchCount = countMismatchResults_(targetMonth);
  updateMonthRow_(targetMonth, {
    'ほのぼの取込件数': summary.honobonoCount,
    'ほのぼの取込合計額': summary.honobonoTotal,
    '現金件数': summary.cashCount,
    '現金合計額': summary.cashTotal,
    '保留件数': summary.holdCount,
    '保留合計額': summary.holdTotal,
    '入力対象件数': summary.inputCount,
    '入力対象合計額': summary.inputTotal,
    '不一致件数': mismatchCount
  });
  return summary;
}

function countMismatchResults_(targetMonth) {
  var sheet = getBillingSpreadsheet_().getSheetByName(APP.SHEETS.RECONCILE);
  if (!sheet) return 0;
  var month = normalizeYearMonth_(targetMonth);
  return readSheetObjects_(sheet).filter(function(row) {
    if (!yearMonthKeyEquals_(row['対象月'], month)) return false;
    var judgment = normalizeString_(row['判定']);
    return judgment && judgment !== APP.RECONCILE_JUDGMENT.OK && judgment !== APP.RECONCILE_JUDGMENT.NAME_WARNING;
  }).length;
}
