function buildHonobonoDisplaySummary_(records, honobono) {
  var summary = {
    honobonoImportCount: Object.keys(honobono.rows).length,
    honobonoImportTotal: Object.keys(honobono.rows).reduce(function(sum, key) {
      return sum + honobono.rows[key].amount;
    }, 0),
    billingCount: 0,
    totalBillingCount: 0,
    totalBillingAmount: 0,
    combinedCount: 0,
    combinedAmount: 0,
    cashCount: 0,
    cashAmount: 0,
    cashCurrentAmount: 0,
    cashAdditionalAmount: 0,
    cashDelayedAmount: 0,
    monthlyStopCount: 0,
    monthlyStopAmount: 0,
    pastOnlyCount: 0,
    pastOnlyAmount: 0
  };

  records.forEach(function(record) {
    var inList = record.honobonoName || record.honobonoAmount > 0
      || Number(record.delayedAmount) > 0;
    if (!inList) return;

    if (record.isMonthlyStop) {
      summary.monthlyStopCount += 1;
      summary.monthlyStopAmount += record.honobonoAmount;
    }
    if (isCashPaymentRecord_(record)) {
      summary.cashCount += 1;
      summary.cashAmount += record.finalAmount;
      summary.cashCurrentAmount += record.isMonthlyStop ? 0 : record.honobonoAmount;
      summary.cashAdditionalAmount += record.additionalOnlyAmount;
      summary.cashDelayedAmount += record.delayedAmount;
      return;
    }
    if (record.isMonthlyStop) {
      if (!(record.delayedAmount > 0)) return;
    }

    summary.billingCount += 1;
    if (record.delayedAmount > 0) {
      summary.pastOnlyCount += 1;
      summary.pastOnlyAmount += record.delayedAmount;
    }
    summary.totalBillingAmount += record.finalAmount;
    if (record.additionalOnlyAmount > 0) {
      summary.combinedCount += 1;
      summary.combinedAmount += record.additionalOnlyAmount;
    }
  });

  summary.totalBillingCount = summary.billingCount;

  var inputCount = 0;
  var inputTotal = 0;
  records.forEach(function(record) {
    if (record.isInputTarget) {
      inputCount += 1;
      inputTotal += record.finalAmount;
    }
  });
  summary.inputCount = inputCount;
  summary.inputTotal = inputTotal;
  summary.honobonoCount = summary.honobonoImportCount;
  summary.honobonoTotal = summary.honobonoImportTotal;
  summary.cashTotal = summary.cashAmount;
  summary.holdCount = summary.monthlyStopCount;
  summary.holdTotal = summary.monthlyStopAmount;

  return summary;
}

function buildReconcileComparisonSummaryFromData_(records, eshu) {
  var billingCount = 0;
  var billingTotal = 0;
  var reconcileTargetIds = {};
  (records || []).forEach(function(record) {
    if (!record.isReconcileTarget || isStopOnlyBillingRecord_(record)) return;
    reconcileTargetIds[record.matchId] = true;
    billingCount += 1;
    billingTotal += record.finalAmount;
  });

  var eshuCount = 0;
  var eshuTotal = 0;
  var extraInputCount = 0;
  var extraInputTotal = 0;
  Object.keys((eshu && eshu.rows) || {}).forEach(function(matchId) {
    var row = eshu.rows[matchId];
    if (row.monthlyStop) return;
    eshuCount += 1;
    eshuTotal += row.amount;
    if (!reconcileTargetIds[matchId]) {
      extraInputCount += 1;
      extraInputTotal += row.amount;
    }
  });

  return {
    billingCount: billingCount,
    billingTotal: billingTotal,
    eshuCount: eshuCount,
    eshuTotal: eshuTotal,
    extraInputCount: extraInputCount,
    extraInputTotal: extraInputTotal,
    countMatch: billingCount === eshuCount,
    amountMatch: billingTotal === eshuTotal,
    countDiff: eshuCount - billingCount,
    amountDiff: eshuTotal - billingTotal
  };
}

function getReconcileComparisonSummary(token, targetMonth) {
  requirePermissionAccess_(token);
  validateConfig_();
  var month = normalizeYearMonth_(targetMonth);
  return buildReconcileComparisonSummaryFromData_(
    computeBillingRecords_(month),
    getLatestEshuMap_(month)
  );
}
