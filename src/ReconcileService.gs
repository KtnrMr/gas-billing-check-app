function runReconcileInternal_(targetMonth) {
  var month = normalizeYearMonth_(targetMonth);
  var records = computeBillingRecords_(targetMonth);
  var inputMap = {};
  records.forEach(function(record) {
    if (record.isInputTarget) inputMap[record.matchId] = record;
  });

  var eshu = getLatestEshuMap_(month);
  var users = loadMasterUsers_();
  var results = [];
  var checked = {};

  Object.keys(inputMap).forEach(function(matchId) {
    checked[matchId] = true;
    var record = inputMap[matchId];
    var eshuRow = eshu.rows[matchId];
    var judgment = APP.RECONCILE_JUDGMENT.OK;
    var note = '';
    var eshuAmount = eshuRow ? eshuRow.amount : null;

    if (record.warnings.indexOf(APP.RECONCILE_JUDGMENT.ID_UNREGISTERED) >= 0) {
      judgment = APP.RECONCILE_JUDGMENT.ID_UNREGISTERED;
    } else if (!eshuRow) {
      judgment = APP.RECONCILE_JUDGMENT.NOT_INPUT;
    } else if (eshuAmount !== record.finalAmount) {
      judgment = APP.RECONCILE_JUDGMENT.AMOUNT_MISMATCH;
    } else if (eshuRow && shouldShowNameWarning_(matchId, eshuRow.name, record.masterName)) {
      judgment = APP.RECONCILE_JUDGMENT.NAME_WARNING;
      note = '氏名表記差異';
    }

    results.push(buildReconcileRow_(month, record, eshuRow, judgment, note));
  });

  Object.keys(eshu.rows).forEach(function(matchId) {
    if (checked[matchId]) return;
    var eshuRow = eshu.rows[matchId];
    var master = lookupMasterUser_(users, matchId);
    var judgment = APP.RECONCILE_JUDGMENT.EXTRA_INPUT;
    if (!master) judgment = APP.RECONCILE_JUDGMENT.ID_UNREGISTERED;
    results.push({
      '対象月': month,
      '照合日時': formatDateTime_(new Date()),
      '照合用ID': matchId,
      '基本情報氏名': master ? master.name : '',
      'ほのぼの氏名': '',
      'e集ちゃん氏名': eshuRow.name,
      '請求状態': '対象外',
      'ほのぼの請求額': 0,
      '追加請求額': 0,
      '最終請求額': 0,
      'e集ちゃん請求金額': eshuRow.amount,
      '差額': eshuRow.amount,
      '判定': judgment,
      '備考': ''
    });
  });

  var sheet = ensureSheet_(getBillingSpreadsheet_(), APP.SHEETS.RECONCILE, APP.HEADERS.RECONCILE);
  replaceRowsByFilter_(sheet, APP.HEADERS.RECONCILE, function(row) {
    return yearMonthKeyEquals_(row['対象月'], month);
  }, results);

  var mismatchCount = results.filter(function(row) {
    var judgment = normalizeString_(row['判定']);
    return judgment !== APP.RECONCILE_JUDGMENT.OK && judgment !== APP.RECONCILE_JUDGMENT.NAME_WARNING;
  }).length;

  updateMonthRow_(month, {
    '不一致件数': mismatchCount,
    '状態': mismatchCount === 0 ? APP.MONTH_STATUS.RECONCILED : APP.MONTH_STATUS.WORKING
  });

  appendHistory_({
    targetMonth: month,
    type: APP.HISTORY_TYPES.RECONCILE,
    targetId: '',
    targetName: '',
    before: null,
    after: { count: results.length, mismatchCount: mismatchCount },
    memo: ''
  });

  return {
    count: results.length,
    mismatchCount: mismatchCount,
    rows: results
  };
}

function buildReconcileRow_(month, record, eshuRow, judgment, note) {
  var eshuAmount = eshuRow ? eshuRow.amount : '';
  return {
    '対象月': month,
    '照合日時': formatDateTime_(new Date()),
    '照合用ID': record.matchId,
    '基本情報氏名': record.masterName,
    'ほのぼの氏名': record.honobonoName,
    'e集ちゃん氏名': eshuRow ? eshuRow.name : '',
    '請求状態': record.billingStatus,
    'ほのぼの請求額': record.honobonoAmount,
    '追加請求額': record.additionalAmount,
    '最終請求額': record.finalAmount,
    'e集ちゃん請求金額': eshuAmount,
    '差額': eshuRow ? record.finalAmount - eshuRow.amount : record.finalAmount,
    '判定': judgment,
    '備考': note
  };
}

function runReconcile(targetMonth) {
  validateConfig_();
  return withScriptLock_(function() {
    assertMonthEditable_(targetMonth);
    var result = runReconcileInternal_(targetMonth);
    refreshMonthSummary_(targetMonth);
    return {
      success: true,
      reconcile: {
        count: result.count,
        mismatchCount: result.mismatchCount,
        rows: result.rows
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
