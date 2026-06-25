function countImportErrors_(targetMonth) {
  var month = normalizeYearMonth_(targetMonth);
  var count = 0;
  [APP.SHEETS.HONOBONO, APP.SHEETS.ESHU].forEach(function(sheetName) {
    var batch = getLatestImportBatch_(month, sheetName);
    if (!batch) return;
    var sheet = getBillingSpreadsheet_().getSheetByName(sheetName);
    if (!sheet) return;
    readSheetObjects_(sheet).forEach(function(row) {
      if (normalizeYearMonth_(row['対象月']) !== month) return;
      if (Number(row['取込回数']) !== batch) return;
      var judgment = normalizeString_(row['取込判定']);
      if (judgment === APP.IMPORT_JUDGMENT.AMOUNT_ERROR || judgment === APP.IMPORT_JUDGMENT.ID_ERROR) {
        count += 1;
      }
    });
  });
  return count;
}

function countUnregistered_(targetMonth) {
  return computeBillingRecords_(targetMonth).filter(function(record) {
    return record.masterCategory === APP.MASTER_CATEGORY.UNREGISTERED
      || record.warnings.indexOf(APP.RECONCILE_JUDGMENT.ID_UNREGISTERED) >= 0;
  }).length;
}

function confirmMonth(targetMonth) {
  validateConfig_();
  return withScriptLock_(function() {
    var month = normalizeYearMonth_(targetMonth);
    var row = assertMonthExists_(month);
    if (normalizeString_(row['状態']) === APP.MONTH_STATUS.CONFIRMED) {
      throw new Error('すでに確定済みです。');
    }
    if (!normalizeString_(row['e集ちゃん取込日時'])) {
      throw new Error('e集ちゃんCSVが未取込のため確定できません。');
    }

    var mismatchCount = countMismatchResults_(month);
    var unregisteredCount = countUnregistered_(month);
    var amountErrorCount = countImportErrors_(month);
    if (mismatchCount > 0 || unregisteredCount > 0 || amountErrorCount > 0) {
      throw new Error(
        '確定条件を満たしていません（不一致:' + mismatchCount
        + ' / ID未登録:' + unregisteredCount
        + ' / 金額エラー:' + amountErrorCount + '）'
      );
    }

    var now = formatDateTime_(new Date());
    var operator = getOperator_();
    updateMonthRow_(month, {
      '状態': APP.MONTH_STATUS.CONFIRMED,
      '確定日時': now,
      '確定者': operator
    });

    appendHistory_({
      targetMonth: month,
      type: APP.HISTORY_TYPES.CONFIRM,
      targetId: '',
      targetName: '',
      before: { status: row['状態'] },
      after: { status: APP.MONTH_STATUS.CONFIRMED },
      memo: ''
    });

    return { success: true, month: buildMonthResponse_(getMonthRow_(month)) };
  });
}

function unconfirmMonth(targetMonth, reason) {
  validateConfig_();
  return withScriptLock_(function() {
    var month = normalizeYearMonth_(targetMonth);
    var row = assertMonthExists_(month);
    if (normalizeString_(row['状態']) !== APP.MONTH_STATUS.CONFIRMED) {
      throw new Error('確定済みではないため解除できません。');
    }
    var memo = normalizeString_(reason);
    if (!memo) throw new Error('確定解除理由を入力してください。');

    var now = formatDateTime_(new Date());
    var operator = getOperator_();
    updateMonthRow_(month, {
      '状態': APP.MONTH_STATUS.WORKING,
      '確定解除日時': now,
      '確定解除者': operator,
      '確定解除理由': memo
    });

    appendHistory_({
      targetMonth: month,
      type: APP.HISTORY_TYPES.UNCONFIRM,
      targetId: '',
      targetName: '',
      before: { status: APP.MONTH_STATUS.CONFIRMED },
      after: { status: APP.MONTH_STATUS.WORKING, reason: memo },
      memo: memo
    });

    return { success: true, month: buildMonthResponse_(getMonthRow_(month)) };
  });
}
