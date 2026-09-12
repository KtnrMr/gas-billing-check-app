function getBillingMemoMap_(targetMonth) {
  var month = normalizeYearMonth_(targetMonth);
  if (!month) return {};
  var sheet = getBillingSpreadsheet_().getSheetByName(APP.SHEETS.BILLING_MEMO);
  if (!sheet || sheet.getLastRow() < 2) return {};

  var map = {};
  readSheetObjects_(sheet).forEach(function(row) {
    if (!yearMonthKeyEquals_(row['対象月'], month)) return;
    var matchId = normalizeIdForMatch_(row['照合用ID']);
    if (!matchId) return;
    map[matchId] = normalizeString_(row['メモ']);
  });
  return map;
}

function saveBillingMemos_(targetMonth, updates) {
  var month = normalizeYearMonth_(targetMonth);
  if (!month || !updates || !updates.length) return;

  var ss = getBillingSpreadsheet_();
  var sheet = ensureSheet_(ss, APP.SHEETS.BILLING_MEMO, APP.HEADERS.BILLING_MEMO);
  var existingRows = readSheetObjects_(sheet);
  var now = formatDateTime_(new Date());
  var operator = getOperator_();
  var indexByKey = {};
  existingRows.forEach(function(row, rowIndex) {
    if (!yearMonthKeyEquals_(row['対象月'], month)) return;
    var matchId = normalizeIdForMatch_(row['照合用ID']);
    if (matchId) indexByKey[month + ':' + matchId] = rowIndex;
  });

  updates.forEach(function(item) {
    var matchId = normalizeIdForMatch_(item.matchId);
    if (!matchId) return;
    var memo = normalizeString_(item.memo);
    var key = month + ':' + matchId;
    var row = {
      '対象月': month,
      '照合用ID': matchId,
      '氏名': normalizeString_(item.name),
      'メモ': memo,
      '更新日時': now,
      '更新者': operator
    };
    if (indexByKey[key] != null) {
      existingRows[indexByKey[key]] = Object.assign({}, existingRows[indexByKey[key]], row);
      return;
    }
    existingRows.push(row);
    indexByKey[key] = existingRows.length - 1;
  });

  writeSheetObjects_(sheet, APP.HEADERS.BILLING_MEMO, existingRows);
}

function attachBillingMemosToHonobonoList_(targetMonth, result) {
  var memoMap = getBillingMemoMap_(targetMonth);
  function applyMemo(row) {
    if (!row) return row;
    row.memo = memoMap[row.matchId] || '';
    return row;
  }
  return {
    rows: (result.rows || []).map(applyMemo),
    pastOnlyRows: (result.pastOnlyRows || []).map(applyMemo),
    summary: result.summary
  };
}

function formatBillingAmountDetail_(record) {
  if (isStopOnlyBillingRecord_(record)) return APP.MONTHLY_STOP_LABEL;
  if (record.billingStatus === APP.ADJUSTMENT_TYPES.CASH) return APP.ADJUSTMENT_TYPES.CASH;

  var additionalItems = (record.adjustments || []).filter(function(item) {
    return item.type === APP.ADJUSTMENT_TYPES.ADDITIONAL;
  });
  var delayedItems = getDelayedBillingItems_(record.adjustments || []);
  var parts = [];
  if (!record.isMonthlyStop && record.honobonoAmount > 0) {
    parts.push('当月 ' + formatYenDisplay_(record.honobonoAmount));
  }
  additionalItems.forEach(function(item) {
    parts.push('追加 ' + formatYenDisplay_(item.amount));
  });
  delayedItems.forEach(function(item) {
    var month = item.targetBillingMonth
      ? Number(item.targetBillingMonth.slice(5, 7)) + '月分 '
      : '元月未設定 ';
    parts.push(month + formatYenDisplay_(item.amount));
  });
  if (parts.length > 0) {
    return formatYenDisplay_(record.finalAmount) + '（' + parts.join('＋') + '）';
  }
  return formatYenDisplay_(record.finalAmount);
}

function isBillingHoldRecord_(record) {
  return record.billingStatus === APP.ADJUSTMENT_TYPES.HOLD || !!record.isMonthlyStop;
}

function isBillingCashRecord_(record) {
  return record.billingStatus === APP.ADJUSTMENT_TYPES.CASH;
}

function isBillingPastOnlyRecord_(record) {
  return Number(record.delayedAmount) > 0;
}

function isHonobonoBillingRowRecord_(record) {
  return !!(record.honobonoName || record.honobonoAmount > 0);
}

function buildBillingPrintEntry_(record, memo) {
  return {
    matchId: record.matchId,
    rawId: record.rawId,
    name: record.name,
    kana: record.masterKana || '',
    finalAmount: record.finalAmount,
    amountDetail: formatBillingAmountDetail_(record),
    memo: memo || '',
    billingStatus: record.billingStatus,
    delayedAmount: record.delayedAmount || 0
  };
}

function buildDelayedBillingPrintEntry_(record, memo) {
  var delayedItems = getDelayedBillingItems_(record.adjustments || []);
  var details = delayedItems.map(function(item) {
    var month = item.targetBillingMonth
      ? Number(item.targetBillingMonth.slice(0, 4)) + '年' + Number(item.targetBillingMonth.slice(5, 7)) + '月分 '
      : '元月未設定 ';
    return month + formatYenDisplay_(item.amount);
  });
  return {
    matchId: record.matchId,
    rawId: record.rawId,
    name: record.name,
    kana: record.masterKana || '',
    finalAmount: record.delayedAmount || 0,
    amountDetail: formatYenDisplay_(record.delayedAmount || 0)
      + (details.length ? '（' + details.join('＋') + '）' : ''),
    memo: memo || '',
    billingStatus: record.billingStatus,
    delayedAmount: record.delayedAmount || 0
  };
}

function classifyBillingPrintLists_(records, memoMap) {
  var monthlyStopList = [];
  var cashList = [];
  var billers = [];
  var pastOnlyList = [];

  (records || []).forEach(function(record) {
    var memo = (memoMap && memoMap[record.matchId]) || '';
    if (isBillingHoldRecord_(record)) {
      monthlyStopList.push({
        rawId: record.rawId,
        name: record.name,
        honobonoAmount: record.honobonoAmount,
        memo: memo
      });
    }
    if (isBillingCashRecord_(record)) {
      cashList.push({
        rawId: record.rawId,
        name: record.name,
        honobonoAmount: record.honobonoAmount,
        memo: memo
      });
      return;
    }
    if (isBillingPastOnlyRecord_(record)) {
      pastOnlyList.push(buildDelayedBillingPrintEntry_(record, memo));
    }
    if (record.isInputTarget) {
      billers.push(buildBillingPrintEntry_(record, memo));
    }
  });

  sortBillingRecords_(monthlyStopList, 'name');
  sortBillingRecords_(cashList, 'name');
  sortBillingRecords_(billers, 'name');
  sortBillingRecords_(pastOnlyList, 'name');

  return {
    monthlyStopList: monthlyStopList,
    cashList: cashList,
    billers: billers,
    pastOnlyList: pastOnlyList
  };
}

function buildBillingPrintSummary_(records, lists) {
  var summary = summarizeBillingRecords_(records || [], { rows: {} });
  var billers = lists.billers || [];
  var pastOnlyList = lists.pastOnlyList || [];
  return {
    billingCount: summary.billingCount || billers.length,
    totalBillingAmount: summary.totalBillingAmount || 0,
    combinedCount: summary.combinedCount || 0,
    combinedAmount: summary.combinedAmount || 0,
    pastOnlyCount: summary.pastOnlyCount || pastOnlyList.length,
    pastOnlyAmount: summary.pastOnlyAmount || 0,
    monthlyStopCount: (lists.monthlyStopList || []).length,
    cashCount: (lists.cashList || []).length,
    cashAmount: summary.cashAmount || summary.cashTotal || 0
  };
}

function formatBillingPrintTitle_(month) {
  var parts = String(month || '').split('-');
  if (parts.length === 2) return Number(parts[1]) + '月請求';
  return String(month || '') + '請求';
}

function formatYenDisplay_(value) {
  return (Number(value) || 0).toLocaleString('ja-JP') + '円';
}

function buildHonobonoBillingPrintView_(targetMonth) {
  var month = normalizeYearMonth_(targetMonth);
  if (!month) throw new Error('対象月が不正です。');

  var ctx = buildBillingRecordContext_(month);
  var memoMap = getBillingMemoMap_(month);
  var lists = classifyBillingPrintLists_(ctx.records, memoMap);
  var summary = buildBillingPrintSummary_(ctx.records, lists);

  return {
    month: month,
    printTitle: formatBillingPrintTitle_(month),
    summary: summary,
    billers: lists.billers,
    pastOnlyList: lists.pastOnlyList,
    monthlyStopList: lists.monthlyStopList,
    cashList: lists.cashList
  };
}

function getHonobonoBillingPrintView(token, targetMonth) {
  requirePermissionAccess_(token);
  validateConfig_();
  return buildHonobonoBillingPrintView_(targetMonth);
}
