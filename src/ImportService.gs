function getHonobonoImportRows_(targetMonth, importBatch, preloadedRows) {
  var month = normalizeYearMonth_(targetMonth);
  var rows = preloadedRows;
  if (!rows) {
    var sheet = getBillingSpreadsheet_().getSheetByName(APP.SHEETS.HONOBONO);
    if (!sheet) return [];
    rows = readSheetObjects_(sheet);
  }
  return rows.filter(function(row) {
    if (!yearMonthKeyEquals_(row['対象月'], month)) return false;
    if (importBatch && Number(row['取込回数']) !== Number(importBatch)) return false;
    return true;
  });
}

function getEshuImportRows_(targetMonth, importBatch, preloadedRows) {
  var month = normalizeYearMonth_(targetMonth);
  var rows = preloadedRows;
  if (!rows) {
    var sheet = getBillingSpreadsheet_().getSheetByName(APP.SHEETS.ESHU);
    if (!sheet) return [];
    rows = readSheetObjects_(sheet);
  }
  return rows.filter(function(row) {
    if (!yearMonthKeyEquals_(row['対象月'], month)) return false;
    if (importBatch && Number(row['取込回数']) !== Number(importBatch)) return false;
    return true;
  });
}

function getLatestImportBatchFromRows_(targetMonth, rows) {
  var month = normalizeYearMonth_(targetMonth);
  var max = 0;
  (rows || []).forEach(function(row) {
    if (!yearMonthKeyEquals_(row['対象月'], month)) return;
    max = Math.max(max, Number(row['取込回数']) || 0);
  });
  return max;
}

function getLatestImportBatch_(targetMonth, sheetName) {
  var sheet = getBillingSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) return 0;
  return getLatestImportBatchFromRows_(targetMonth, readSheetObjects_(sheet));
}

function getLatestImportMapFromSheet_(targetMonth, sheetName, buildEntry_) {
  var month = normalizeYearMonth_(targetMonth);
  var sheet = getBillingSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) return { batch: 0, rows: {}, list: [] };

  var maxBatch = 0;
  var latestRows = [];
  readSheetObjects_(sheet).forEach(function(row) {
    if (!yearMonthKeyEquals_(row['対象月'], month)) return;
    var batch = Number(row['取込回数']) || 0;
    if (batch > maxBatch) {
      maxBatch = batch;
      latestRows = [row];
    } else if (batch === maxBatch) {
      latestRows.push(row);
    }
  });

  if (!maxBatch) return { batch: 0, rows: {}, list: [] };

  var map = {};
  latestRows.forEach(function(row) {
    var matchId = normalizeIdForMatch_(row['照合用ID']);
    if (!matchId) return;
    map[matchId] = buildEntry_(row, matchId);
  });
  return { batch: maxBatch, rows: map, list: latestRows };
}

function getLatestHonobonoMap_(targetMonth) {
  return getLatestImportMapFromSheet_(targetMonth, APP.SHEETS.HONOBONO, function(row, matchId) {
    return {
      matchId: matchId,
      rawId: normalizeString_(row['利用者番号']),
      name: normalizeString_(row['利用者名']),
      masterName: normalizeString_(row['基本情報氏名']),
      masterCategory: normalizeString_(row['マスタ区分']),
      amount: Number(row['請求額']) || 0,
      judgment: normalizeString_(row['取込判定']),
      note: normalizeString_(row['備考'])
    };
  });
}

function getLatestEshuMap_(targetMonth) {
  return getLatestImportMapFromSheet_(targetMonth, APP.SHEETS.ESHU, function(row, matchId) {
    var parsed = parseStoredEshuAmount_(row['請求金額']);
    return {
      matchId: matchId,
      rawId: normalizeString_(row['顧客番号']),
      name: normalizeString_(row['顧客名']),
      masterName: normalizeString_(row['基本情報氏名']),
      amount: parsed.amount,
      monthlyStop: parsed.monthlyStop,
      amountDisplay: parsed.display,
      judgment: normalizeString_(row['取込判定'])
    };
  });
}

function buildImportRow_(type, targetMonth, batch, lineNo, rawId, users, amountResult, rawName) {
  var matchId = normalizeIdForMatch_(rawId);
  var master = lookupMasterUser_(users, matchId);
  var judgment = APP.IMPORT_JUDGMENT.OK;
  var note = '';
  if (!matchId) {
    judgment = APP.IMPORT_JUDGMENT.ID_ERROR;
    note = 'IDが空欄です';
  } else if (!amountResult.ok && !amountResult.monthlyStop) {
    judgment = APP.IMPORT_JUDGMENT.AMOUNT_ERROR;
    note = amountResult.error;
  } else if (amountResult.warning) {
    judgment = APP.IMPORT_JUDGMENT.AMOUNT_WARNING;
    note = 'マイナス金額';
  }

  var common = {
    '対象月': targetMonth,
    '取込回数': batch,
    '取込日時': formatDateTime_(new Date()),
    '行番号': lineNo,
    '照合用ID': matchId,
    '基本情報氏名': master ? master.name : '',
    'マスタ区分': master ? master.category : APP.MASTER_CATEGORY.UNREGISTERED,
    '取込判定': judgment,
    '備考': note
  };

  if (type === 'honobono') {
    return Object.assign(common, {
      '利用者番号': normalizeString_(rawId),
      '利用者名': normalizeString_(rawName),
      '請求額': amountResult.ok || amountResult.warning ? amountResult.value : ''
    });
  }
  return Object.assign(common, {
    '顧客番号': normalizeString_(rawId),
    '顧客名': normalizeString_(rawName),
    '請求金額': amountResult.monthlyStop
      ? APP.MONTHLY_STOP_LABEL
      : (amountResult.ok || amountResult.warning ? amountResult.value : '')
  });
}

function computeImportDiff_(targetMonth, previousBatch, newBatch) {
  if (!previousBatch) return null;
  var oldMap = {};
  getHonobonoImportRows_(targetMonth, previousBatch).forEach(function(row) {
    var id = normalizeIdForMatch_(row['照合用ID']);
    if (!id) return;
    oldMap[id] = Number(row['請求額']) || 0;
  });
  var newMap = {};
  getHonobonoImportRows_(targetMonth, newBatch).forEach(function(row) {
    var id = normalizeIdForMatch_(row['照合用ID']);
    if (!id) return;
    newMap[id] = Number(row['請求額']) || 0;
  });
  var removed = [];
  var added = [];
  var changed = [];
  Object.keys(oldMap).forEach(function(id) {
    if (!newMap[id]) removed.push({ matchId: id, previousAmount: oldMap[id] });
    else if (newMap[id] !== oldMap[id]) {
      changed.push({ matchId: id, previousAmount: oldMap[id], currentAmount: newMap[id] });
    }
  });
  Object.keys(newMap).forEach(function(id) {
    if (!oldMap[id]) added.push({ matchId: id, currentAmount: newMap[id] });
  });
  return { removed: removed, added: added, changed: changed };
}

function importHonobonoCsv(targetMonth, csvPayload) {
  validateConfig_();
  return withScriptLock_(function() {
    return runWithPerfLog_('importHonobonoCsv', { month: targetMonth }, function(perf) {
      var month = normalizeYearMonth_(targetMonth);
      if (!month) throw new Error('対象月が不正です。画面上部の対象月（YYYY-MM）を選択してください。');
      assertMonthEditable_(month);
      getOrCreateMonthNoLock_(month);

      var csvText = resolveCsvPayload_(csvPayload);
      var rows = parseCsvRows_(csvText);
      var header = findCsvHeaderMapping_(rows, buildHonobonoHeaderDefs_());
      perf.mark('parse csv');
      if (!header) {
        throw new Error(
          'ほのぼのCSVに必須列（利用者番号・利用者名・請求額）がありません。'
          + '検出した先頭行: ' + describeCsvHeaders_(rows)
          + '。文字化けしている場合は Shift_JIS のCSVをそのまま選ぶか、UTF-8で保存し直してください。'
        );
      }

      var users = loadMasterUsers_();
      perf.mark('loadMasterUsers');
      var previousBatch = getLatestImportBatch_(month, APP.SHEETS.HONOBONO);
      var batch = previousBatch + 1;
      var importRows = [];
      var lineNo = 0;
      rows.slice(header.index + 1).forEach(function(values) {
        var rawId = values[header.columns.id];
        var rawName = values[header.columns.name];
        var rawAmount = values[header.columns.amount];
        if (!normalizeString_(rawId) && !normalizeString_(rawName) && !normalizeString_(rawAmount)) return;
        lineNo += 1;
        importRows.push(buildImportRow_(
          'honobono',
          month,
          batch,
          lineNo,
          rawId,
          users,
          parseAmount_(rawAmount),
          rawName
        ));
      });
      perf.mark('build import rows');
      if (!importRows.length) throw new Error('取込可能なデータがありません。');

      var sheet = ensureSheet_(getBillingSpreadsheet_(), APP.SHEETS.HONOBONO, APP.HEADERS.HONOBONO);
      appendSheetObjects_(sheet, APP.HEADERS.HONOBONO, importRows);
      perf.mark('append honobono sheet');

      var matchIds = importRows.map(function(row) {
        return normalizeIdForMatch_(row['照合用ID']);
      }).filter(Boolean);
      ensureCashAdjustmentsFromMaster_(month, matchIds);
      perf.mark('ensureCashAdjustmentsFromMaster');

      updateMonthRow_(month, {
        'ほのぼの取込日時': formatDateTime_(new Date()),
        '状態': APP.MONTH_STATUS.WORKING
      });
      refreshMonthSummary_(month);
      perf.mark('refreshMonthSummary');

      var diff = computeImportDiff_(month, previousBatch, batch);
      appendHistory_({
        targetMonth: month,
        type: APP.HISTORY_TYPES.HONOBONO_IMPORT,
        targetId: '',
        targetName: '',
        before: { batch: previousBatch },
        after: { batch: batch, count: importRows.length },
        memo: ''
      });
      perf.mark('appendHistory');

      return {
        success: true,
        batch: batch,
        count: importRows.length,
        diff: diff
      };
    });
  });
}

function importEshuCsv(targetMonth, csvPayload) {
  validateConfig_();
  return withScriptLock_(function() {
    return runWithPerfLog_('importEshuCsv', { month: targetMonth }, function(perf) {
      var month = normalizeYearMonth_(targetMonth);
      if (!month) throw new Error('対象月が不正です。画面上部の対象月（YYYY-MM）を選択してください。');
      assertMonthEditable_(month);
      getOrCreateMonthNoLock_(month);

      var csvText = resolveCsvPayload_(csvPayload);
      var rows = parseCsvRows_(csvText);
      var header = findCsvHeaderMapping_(rows, buildEshuHeaderDefs_());
      perf.mark('parse csv');
      if (!header) {
        throw new Error(
          'e集ちゃんCSVに必須列（顧客番号・顧客名・請求金額）がありません。'
          + '検出した先頭行: ' + describeCsvHeaders_(rows)
          + '。文字化けしている場合は Shift_JIS のCSVをそのまま選ぶか、UTF-8で保存し直してください。'
        );
      }

      var users = loadMasterUsers_();
      perf.mark('loadMasterUsers');
      var previousBatch = getLatestImportBatch_(month, APP.SHEETS.ESHU);
      var batch = previousBatch + 1;
      var importRows = [];
      var lineNo = 0;
      rows.slice(header.index + 1).forEach(function(values) {
        var rawId = values[header.columns.id];
        var rawName = values[header.columns.name];
        var rawAmount = values[header.columns.amount];
        if (!normalizeString_(rawId) && !normalizeString_(rawName) && !normalizeString_(rawAmount)) return;
        lineNo += 1;
        importRows.push(buildImportRow_(
          'eshu',
          month,
          batch,
          lineNo,
          rawId,
          users,
          parseEshuBillingAmount_(rawAmount),
          rawName
        ));
      });
      perf.mark('build import rows');
      if (!importRows.length) throw new Error('取込可能なデータがありません。');

      var sheet = ensureSheet_(getBillingSpreadsheet_(), APP.SHEETS.ESHU, APP.HEADERS.ESHU);
      appendSheetObjects_(sheet, APP.HEADERS.ESHU, importRows);
      perf.mark('append eshu sheet');

      updateMonthRow_(month, {
        'e集ちゃん取込日時': formatDateTime_(new Date()),
        'e集ちゃん件数': importRows.length,
        'e集ちゃん合計額': importRows.reduce(function(sum, row) {
          if (isMonthlyStopAmountText_(row['請求金額'])) return sum;
          return sum + (Number(row['請求金額']) || 0);
        }, 0)
      });
      perf.mark('updateMonthRow');

      var reconcileResult = runReconcileInternal_(month);
      perf.mark('runReconcileInternal');

      appendHistory_({
        targetMonth: month,
        type: APP.HISTORY_TYPES.ESHU_IMPORT,
        targetId: '',
        targetName: '',
        before: { batch: previousBatch },
        after: { batch: batch, count: importRows.length },
        memo: ''
      });
      perf.mark('appendHistory');

      return {
        success: true,
        batch: batch,
        count: importRows.length,
        month: buildMonthResponse_(getMonthRow_(month)),
        reconcile: {
          count: reconcileResult.count,
          mismatchCount: reconcileResult.mismatchCount,
          rows: reconcileResult.rows,
          comparisonSummary: reconcileResult.comparisonSummary
        }
      };
    });
  });
}

function getHonobonoImports(targetMonth) {
  validateConfig_();
  var latest = getLatestHonobonoMap_(targetMonth);
  return {
    batch: latest.batch,
    rows: Object.keys(latest.rows).map(function(key) {
      return latest.rows[key];
    })
  };
}

function getEshuImports(targetMonth) {
  validateConfig_();
  var latest = getLatestEshuMap_(targetMonth);
  return {
    batch: latest.batch,
    rows: latest.list
  };
}
