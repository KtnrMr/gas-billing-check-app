function getAdditionalOnlyAmount_(adjList) {
  return adjList.filter(function(item) {
    return item.type === APP.ADJUSTMENT_TYPES.ADDITIONAL;
  }).reduce(function(sum, item) {
    return sum + item.amount;
  }, 0);
}

function getDelayedBillingItems_(adjList) {
  return (adjList || []).filter(function(item) {
    return item.type === APP.ADJUSTMENT_TYPES.PAST_ONLY;
  });
}

function getDelayedBillingAmount_(adjList) {
  return getDelayedBillingItems_(adjList).reduce(function(sum, item) {
    return sum + (Number(item.amount) || 0);
  }, 0);
}

function isStopOnlyBillingRecord_(record) {
  return !!record && !!record.isMonthlyStop && !(Number(record.delayedAmount) > 0);
}

function buildBillingRecordContext_(targetMonth) {
  var month = normalizeYearMonth_(targetMonth);
  var perf = startPerfLog_('buildBillingRecordContext_', { month: month });
  var memoryCtx = getBillingContextMemoryCache_(month);
  if (memoryCtx) {
    perf.mark('read memory cache');
    perf.done();
    return memoryCtx;
  }

  var cachedRecords = readBillingRecordCache_(month);
  if (cachedRecords) {
    var cachedCtx = buildBillingContextFromCachedRecords_(month, cachedRecords);
    setBillingContextMemoryCache_(month, cachedCtx);
    perf.mark('read billing cache');
    perf.done();
    return cachedCtx;
  }

  var users = loadMasterUsers_();
  perf.mark('loadMasterUsers');
  var honobono = getLatestHonobonoMap_(month);
  perf.mark('getLatestHonobonoMap');
  var adjustments = getActiveAdjustments_(month);
  perf.mark('getActiveAdjustments');
  var cashMaster = getActiveCashMasterMap_(month);
  perf.mark('getActiveCashMasterMap');
  var records = computeBillingRecordsFromData_(month, users, honobono, adjustments, cashMaster);
  perf.mark('computeBillingRecordsFromData');
  var ctx = {
    month: month,
    users: users,
    honobono: honobono,
    adjustments: adjustments,
    cashMaster: cashMaster,
    records: records
  };
  storeBillingRecordContext_(ctx);
  perf.mark('write billing cache');
  perf.done();
  return ctx;
}

function computeBillingRecords_(targetMonth) {
  return buildBillingRecordContext_(targetMonth).records;
}

function computeBillingRecordsFromData_(targetMonth, users, honobono, adjustments, cashMaster) {
  var month = normalizeYearMonth_(targetMonth);
  users = users || {};
  honobono = honobono || { rows: {}, list: [] };
  adjustments = adjustments || {};
  cashMaster = cashMaster || {};
  var allIds = {};
  Object.keys(honobono.rows).forEach(function(id) { allIds[id] = true; });
  Object.keys(adjustments).forEach(function(id) { allIds[id] = true; });

  return Object.keys(allIds).map(function(matchId) {
    var honobonoRow = honobono.rows[matchId];
    var adjList = adjustments[matchId] || [];
    var master = lookupMasterUser_(users, matchId);
    var honobonoAmount = honobonoRow ? honobonoRow.amount : 0;
    var honobonoName = honobonoRow ? honobonoRow.name : '';
    var masterName = master ? master.name : (honobonoRow ? honobonoRow.masterName : '');

    var hasCash = adjList.some(function(item) {
      return item.type === APP.ADJUSTMENT_TYPES.CASH;
    });
    var hasHold = adjList.some(function(item) {
      return isMonthlyStopType_(item.type);
    });
    var isUsuallyCash = !!cashMaster[matchId];
    if (!hasCash && !hasHold && cashMaster[matchId]) hasCash = true;

    var delayedItems = getDelayedBillingItems_(adjList);
    var hasPastOnly = delayedItems.length > 0;
    var additionalOnlyAmount = getAdditionalOnlyAmount_(adjList);
    var pastOnlyAmount = getDelayedBillingAmount_(adjList);

    var billingStatus = '通常請求';
    var finalAmount = 0;
    var isInputTarget = false;
    var isMonthlyStop = false;
    var showOnInputList = false;
    var canCopyAmount = false;
    var isReconcileTarget = false;
    var warnings = [];

    if (honobonoRow && honobonoRow.judgment === APP.IMPORT_JUDGMENT.AMOUNT_ERROR) {
      warnings.push('金額エラー');
    }

    if (hasHold) {
      isMonthlyStop = true;
      if (pastOnlyAmount > 0) {
        billingStatus = '当月停止＋月遅れ請求';
        finalAmount = pastOnlyAmount;
        isInputTarget = true;
        showOnInputList = true;
        canCopyAmount = true;
        isReconcileTarget = true;
      } else {
        billingStatus = APP.ADJUSTMENT_TYPES.HOLD;
        finalAmount = 0;
        // 通常現金の利用者は e集ちゃんへ入力しないため、当月停止でも照合対象外。
        showOnInputList = !isUsuallyCash;
        isReconcileTarget = !isUsuallyCash;
      }
    } else if (hasCash) {
      billingStatus = APP.ADJUSTMENT_TYPES.CASH;
      finalAmount = 0;
    } else if (hasPastOnly && !honobonoRow) {
      billingStatus = '月遅れ請求のみ';
      finalAmount = pastOnlyAmount + additionalOnlyAmount;
      isInputTarget = finalAmount !== 0 || adjList.length > 0;
      showOnInputList = isInputTarget;
      canCopyAmount = isInputTarget;
      isReconcileTarget = isInputTarget;
    } else {
      finalAmount = honobonoAmount + additionalOnlyAmount + pastOnlyAmount;
      if (pastOnlyAmount > 0 && additionalOnlyAmount > 0) billingStatus = '合算＋月遅れ請求';
      else if (pastOnlyAmount > 0) billingStatus = '通常＋月遅れ請求';
      else if (additionalOnlyAmount > 0 && honobonoAmount > 0) billingStatus = '合算請求';
      else if (additionalOnlyAmount > 0) billingStatus = '追加請求あり';
      else billingStatus = '通常請求';
      isInputTarget = true;
      showOnInputList = true;
      canCopyAmount = true;
      isReconcileTarget = true;
    }

    if (hasCash && !hasHold) {
      isInputTarget = false;
      showOnInputList = false;
      isReconcileTarget = false;
    }

    return {
      matchId: matchId,
      rawId: honobonoRow ? honobonoRow.rawId : (master ? master.rawId : matchId),
      name: honobonoName || masterName || (adjList[0] ? adjList[0].name : ''),
      honobonoName: honobonoName,
      masterName: masterName,
      masterKana: master ? master.kana : '',
      masterCategory: master ? master.category : APP.MASTER_CATEGORY.UNREGISTERED,
      billingStatus: billingStatus,
      isUsuallyCash: isUsuallyCash,
      honobonoAmount: honobonoAmount,
      additionalAmount: additionalOnlyAmount + pastOnlyAmount,
      additionalOnlyAmount: additionalOnlyAmount,
      delayedAmount: pastOnlyAmount,
      delayedItems: delayedItems,
      finalAmount: finalAmount,
      isInputTarget: isInputTarget,
      isMonthlyStop: isMonthlyStop,
      showOnInputList: showOnInputList,
      canCopyAmount: canCopyAmount,
      isReconcileTarget: isReconcileTarget,
      inputDisplay: isMonthlyStop && pastOnlyAmount <= 0 ? APP.MONTHLY_STOP_LABEL : String(finalAmount),
      adjustments: adjList,
      warnings: warnings,
      importJudgment: honobonoRow ? honobonoRow.judgment : ''
    };
  });
}

function summarizeBillingRecords_(records, honobono) {
  return buildHonobonoDisplaySummary_(records, honobono);
}

function computeBillingSummary_(targetMonth) {
  var ctx = buildBillingRecordContext_(targetMonth);
  return summarizeBillingRecords_(ctx.records, ctx.honobono);
}

function getBillingBreakdown_(targetMonth) {
  return getDashboard_(targetMonth);
}

function buildDashboardFromContext_(ctx) {
  var records = ctx.records;
  var summary = summarizeBillingRecords_(records, ctx.honobono);

  var issueCount = records.filter(function(record) {
    return record.warnings.length > 0
      || record.importJudgment === APP.IMPORT_JUDGMENT.AMOUNT_ERROR;
  }).length;

  return {
    summary: summary,
    issueCount: issueCount,
    eshuExpectedCount: summary.inputCount || 0,
    eshuExpectedTotal: summary.inputTotal || 0
  };
}

function getDashboard_(targetMonth) {
  validateConfig_();
  return buildDashboardFromContext_(buildBillingRecordContext_(targetMonth));
}

function toHonobonoBillingRow_(record) {
  var additionalItems = (record.adjustments || []).filter(function(item) {
    return item.type === APP.ADJUSTMENT_TYPES.ADDITIONAL;
  }).map(function(item) {
    return { id: item.id, amount: item.amount, memo: item.memo || '' };
  });
  var status = '通常';
  if (record.billingStatus === APP.ADJUSTMENT_TYPES.CASH) status = APP.ADJUSTMENT_TYPES.CASH;
  else if (record.isMonthlyStop) status = APP.ADJUSTMENT_TYPES.HOLD;
  else if (!record.honobonoName && record.delayedAmount > 0) status = '月遅れ請求のみ';
  else if (additionalItems.length) status = '合算';
  var delayedItems = getDelayedBillingItems_(record.adjustments || []).map(function(item) {
    return {
      id: item.id,
      targetBillingMonth: item.targetBillingMonth || '',
      amount: item.amount,
      legacy: !item.targetBillingMonth
    };
  });
  return {
    matchId: record.matchId,
    rawId: record.rawId,
    name: record.name,
    kana: record.masterKana || '',
    honobonoAmount: record.honobonoAmount,
    status: status,
    billingStatus: record.billingStatus,
    additionalAmount: record.additionalOnlyAmount,
    additionalItems: additionalItems,
    delayedAmount: record.delayedAmount || 0,
    delayedItems: delayedItems,
    finalAmount: record.finalAmount,
    isUsuallyCash: !!record.isUsuallyCash
  };
}

function buildHonobonoBillingListFromRecords_(records, honobono, summary) {
  var honobonoRows = [];
  var pastOnlyRows = [];
  records.forEach(function(record) {
    if (record.honobonoName || record.honobonoAmount > 0) {
      honobonoRows.push(toHonobonoBillingRow_(record));
    } else if (!record.honobonoName && record.delayedAmount > 0) {
      pastOnlyRows.push(toHonobonoBillingRow_(record));
    }
  });
  sortBillingRecords_(honobonoRows, 'name');
  sortBillingRecords_(pastOnlyRows, 'name');
  return {
    rows: honobonoRows,
    pastOnlyRows: pastOnlyRows,
    summary: summary || summarizeBillingRecords_(records, honobono)
  };
}

function getHonobonoBillingList(token, targetMonth) {
  requirePermissionAccess_(token);
  validateConfig_();
  return runWithPerfLog_('getHonobonoBillingList', { month: targetMonth }, function(perf) {
    var ctx = buildBillingRecordContext_(targetMonth);
    perf.mark('buildBillingRecordContext');
    var result = buildHonobonoBillingListFromRecords_(ctx.records, ctx.honobono);
    perf.mark('buildHonobonoBillingListFromRecords');
    return attachBillingMemosToHonobonoList_(targetMonth, result);
  });
}

function getInputTargetList(token, targetMonth, sortBy) {
  requirePermissionAccess_(token);
  validateConfig_();
  var records = computeBillingRecords_(targetMonth).filter(function(record) {
    return record.showOnInputList;
  });
  return sortBillingRecords_(records, sortBy || 'id');
}

function getListTabData_(targetMonth, tabName) {
  validateConfig_();
  var records = sortBillingRecords_(computeBillingRecords_(targetMonth), 'id');
  var tab = normalizeString_(tabName);
  if (tab === '入力対象') {
    return records.filter(function(record) { return record.isInputTarget; });
  }
  if (tab === '当月停止' || tab === '請求保留') {
    return records.filter(function(record) {
      return !!record.isMonthlyStop;
    });
  }
  if (tab === '現金支払い') {
    return records.filter(function(record) {
      return record.billingStatus === APP.ADJUSTMENT_TYPES.CASH;
    });
  }
  if (tab === '合算・追加請求') {
    return records.filter(function(record) {
      return record.additionalOnlyAmount > 0 || record.delayedAmount > 0;
    });
  }
  if (tab === '要確認') {
    return records.filter(function(record) {
      return record.warnings.length > 0
        || record.importJudgment === APP.IMPORT_JUDGMENT.AMOUNT_ERROR
        || record.importJudgment === APP.IMPORT_JUDGMENT.AMOUNT_WARNING;
    });
  }
  if (tab === '照合結果') {
    return getReconcileResults_(targetMonth);
  }
  return records;
}
