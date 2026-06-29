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

/** 固定行以外をすべて削除しようとすると GAS が失敗するため、最後の1行は残す */
function removeSheetDataRowsSafe_(sheet, startRow, deleteCount) {
  if (!sheet || deleteCount <= 0) return false;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  var totalDataRows = lastRow - 1;
  var start = Math.max(2, Number(startRow) || 2);
  var count = Math.min(deleteCount, totalDataRows - (start - 2));
  if (count <= 0) return false;

  var endRow = start + count - 1;
  var removesAllData = start <= 2 && endRow >= lastRow;
  if (removesAllData) {
    var colCount = Math.max(sheet.getLastColumn(), 1);
    sheet.getRange(2, 1, 2, colCount).clearContent();
    if (totalDataRows > 1) {
      sheet.deleteRows(3, totalDataRows - 1);
    }
    return true;
  }

  sheet.deleteRows(start, count);
  return false;
}

function writeSheetObjects_(sheet, headers, rows) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#dbeafe');
  } else {
    assertHeaders_(sheet, headers);
  }

  var dataValues = objectsToSheetValues_(headers, rows || []);
  var neededDataRows = dataValues.length;
  var lastRow = sheet.getLastRow();
  var currentDataRows = Math.max(0, lastRow - 1);

  if (neededDataRows > 0) {
    sheet.getRange(2, 1, neededDataRows, headers.length).setValues(dataValues);
    formatTextColumns_(sheet, headers, 2, neededDataRows);
  }
  if (currentDataRows > neededDataRows) {
    removeSheetDataRowsSafe_(sheet, neededDataRows + 2, currentDataRows - neededDataRows);
  }
}

function objectsToSheetValues_(headers, rows) {
  return (rows || []).map(function(row) {
    return headers.map(function(header) {
      return row[header] == null ? '' : row[header];
    });
  });
}

function setSheetObjectRows_(sheet, headers, startRow, rows) {
  if (!rows || !rows.length) return;
  var values = objectsToSheetValues_(headers, rows);
  sheet.getRange(startRow, 1, values.length, headers.length).setValues(values);
  formatTextColumns_(sheet, headers, startRow, values.length);
}

function updateSheetObjectsAtDataIndexes_(sheet, headers, rows, dataIndexes) {
  var indexes = (dataIndexes || []).map(function(index) {
    return Number(index);
  }).filter(function(index) {
    return isFinite(index) && index >= 0 && index < rows.length;
  }).sort(function(a, b) {
    return a - b;
  });
  if (!indexes.length) return;

  var startIndex = indexes[0];
  var previousIndex = indexes[0];
  var group = [rows[startIndex]];
  function flushGroup() {
    setSheetObjectRows_(sheet, headers, startIndex + 2, group);
  }
  for (var i = 1; i < indexes.length; i++) {
    var index = indexes[i];
    if (index === previousIndex) continue;
    if (index === previousIndex + 1) {
      group.push(rows[index]);
    } else {
      flushGroup();
      startIndex = index;
      group = [rows[index]];
    }
    previousIndex = index;
  }
  flushGroup();
}

function formatTextColumns_(sheet, headers, startRow, rowCount) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return;
  var firstRow = Number(startRow) || 1;
  var rows = rowCount == null ? lastRow - firstRow + 1 : Number(rowCount);
  if (!isFinite(rows) || rows < 1) return;
  headers.forEach(function(header, index) {
    if (header === '対象月' || header.indexOf('日時') >= 0
      || header.indexOf('照合用ID') >= 0 || header === '利用者番号' || header === '顧客番号'
      || header === '請求金額' || header === '完了マーク照合用ID' || header === '最終コピー照合用ID') {
      sheet.getRange(firstRow, index + 1, rows, 1).setNumberFormat('@');
    }
  });
}

function appendSheetObjects_(sheet, headers, rows) {
  if (!rows.length) return;
  var lastRow = sheet.getLastRow();
  var startRow = lastRow + 1;
  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    startRow = 2;
  }
  setSheetObjectRows_(sheet, headers, startRow, rows);
}

function appendSheetObjectsFast_(sheet, headers, rows) {
  if (!rows || !rows.length) return;
  var values = objectsToSheetValues_(headers, rows);
  var lastRow = sheet.getLastRow();
  var startRow = lastRow + 1;
  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    startRow = 2;
  }
  sheet.getRange(startRow, 1, values.length, headers.length).setValues(values);
}

function replaceMonthRowsInSheet_(sheet, headers, monthHeader, month, newRows) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    if (newRows && newRows.length) appendSheetObjectsFast_(sheet, headers, newRows);
    return 'append-empty';
  }

  var sheetHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(value) { return normalizeString_(value); });
  var monthColIndex = sheetHeaders.indexOf(monthHeader);
  if (monthColIndex < 0) {
    throw new Error(sheet.getName() + ' に「' + monthHeader + '」列がありません。');
  }

  var monthValues = sheet.getRange(2, monthColIndex + 1, lastRow - 1, 1).getValues();
  var monthRowNumbers = [];
  var i;
  for (i = 0; i < monthValues.length; i++) {
    if (yearMonthKeyEquals_(monthValues[i][0], month)) {
      monthRowNumbers.push(i + 2);
    }
  }

  if (!monthRowNumbers.length) {
    if (newRows && newRows.length) appendSheetObjectsFast_(sheet, headers, newRows);
    return 'append-new-month';
  }

  var contiguous = true;
  for (i = 1; i < monthRowNumbers.length; i++) {
    if (monthRowNumbers[i] !== monthRowNumbers[i - 1] + 1) {
      contiguous = false;
      break;
    }
  }

  if (contiguous) {
    var firstRow = monthRowNumbers[0];
    var deleteCount = monthRowNumbers.length;
    var totalDataRows = lastRow - 1;
    var allDataRemoved = removeSheetDataRowsSafe_(sheet, firstRow, deleteCount);

    if (newRows && newRows.length) {
      if (allDataRemoved || firstRow <= 2 && deleteCount >= totalDataRows) {
        var values = objectsToSheetValues_(headers, newRows);
        sheet.getRange(2, 1, values.length, headers.length).setValues(values);
      } else {
        appendSheetObjectsFast_(sheet, headers, newRows);
      }
    }
    return 'delete-append';
  }

  var existingRows = readSheetObjects_(sheet);
  writeSheetObjects_(sheet, headers, replaceRowsByFilterWithRows_(existingRows, function(row) {
    return yearMonthKeyEquals_(row[monthHeader], month);
  }, newRows || []));
  return 'full-rewrite';
}

function replaceRowsByFilter_(sheet, headers, predicate, newRows) {
  var existingRows = readSheetObjects_(sheet);
  var keep = existingRows.filter(function(row) {
    return !predicate(row);
  });
  writeSheetObjects_(sheet, headers, keep.concat(newRows || []));
}

function replaceRowsByFilterWithRows_(existingRows, predicate, newRows) {
  var keep = (existingRows || []).filter(function(row) {
    return !predicate(row);
  });
  return keep.concat(newRows || []);
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
  formatTextColumns_(sheet, headers, rowIndex, 1);
}
