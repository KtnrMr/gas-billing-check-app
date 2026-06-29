function judgeReconcile_(record, eshuRow, confirmedMap) {
  if (!eshuRow) {
    return { judgment: APP.RECONCILE_JUDGMENT.NOT_INPUT, note: '' };
  }
  if (record.isMonthlyStop) {
    if (eshuRow.monthlyStop) {
      return { judgment: APP.RECONCILE_JUDGMENT.OK, note: '' };
    }
    return { judgment: APP.RECONCILE_JUDGMENT.AMOUNT_MISMATCH, note: '当月停止不一致' };
  }
  if (eshuRow.monthlyStop) {
    return { judgment: APP.RECONCILE_JUDGMENT.AMOUNT_MISMATCH, note: '当月停止不一致' };
  }
  if (eshuRow.amount !== record.finalAmount) {
    return { judgment: APP.RECONCILE_JUDGMENT.AMOUNT_MISMATCH, note: '' };
  }
  if (shouldShowNameWarningWithMap_(confirmedMap || getNameConfirmedMap_(), record.matchId, eshuRow.name, record.masterName || record.honobonoName)) {
    return { judgment: APP.RECONCILE_JUDGMENT.NAME_WARNING, note: '氏名表記差異' };
  }
  return { judgment: APP.RECONCILE_JUDGMENT.OK, note: '' };
}

function formatEshuAmountForReconcile_(eshuRow) {
  if (!eshuRow) return '';
  if (eshuRow.monthlyStop) return APP.MONTHLY_STOP_LABEL;
  return eshuRow.amount;
}

function runReconcileInternal_(targetMonth) {
  return runWithPerfLog_('runReconcileInternal_', { month: targetMonth }, function(perf) {
    var month = normalizeYearMonth_(targetMonth);
    var ctx = buildBillingRecordContext_(month);
    perf.mark('buildBillingRecordContext');
    var records = ctx.records;
    var confirmedMap = getNameConfirmedMap_();
    perf.mark('getNameConfirmedMap');
    var reconcileMap = {};
    records.forEach(function(record) {
      if (record.isReconcileTarget) reconcileMap[record.matchId] = record;
    });

    var eshu = getLatestEshuMap_(month);
    perf.mark('getLatestEshuMap');
    var comparisonSummary = buildReconcileComparisonSummaryFromData_(records, eshu);
    var results = [];

    Object.keys(reconcileMap).forEach(function(matchId) {
      var record = reconcileMap[matchId];
      var eshuRow = eshu.rows[matchId];
      var judged = judgeReconcile_(record, eshuRow, confirmedMap);
      results.push(buildReconcileRow_(month, record, eshuRow, judged.judgment, judged.note));
    });
    perf.mark('judge reconcile rows');

    var ss = getBillingSpreadsheet_();
    var sheet = ensureSheet_(ss, APP.SHEETS.RECONCILE, APP.HEADERS.RECONCILE);
    var writeMode = replaceMonthRowsInSheet_(sheet, APP.HEADERS.RECONCILE, '対象月', month, results);
    perf.mark('write reconcile sheet (' + writeMode + ')');

    var mismatchCount = results.filter(function(row) {
      var judgment = normalizeString_(row['判定']);
      return judgment !== APP.RECONCILE_JUDGMENT.OK && judgment !== APP.RECONCILE_JUDGMENT.NAME_WARNING;
    }).length;

    var monthRow = updateMonthRow_(month, {
      '不一致件数': mismatchCount,
      '状態': mismatchCount === 0 ? APP.MONTH_STATUS.RECONCILED : APP.MONTH_STATUS.WORKING
    });
    perf.mark('updateMonthRow');

    appendHistory_({
      targetMonth: month,
      type: APP.HISTORY_TYPES.RECONCILE,
      targetId: '',
      targetName: '',
      before: null,
      after: { count: results.length, mismatchCount: mismatchCount },
      memo: ''
    });
    perf.mark('appendHistory');

    return {
      count: results.length,
      mismatchCount: mismatchCount,
      rows: results,
      comparisonSummary: comparisonSummary,
      monthRow: monthRow
    };
  });
}

function buildReconcileRow_(month, record, eshuRow, judgment, note) {
  var eshuDisplay = formatEshuAmountForReconcile_(eshuRow);
  var diff = '';
  if (!eshuRow) {
    diff = record.isMonthlyStop ? APP.MONTHLY_STOP_LABEL : record.finalAmount;
  } else if (record.isMonthlyStop || eshuRow.monthlyStop) {
    diff = record.isMonthlyStop === eshuRow.monthlyStop ? 0 : APP.MONTHLY_STOP_LABEL;
  } else {
    diff = record.finalAmount - eshuRow.amount;
  }
  return {
    '対象月': month,
    '照合日時': formatDateTime_(new Date()),
    '照合用ID': record.matchId,
    '基本情報氏名': record.masterName || record.name,
    'フリガナ': record.masterKana || '',
    'ほのぼの氏名': record.honobonoName,
    'e集ちゃん氏名': eshuRow ? eshuRow.name : '',
    '請求状態': record.billingStatus,
    'ほのぼの請求額': record.honobonoAmount,
    '追加請求額': record.additionalAmount,
    '最終請求額': record.isMonthlyStop ? APP.MONTHLY_STOP_LABEL : record.finalAmount,
    'e集ちゃん請求金額': eshuDisplay,
    '差額': diff,
    '判定': judgment,
    '備考': note
  };
}

function runReconcile(targetMonth) {
  validateConfig_();
  return withScriptLock_(function() {
    assertMonthEditable_(targetMonth);
    var result = runReconcileInternal_(targetMonth);
    return {
      success: true,
      month: buildMonthResponse_(result.monthRow || getMonthRow_(targetMonth)),
      reconcile: {
        count: result.count,
        mismatchCount: result.mismatchCount,
        rows: result.rows,
        comparisonSummary: result.comparisonSummary
      }
    };
  });
}

function getReconcileResults(targetMonth) {
  validateConfig_();
  var sheet = getBillingSpreadsheet_().getSheetByName(APP.SHEETS.RECONCILE);
  if (!sheet) return [];
  var month = normalizeYearMonth_(targetMonth);
  return readSheetObjects_(sheet).filter(function(row) {
    return yearMonthKeyEquals_(row['対象月'], month);
  });
}
