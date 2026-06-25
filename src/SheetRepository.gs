function readSheetObjects_(sheet) {
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0].map(function(header) {
    return normalizeString_(header);
  });
  return values.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(header, index) {
      if (!header) return;
      obj[header] = normalizeSheetValueForClient_(row[index]);
    });
    return obj;
  });
}

function normalizeSheetValueForClient_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return formatDateTime_(value);
  }
  return value;
}

function assertHeaders_(sheet, headers) {
  if (!sheet) throw new Error('シートが見つかりません。');
  var actual = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0]
    .map(function(value) { return normalizeString_(value); });
  var missing = headers.filter(function(header) {
    return actual.indexOf(header) < 0;
  });
  if (missing.length) {
    throw new Error(sheet.getName() + ' に必要な見出しがありません: ' + missing.join(', '));
  }
}

function ensureSheet_(spreadsheet, name, headers) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#dbeafe');
    sheet.autoResizeColumns(1, headers.length);
  } else {
    assertHeaders_(sheet, headers);
  }
  return sheet;
}

function writeSheetObjects_(sheet, headers, rows) {
  var output = [headers];
  rows.forEach(function(row) {
    output.push(headers.map(function(header) {
      return row[header] == null ? '' : row[header];
    }));
  });
  sheet.clearContents();
  if (!output.length) return;
  sheet.getRange(1, 1, output.length, headers.length).setValues(output);
  sheet.setFrozenRows(1);
  formatTextColumns_(sheet, headers);
}

function formatTextColumns_(sheet, headers) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return;
  headers.forEach(function(header, index) {
    if (header === '対象月' || header.indexOf('日時') >= 0) {
      sheet.getRange(1, index + 1, lastRow, 1).setNumberFormat('@');
    }
  });
}

function appendSheetObjects_(sheet, headers, rows) {
  if (!rows.length) return;
  var values = rows.map(function(row) {
    return headers.map(function(header) {
      return row[header] == null ? '' : row[header];
    });
  });
  var startRow = sheet.getLastRow() + 1;
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    startRow = 2;
  }
  // getRange(row, column, numRows, numColumns) — 3番目は行数（終了行ではない）
  sheet.getRange(startRow, 1, values.length, headers.length).setValues(values);
  formatTextColumns_(sheet, headers);
}

function replaceRowsByFilter_(sheet, headers, predicate, newRows) {
  var keep = readSheetObjects_(sheet).filter(function(row) {
    return !predicate(row);
  });
  writeSheetObjects_(sheet, headers, keep.concat(newRows));
}

function getRequiredSheet_(spreadsheet, name) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error('シート「' + name + '」が見つかりません。');
  return sheet;
}

function findRowIndexByKey_(sheet, keyHeader, keyValue) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(value) { return normalizeString_(value); });
  var keyIndex = headers.indexOf(keyHeader);
  if (keyIndex < 0) return -1;
  var values = sheet.getRange(2, keyIndex + 1, lastRow - 1, 1).getValues();
  var i;
  for (i = 0; i < values.length; i++) {
    var cellValue = values[i][0];
    var matched = keyHeader === '対象月'
      ? yearMonthKeyEquals_(cellValue, keyValue)
      : normalizeString_(cellValue) === normalizeString_(keyValue);
    if (matched) return i + 2;
  }
  return -1;
}

function upsertRowByKey_(sheet, headers, keyHeader, row) {
  var rowIndex = findRowIndexByKey_(sheet, keyHeader, row[keyHeader]);
  var values = headers.map(function(header) {
    return row[header] == null ? '' : row[header];
  });
  if (rowIndex < 0) {
    appendSheetObjects_(sheet, headers, [row]);
    return;
  }
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([values]);
}
