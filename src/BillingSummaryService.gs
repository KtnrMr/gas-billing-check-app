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
    monthlyStopCount: 0,
    monthlyStopAmount: 0,
    pastOnlyCount: 0,
    pastOnlyAmount: 0
  };

  records.forEach(function(record) {
    var inList = record.honobonoName || record.honobonoAmount > 0
      || record.billingStatus === APP.ADJUSTMENT_TYPES.PAST_ONLY;
    if (!inList) return;

    if (record.billingStatus === APP.ADJUSTMENT_TYPES.CASH) {
      summary.cashCount += 1;
      summary.cashAmount += record.honobonoAmount;
      return;
    }
    if (record.billingStatus === APP.ADJUSTMENT_TYPES.HOLD || record.isMonthlyStop) {
      summary.monthlyStopCount += 1;
      summary.monthlyStopAmount += record.honobonoAmount;
      return;
    }

    summary.billingCount += 1;
    if (record.billingStatus === APP.ADJUSTMENT_TYPES.PAST_ONLY) {
      summary.pastOnlyCount += 1;
      summary.pastOnlyAmount += record.finalAmount;
      summary.totalBillingAmount += record.finalAmount;
    } else {
      summary.totalBillingAmount += record.finalAmount;
      if (record.additionalOnlyAmount > 0) {
        summary.combinedCount += 1;
        summary.combinedAmount += record.additionalOnlyAmount;
      }
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
  (records || []).forEach(function(record) {
    if (!record.isReconcileTarget || record.isMonthlyStop) return;
    billingCount += 1;
    billingTotal += record.finalAmount;
  });

  var eshuCount = 0;
  var eshuTotal = 0;
  Object.keys((eshu && eshu.rows) || {}).forEach(function(matchId) {
    var row = eshu.rows[matchId];
    if (row.monthlyStop) return;
    eshuCount += 1;
    eshuTotal += row.amount;
  });

  return {
    billingCount: billingCount,
    billingTotal: billingTotal,
    eshuCount: eshuCount,
    eshuTotal: eshuTotal,
    countMatch: billingCount === eshuCount,
    amountMatch: billingTotal === eshuTotal,
    countDiff: eshuCount - billingCount,
    amountDiff: eshuTotal - billingTotal
  };
}

function getReconcileComparisonSummary(targetMonth) {
  validateConfig_();
  var month = normalizeYearMonth_(targetMonth);
  return buildReconcileComparisonSummaryFromData_(
    computeBillingRecords_(month),
    getLatestEshuMap_(month)
  );
}
