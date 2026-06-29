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
  if (record.isMonthlyStop) return APP.MONTHLY_STOP_LABEL;
  if (record.billingStatus === APP.ADJUSTMENT_TYPES.CASH) return APP.ADJUSTMENT_TYPES.CASH;

  var additionalItems = (record.adjustments || []).filter(function(item) {
    return item.type === APP.ADJUSTMENT_TYPES.ADDITIONAL;
  });
  if (additionalItems.length > 0) {
    var parts = [];
    if (record.honobonoAmount > 0) {
      parts.push(formatYenDisplay_(record.honobonoAmount));
    }
    additionalItems.forEach(function(item) {
      parts.push(formatYenDisplay_(item.amount));
    });
    if (parts.length > 1) {
      return formatYenDisplay_(record.finalAmount) + '（' + parts.join('＋') + '）';
    }
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
  return record.billingStatus === APP.ADJUSTMENT_TYPES.PAST_ONLY;
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
    billingStatus: record.billingStatus
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
      return;
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
      pastOnlyList.push(buildBillingPrintEntry_(record, memo));
      return;
    }
    if (isHonobonoBillingRowRecord_(record)) {
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
  var combinedCount = 0;
  billers.forEach(function(entry) {
    if (entry.billingStatus === '合算請求' || entry.billingStatus === '追加請求あり') {
      combinedCount += 1;
    }
  });
  return {
    billingCount: billers.length + pastOnlyList.length,
    totalBillingAmount: summary.totalBillingAmount || 0,
    combinedCount: combinedCount,
    combinedAmount: summary.combinedAmount || 0,
    pastOnlyCount: pastOnlyList.length,
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

function getHonobonoBillingPrintView(targetMonth) {
  validateConfig_();
  return buildHonobonoBillingPrintView_(targetMonth);
}
