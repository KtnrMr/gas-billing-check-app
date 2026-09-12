const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const context = { console };
vm.createContext(context);

function load(file) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
  vm.runInContext(source, context, { filename: file });
}

load('Constants.gs');
vm.runInContext(`
  function normalizeYearMonth_(value) { return String(value || ''); }
  function normalizeString_(value) { return value == null ? '' : String(value).trim(); }
  function lookupMasterUser_(users, id) { return users[id] || null; }
  function isMonthlyStopType_(type) {
    return type === APP.ADJUSTMENT_TYPES.HOLD || type === APP.LEGACY_HOLD_LABEL;
  }
  function shouldShowNameWarningWithMap_() { return false; }
`, context);
load('BillingService.gs');
load('BillingSummaryService.gs');
load('ReconcileService.gs');

function adjustment(type, amount, targetBillingMonth) {
  return { type, amount: amount || 0, targetBillingMonth: targetBillingMonth || '' };
}

function compute(honobonoRows, adjustments, cashMaster) {
  return context.computeBillingRecordsFromData_(
    '2026-09',
    { '001': { rawId: '001', name: '山田太郎', kana: 'ヤマダタロウ', category: '利用中' } },
    { rows: honobonoRows || {}, list: [] },
    adjustments || {},
    cashMaster || {}
  );
}

const holdAndDelayed = compute(
  { '001': { rawId: '001', name: '山田太郎', amount: 12000, judgment: 'OK' } },
  { '001': [
    adjustment(context.APP.ADJUSTMENT_TYPES.HOLD),
    adjustment(context.APP.ADJUSTMENT_TYPES.PAST_ONLY, 3000, '2026-07')
  ] }
)[0];
assert.strictEqual(holdAndDelayed.billingStatus, '当月停止＋月遅れ請求');
assert.strictEqual(holdAndDelayed.finalAmount, 3000);
assert.strictEqual(holdAndDelayed.delayedAmount, 3000);
assert.strictEqual(holdAndDelayed.isInputTarget, true);
assert.strictEqual(holdAndDelayed.isReconcileTarget, true);
assert.strictEqual(context.judgeReconcile_(holdAndDelayed, { amount: 3000, monthlyStop: false, name: '山田太郎' }, {}).judgment, 'OK');

const pureHold = compute(
  { '001': { rawId: '001', name: '山田太郎', amount: 12000, judgment: 'OK' } },
  { '001': [adjustment(context.APP.ADJUSTMENT_TYPES.HOLD)] }
)[0];
assert.strictEqual(pureHold.finalAmount, 0);
assert.strictEqual(pureHold.inputDisplay, '当月停止');
assert.strictEqual(pureHold.isInputTarget, false);

const currentAndDelayed = compute(
  { '001': { rawId: '001', name: '山田太郎', amount: 12000, judgment: 'OK' } },
  { '001': [adjustment(context.APP.ADJUSTMENT_TYPES.PAST_ONLY, 3000, '2026-07')] }
)[0];
assert.strictEqual(currentAndDelayed.finalAmount, 15000);
assert.strictEqual(currentAndDelayed.billingStatus, '通常＋月遅れ請求');

const delayedOnly = compute(
  {},
  { '001': [adjustment(context.APP.ADJUSTMENT_TYPES.PAST_ONLY, 3000, '2026-07')] }
)[0];
assert.strictEqual(delayedOnly.finalAmount, 3000);
assert.strictEqual(delayedOnly.billingStatus, '月遅れ請求のみ');

const summary = context.buildHonobonoDisplaySummary_([holdAndDelayed], {
  rows: { '001': { amount: 12000 } }
});
assert.strictEqual(summary.monthlyStopCount, 1);
assert.strictEqual(summary.pastOnlyCount, 1);
assert.strictEqual(summary.billingCount, 1);
assert.strictEqual(summary.totalBillingAmount, 3000);

const cashCombinedAndDelayed = compute(
  { '001': { rawId: '001', name: '山田太郎', amount: 12000, judgment: 'OK' } },
  { '001': [
    adjustment(context.APP.ADJUSTMENT_TYPES.CASH),
    adjustment(context.APP.ADJUSTMENT_TYPES.ADDITIONAL, 1000),
    adjustment(context.APP.ADJUSTMENT_TYPES.PAST_ONLY, 3000, '2026-07')
  ] }
)[0];
assert.strictEqual(cashCombinedAndDelayed.billingStatus, '現金支払い＋合算＋月遅れ請求');
assert.strictEqual(cashCombinedAndDelayed.finalAmount, 16000);
assert.strictEqual(cashCombinedAndDelayed.isCashPayment, true);
assert.strictEqual(cashCombinedAndDelayed.isInputTarget, false);
assert.strictEqual(cashCombinedAndDelayed.isReconcileTarget, false);

const cashSummary = context.buildHonobonoDisplaySummary_([cashCombinedAndDelayed], {
  rows: { '001': { amount: 12000 } }
});
assert.strictEqual(cashSummary.billingCount, 0);
assert.strictEqual(cashSummary.cashCount, 1);
assert.strictEqual(cashSummary.cashAmount, 16000);
assert.strictEqual(cashSummary.cashCurrentAmount, 12000);
assert.strictEqual(cashSummary.cashAdditionalAmount, 1000);
assert.strictEqual(cashSummary.cashDelayedAmount, 3000);

const cashHoldAndDelayed = compute(
  { '001': { rawId: '001', name: '山田太郎', amount: 12000, judgment: 'OK' } },
  { '001': [
    adjustment(context.APP.ADJUSTMENT_TYPES.HOLD),
    adjustment(context.APP.ADJUSTMENT_TYPES.PAST_ONLY, 3000, '2026-07')
  ] },
  { '001': true }
)[0];
assert.strictEqual(cashHoldAndDelayed.finalAmount, 3000);
assert.strictEqual(cashHoldAndDelayed.isCashPayment, true);
assert.strictEqual(cashHoldAndDelayed.isMonthlyStop, true);
assert.strictEqual(cashHoldAndDelayed.isInputTarget, false);

console.log('delayed billing checks passed');
