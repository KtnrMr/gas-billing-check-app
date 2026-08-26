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

function isKnownReconcileJudgment_(value) {
  var judgment = normalizeString_(value);
  return Object.keys(APP.RECONCILE_JUDGMENT).some(function(key) {
    return APP.RECONCILE_JUDGMENT[key] === judgment;
  });
}

/**
 * 「フリガナ」列追加時に、既存の照合結果シートでは同列が末尾へ追加され、
 * その後の書込み値だけが新しい列順になっていた期間がある。
 * 旧形式の行と新しい位置で書かれた行を判別し、見出しと値を正しい順へ揃える。
 */
function migrateReconcileColumnOrder_(sheet) {
  if (!sheet || sheet.getLastColumn() < 1) return false;
  var expected = APP.HEADERS.RECONCILE.slice();
  var lastCol = sheet.getLastColumn();
  var actual = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(value) {
    return normalizeString_(value);
  });
  while (actual.length && !actual[actual.length - 1]) actual.pop();
  var alreadyCorrect = expected.length === actual.length && expected.every(function(header, index) {
    return actual[index] === header;
  });
  if (alreadyCorrect) return false;

  var oldHeaders = expected.filter(function(header) { return header !== 'フリガナ'; });
  var misplacedHeaders = oldHeaders.concat(['フリガナ']);
  var isKnownMisplacement = misplacedHeaders.length === actual.length && misplacedHeaders.every(function(header, index) {
    return actual[index] === header;
  });
  if (!isKnownMisplacement) {
    throw new Error('照合結果シートの列順を自動修復できません。見出しを確認してください。');
  }

  var lastRow = sheet.getLastRow();
  var rawRows = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, actual.length).getValues()
    : [];
  var oldJudgmentIndex = actual.indexOf('判定');
  var newJudgmentIndex = expected.indexOf('判定');
  var migratedRows = rawRows.map(function(row) {
    // 新しい列順の値が、古い見出しの下へ位置で書かれた行。
    if (isKnownReconcileJudgment_(row[newJudgmentIndex])
        && !isKnownReconcileJudgment_(row[oldJudgmentIndex])) {
      return expected.map(function(header, index) { return row[index]; });
    }
    // 列追加前の見出しと値が一致していた行。
    var oldObject = {};
    actual.forEach(function(header, index) { oldObject[header] = row[index]; });
    return expected.map(function(header) { return oldObject[header] == null ? '' : oldObject[header]; });
  });

  sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
  if (migratedRows.length) {
    sheet.getRange(2, 1, migratedRows.length, expected.length).setValues(migratedRows);
  }
  formatTextColumns_(sheet, expected, 2, migratedRows.length);
  return true;
}

function getReadyReconcileSheet_() {
  var sheet = ensureSheet_(getBillingSpreadsheet_(), APP.SHEETS.RECONCILE, APP.HEADERS.RECONCILE);
  migrateReconcileColumnOrder_(sheet);
  return sheet;
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

function buildExtraInputReconcileRow_(month, eshuRow, billingRecord, master) {
  var isCash = billingRecord && billingRecord.billingStatus === APP.ADJUSTMENT_TYPES.CASH;
  var note = isCash
    ? '現金支払いだが e集ちゃんに金額あり'
    : '請求整理にないが e集ちゃんに金額あり';
  return {
    '対象月': month,
    '照合日時': formatDateTime_(new Date()),
    '照合用ID': eshuRow.matchId,
    '基本情報氏名': (billingRecord && (billingRecord.masterName || billingRecord.name))
      || (master && master.name)
      || eshuRow.masterName
      || eshuRow.name
      || '',
    'フリガナ': (billingRecord && billingRecord.masterKana)
      || (master && master.kana)
      || '',
    'ほのぼの氏名': billingRecord ? (billingRecord.honobonoName || '') : '',
    'e集ちゃん氏名': eshuRow.name || '',
    '請求状態': isCash ? APP.ADJUSTMENT_TYPES.CASH : '',
    'ほのぼの請求額': billingRecord ? billingRecord.honobonoAmount : '',
    '追加請求額': '',
    '最終請求額': '',
    'e集ちゃん請求金額': formatEshuAmountForReconcile_(eshuRow),
    '差額': eshuRow.amount,
    '判定': APP.RECONCILE_JUDGMENT.EXTRA_INPUT,
    '備考': note
  };
}

function appendExtraInputReconcileRows_(month, results, reconcileMap, recordMap, eshu, users) {
  Object.keys((eshu && eshu.rows) || {}).forEach(function(matchId) {
    if (reconcileMap[matchId]) return;
    var eshuRow = eshu.rows[matchId];
    if (!eshuRow || eshuRow.monthlyStop) return;
    var billingRecord = recordMap[matchId] || null;
    var master = users ? lookupMasterUser_(users, matchId) : null;
    results.push(buildExtraInputReconcileRow_(month, eshuRow, billingRecord, master));
  });
}

function runReconcileInternal_(targetMonth, options) {
  return runWithPerfLog_('runReconcileInternal_', { month: targetMonth }, function(perf) {
    var opts = options || {};
    var month = normalizeYearMonth_(targetMonth);
    var ctx = buildBillingRecordContext_(month);
    perf.mark('buildBillingRecordContext');
    var records = ctx.records;
    var users = ctx.users || loadMasterUsers_();
    var confirmedMap = getNameConfirmedMap_();
    perf.mark('getNameConfirmedMap');
    var reconcileMap = {};
    var recordMap = {};
    records.forEach(function(record) {
      recordMap[record.matchId] = record;
      if (record.isReconcileTarget) reconcileMap[record.matchId] = record;
    });

    var eshu = opts.eshuMap || getLatestEshuMap_(month);
    perf.mark(opts.eshuMap ? 'use memory eshuMap' : 'getLatestEshuMap');
    var comparisonSummary = buildReconcileComparisonSummaryFromData_(records, eshu);
    var results = [];

    Object.keys(reconcileMap).forEach(function(matchId) {
      var record = reconcileMap[matchId];
      var eshuRow = eshu.rows[matchId];
      var judged = judgeReconcile_(record, eshuRow, confirmedMap);
      results.push(buildReconcileRow_(month, record, eshuRow, judged.judgment, judged.note));
    });
    appendExtraInputReconcileRows_(month, results, reconcileMap, recordMap, eshu, users);
    perf.mark('judge reconcile rows');

    var sheet = getReadyReconcileSheet_();
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

function runReconcile(token, targetMonth) {
  requirePermissionAccess_(token);
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

function getReconcileResults(token, targetMonth) {
  requirePermissionAccess_(token);
  return getReconcileResults_(targetMonth);
}

function getReconcileResults_(targetMonth) {
  validateConfig_();
  var sheet = getReadyReconcileSheet_();
  var month = normalizeYearMonth_(targetMonth);
  return readSheetObjects_(sheet).filter(function(row) {
    return yearMonthKeyEquals_(row['対象月'], month);
  });
}
