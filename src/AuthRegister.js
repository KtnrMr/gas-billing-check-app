const AUTH_APP_REGISTRY = Object.freeze({
  spreadsheetId: '1yzGumxF-QNXP2W13s2uyIsL1M55eB-QOpVPu0VEt8CM',
  appName: '請求確定チェックアプリ',
  sheetName: 'アプリ'
});

function registerAuthApp_() {
  try {
    const ss = SpreadsheetApp.openById(AUTH_APP_REGISTRY.spreadsheetId);
    let sheet = ss.getSheetByName(AUTH_APP_REGISTRY.sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(AUTH_APP_REGISTRY.sheetName);
      sheet.getRange(1, 1, 1, 3).setValues([['アプリID', '名前', '更新日時']]);
      sheet.setFrozenRows(1);
    }
    const id = ScriptApp.getScriptId();
    const name = AUTH_APP_REGISTRY.appName;
    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    const last = sheet.getLastRow();
    if (last >= 2) {
      const values = sheet.getRange(2, 1, last - 1, 1).getValues();
      for (let i = 0; i < values.length; i++) {
        if (String(values[i][0] || '').trim() === id) {
          sheet.getRange(i + 2, 2, 1, 2).setValues([[name, stamp]]);
          return;
        }
      }
    }
    sheet.appendRow([id, name, stamp]);
  } catch (error) {}
}
