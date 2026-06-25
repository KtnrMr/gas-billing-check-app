function computeBillingRecords_(targetMonth) {
  var month = normalizeYearMonth_(targetMonth);
  var users = loadMasterUsers_();
  var honobono = getLatestHonobonoMap_(month);
  var adjustments = getActiveAdjustments_(month);
  var cashMaster = getActiveCashMasterMap_(month);
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
      return item.type === APP.ADJUSTMENT_TYPES.HOLD;
    });
    if (!hasCash && !hasHold && cashMaster[matchId]) hasCash = true;

    var hasPastOnly = adjList.some(function(item) {
      return item.type === APP.ADJUSTMENT_TYPES.PAST_ONLY;
    });
    var amountFix = adjList.find(function(item) {
      return item.type === APP.ADJUSTMENT_TYPES.AMOUNT_FIX;
    });
    var additionalAmount = adjList.filter(function(item) {
      return item.type === APP.ADJUSTMENT_TYPES.ADDITIONAL;
    }).reduce(function(sum, item) {
      return sum + item.amount;
    }, 0);
    var pastOnlyAmount = adjList.filter(function(item) {
      return item.type === APP.ADJUSTMENT_TYPES.PAST_ONLY;
    }).reduce(function(sum, item) {
      return sum + item.amount;
    }, 0);

    var billingStatus = '通常請求';
    var finalAmount = 0;
    var isInputTarget = false;
    var warnings = [];

    if (!master) warnings.push(APP.RECONCILE_JUDGMENT.ID_UNREGISTERED);
    if (honobonoRow && shouldShowNameWarning_(matchId, honobonoName, masterName)) {
      warnings.push(APP.RECONCILE_JUDGMENT.NAME_WARNING);
    }
    if (honobonoRow && honobonoRow.judgment === APP.IMPORT_JUDGMENT.AMOUNT_ERROR) {
      warnings.push('金額エラー');
    }

    if (hasCash) {
      billingStatus = APP.ADJUSTMENT_TYPES.CASH;
      finalAmount = 0;
    } else if (hasHold) {
      billingStatus = APP.ADJUSTMENT_TYPES.HOLD;
      finalAmount = 0;
    } else if (hasPastOnly && !honobonoRow) {
      billingStatus = APP.ADJUSTMENT_TYPES.PAST_ONLY;
      finalAmount = pastOnlyAmount + additionalAmount;
      isInputTarget = finalAmount !== 0 || adjList.length > 0;
    } else {
      if (amountFix) finalAmount = amountFix.amount;
      else finalAmount = honobonoAmount + additionalAmount;
      if (additionalAmount > 0 && honobonoAmount > 0) billingStatus = '合算請求';
      else if (additionalAmount > 0) billingStatus = '追加請求あり';
      else billingStatus = '通常請求';
      isInputTarget = true;
    }

    if (hasCash || hasHold) isInputTarget = false;

    return {
      matchId: matchId,
      rawId: honobonoRow ? honobonoRow.rawId : (master ? master.rawId : matchId),
      name: masterName || honobonoName || (adjList[0] ? adjList[0].name : ''),
      honobonoName: honobonoName,
      masterName: masterName,
      masterCategory: master ? master.category : APP.MASTER_CATEGORY.UNREGISTERED,
      billingStatus: billingStatus,
      honobonoAmount: honobonoAmount,
      additionalAmount: additionalAmount + pastOnlyAmount,
      finalAmount: finalAmount,
      isInputTarget: isInputTarget,
      adjustments: adjList,
      warnings: warnings,
      importJudgment: honobonoRow ? honobonoRow.judgment : ''
    };
  }).sort(function(a, b) {
    return a.matchId.localeCompare(b.matchId);
  });
}

function computeBillingSummary_(targetMonth) {
  var records = computeBillingRecords_(targetMonth);
  var honobono = getLatestHonobonoMap_(targetMonth);
  var summary = {
    honobonoCount: Object.keys(honobono.rows).length,
    honobonoTotal: Object.keys(honobono.rows).reduce(function(sum, key) {
      return sum + honobono.rows[key].amount;
    }, 0),
    normalCount: 0,
    normalTotal: 0,
    additionalCount: 0,
    additionalTotal: 0,
    pastOnlyCount: 0,
    pastOnlyTotal: 0,
    cashCount: 0,
    cashTotal: 0,
    holdCount: 0,
    holdTotal: 0,
    inputCount: 0,
    inputTotal: 0
  };

  records.forEach(function(record) {
    if (record.billingStatus === APP.ADJUSTMENT_TYPES.CASH) {
      summary.cashCount += 1;
      summary.cashTotal += record.honobonoAmount;
    } else if (record.billingStatus === APP.ADJUSTMENT_TYPES.HOLD) {
      summary.holdCount += 1;
      summary.holdTotal += record.honobonoAmount;
    } else if (record.billingStatus === APP.ADJUSTMENT_TYPES.PAST_ONLY) {
      summary.pastOnlyCount += 1;
      summary.pastOnlyTotal += record.finalAmount;
      if (record.isInputTarget) {
        summary.inputCount += 1;
        summary.inputTotal += record.finalAmount;
      }
    } else {
      if (record.additionalAmount > 0) {
        summary.additionalCount += 1;
        summary.additionalTotal += record.additionalAmount;
      } else {
        summary.normalCount += 1;
        summary.normalTotal += record.honobonoAmount;
      }
      if (record.isInputTarget) {
        summary.inputCount += 1;
        summary.inputTotal += record.finalAmount;
      }
    }
  });

  return summary;
}

function getBillingBreakdown(targetMonth) {
  return getDashboard(targetMonth);
}

function getDashboard(targetMonth) {
  validateConfig_();
  var month = normalizeYearMonth_(targetMonth);
  var records = computeBillingRecords_(month);
  var honobono = getLatestHonobonoMap_(month);
  var summary = {
    honobonoCount: Object.keys(honobono.rows).length,
    honobonoTotal: Object.keys(honobono.rows).reduce(function(sum, key) {
      return sum + honobono.rows[key].amount;
    }, 0),
    normalCount: 0,
    normalTotal: 0,
    additionalCount: 0,
    additionalTotal: 0,
    pastOnlyCount: 0,
    pastOnlyTotal: 0,
    cashCount: 0,
    cashTotal: 0,
    holdCount: 0,
    holdTotal: 0,
    inputCount: 0,
    inputTotal: 0
  };

  records.forEach(function(record) {
    if (record.billingStatus === APP.ADJUSTMENT_TYPES.CASH) {
      summary.cashCount += 1;
      summary.cashTotal += record.honobonoAmount;
    } else if (record.billingStatus === APP.ADJUSTMENT_TYPES.HOLD) {
      summary.holdCount += 1;
      summary.holdTotal += record.honobonoAmount;
    } else if (record.billingStatus === APP.ADJUSTMENT_TYPES.PAST_ONLY) {
      summary.pastOnlyCount += 1;
      summary.pastOnlyTotal += record.finalAmount;
      if (record.isInputTarget) {
        summary.inputCount += 1;
        summary.inputTotal += record.finalAmount;
      }
    } else {
      if (record.additionalAmount > 0) {
        summary.additionalCount += 1;
        summary.additionalTotal += record.additionalAmount;
      } else {
        summary.normalCount += 1;
        summary.normalTotal += record.honobonoAmount;
      }
      if (record.isInputTarget) {
        summary.inputCount += 1;
        summary.inputTotal += record.finalAmount;
      }
    }
  });

  var issueCount = records.filter(function(record) {
    return record.warnings.length > 0
      || record.importJudgment === APP.IMPORT_JUDGMENT.ID_UNREGISTERED
      || record.importJudgment === APP.IMPORT_JUDGMENT.AMOUNT_ERROR;
  }).length;

  return {
    summary: summary,
    issueCount: issueCount,
    eshuExpectedCount: summary.inputCount,
    eshuExpectedTotal: summary.inputTotal
  };
}

function getInputTargetList(targetMonth, sortBy) {
  validateConfig_();
  var records = computeBillingRecords_(targetMonth).filter(function(record) {
    return record.isInputTarget;
  });
  if (sortBy === 'name') {
    records.sort(function(a, b) {
      return a.name.localeCompare(b.name, 'ja');
    });
  }
  return records;
}

function getListTabData(targetMonth, tabName) {
  validateConfig_();
  var records = computeBillingRecords_(targetMonth);
  var tab = normalizeString_(tabName);
  if (tab === '入力対象') {
    return records.filter(function(record) { return record.isInputTarget; });
  }
  if (tab === '請求保留') {
    return records.filter(function(record) {
      return record.billingStatus === APP.ADJUSTMENT_TYPES.HOLD;
    });
  }
  if (tab === '現金支払い') {
    return records.filter(function(record) {
      return record.billingStatus === APP.ADJUSTMENT_TYPES.CASH;
    });
  }
  if (tab === '合算・追加請求') {
    return records.filter(function(record) {
      return record.additionalAmount > 0 || record.billingStatus === APP.ADJUSTMENT_TYPES.PAST_ONLY;
    });
  }
  if (tab === '要確認') {
    return records.filter(function(record) {
      return record.warnings.length > 0
        || record.importJudgment === APP.IMPORT_JUDGMENT.ID_UNREGISTERED
        || record.importJudgment === APP.IMPORT_JUDGMENT.AMOUNT_ERROR
        || record.importJudgment === APP.IMPORT_JUDGMENT.AMOUNT_WARNING;
    });
  }
  if (tab === '照合結果') {
    return getReconcileResults(targetMonth);
  }
  return records;
}
