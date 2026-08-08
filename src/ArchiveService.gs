function isArchiveActiveFlag_(value) {
  var text = normalizeString_(value).toUpperCase();
  return text === '1' || text === 'TRUE' || text === 'ON' || text === '○'
    || text === '有効' || text === '使用中';
}

function normalizeArchiveYear_(value) {
  var text = normalizeString_(value);
  if (/^\d{4}$/.test(text)) return text;
  var match = text.match(/^(\d{4})/);
  return match ? match[1] : '';
}

function ensureArchiveSettingInitialized_() {
  var ss = getBillingSpreadsheet_();
  var sheet = ensureSheet_(ss, APP.SHEETS.ARCHIVE_SETTING, APP.HEADERS.ARCHIVE_SETTING);
  var rows = readSheetObjects_(sheet);
  if (rows.length) return sheet;

  var year = Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyy');
  appendSheetObjects_(sheet, APP.HEADERS.ARCHIVE_SETTING, [{
    '表示名': year,
    '開始日': year + '-01-01',
    '終了日': year + '-12-31',
    '使用中': '1',
    '並び順': 1,
    '備考': '現在使用中'
  }]);
  return sheet;
}

function getArchiveSettings_() {
  ensureArchiveSettingInitialized_();
  var sheet = getBillingSpreadsheet_().getSheetByName(APP.SHEETS.ARCHIVE_SETTING);
  if (!sheet) return [];
  return readSheetObjects_(sheet).map(function(row, index) {
    return {
      label: normalizeString_(row['表示名']),
      startDate: normalizeString_(row['開始日']),
      endDate: normalizeString_(row['終了日']),
      active: isArchiveActiveFlag_(row['使用中']),
      order: Number(row['並び順']) || (index + 1),
      note: normalizeString_(row['備考']),
      rowNumber: index + 2
    };
  }).sort(function(a, b) {
    return a.order - b.order;
  });
}

function getArchiveAdminData() {
  validateConfig_();
  var settings = getArchiveSettings_();
  var active = settings.filter(function(item) { return item.active; });
  if (active.length > 1) {
    throw new Error('使用中のアーカイブ設定が複数あります。1つだけにしてください。');
  }
  return {
    success: true,
    active: active[0] || null,
    history: settings.filter(function(item) { return !item.active; }),
    archiveTargets: APP.ARCHIVE_TARGETS.map(function(target) {
      return APP.SHEETS[target.sheetKey];
    })
  };
}

function yearFromMonthValue_(value) {
  var month = normalizeYearMonth_(value);
  if (month) return month.slice(0, 4);
  var text = normalizeString_(value);
  var match = text.match(/^(\d{4})/);
  return match ? match[1] : '';
}

function splitSheetRowsByTargetYear_(sheet, monthHeaderName, targetYear) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) {
    return { headers: [], targetRows: [], remainingRows: [], lastRowBefore: 0, lastColumn: 0 };
  }

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0].map(function(header) {
    return normalizeString_(header);
  });
  var monthCol = headers.indexOf(monthHeaderName);
  if (monthCol < 0) {
    throw new Error(sheet.getName() + ' に「' + monthHeaderName + '」列がありません。');
  }

  var targetRows = [];
  var remainingRows = [];
  var yearText = String(targetYear);
  values.slice(1).forEach(function(row) {
    var isEmpty = row.every(function(cell) {
      return cell === '' || cell == null;
    });
    if (isEmpty) return;
    var year = yearFromMonthValue_(row[monthCol]);
    if (year === yearText) targetRows.push(row);
    else remainingRows.push(row);
  });

  return {
    headers: headers,
    targetRows: targetRows,
    remainingRows: remainingRows,
    lastRowBefore: lastRow,
    lastColumn: lastCol
  };
}

function writeArchiveSheetFromSplit_(ss, archiveSheetName, headers, targetRows) {
  var sheet = ss.insertSheet(archiveSheetName);
  if (!headers.length) {
    sheet.getRange(1, 1).setValue('（空）');
    return;
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#dbeafe');
  if (targetRows.length) {
    sheet.getRange(2, 1, targetRows.length, headers.length).setValues(targetRows);
  }
}

function rewriteCurrentSheetDataForArchive_(sheet, headers, remainingRows, lastRowBefore, lastColumn) {
  var colCount = Math.max(headers.length, lastColumn || 1, sheet.getLastColumn() || 1);
  if (lastRowBefore >= 2) {
    sheet.getRange(2, 1, lastRowBefore - 1, colCount).clearContent();
  }
  if (remainingRows.length) {
    var width = Math.max(headers.length, remainingRows[0].length);
    sheet.getRange(2, 1, remainingRows.length, width).setValues(remainingRows);
  }
  var newLast = Math.max(1, remainingRows.length + 1);
  if (sheet.getMaxRows() > newLast + 1) {
    try {
      sheet.deleteRows(newLast + 1, sheet.getMaxRows() - newLast);
    } catch (e) {
      // 余分な空行削除に失敗してもアーカイブ自体は成立
    }
  }
}

function resequenceArchiveSettings_(sheet) {
  var settings = getArchiveSettings_();
  settings.sort(function(a, b) {
    var yearA = Number(normalizeArchiveYear_(a.label)) || 0;
    var yearB = Number(normalizeArchiveYear_(b.label)) || 0;
    return yearB - yearA;
  });
  settings.forEach(function(item, index) {
    sheet.getRange(item.rowNumber, 5).setValue(index + 1);
  });
}

/**
 * 年次アーカイブ作成（他アプリ同型）。
 * 使用中年の対象月データを シート名_YYYY へ移し、使用中設定を翌年へ進める。
 */
function createYearArchive(payload) {
  validateConfig_();
  return withScriptLock_(function() {
    ensureArchiveSettingInitialized_();
    var requestedYear = normalizeArchiveYear_(payload && payload.year);
    var settings = getArchiveSettings_();
    var activeList = settings.filter(function(item) { return item.active; });
    if (!activeList.length) throw new Error('使用中のアーカイブ設定がありません。');
    if (activeList.length > 1) throw new Error('使用中のアーカイブ設定が複数あります。1つだけにしてください。');

    var active = activeList[0];
    var year = requestedYear || normalizeArchiveYear_(active.label);
    if (!year) throw new Error('アーカイブ対象年が不正です。表示名は西暦年（例: 2026）にしてください。');
    if (normalizeArchiveYear_(active.label) && normalizeArchiveYear_(active.label) !== year) {
      throw new Error(
        '使用中の表示名と対象年が一致しません。\n'
        + '現在使用中：' + active.label + '\n'
        + '対象年：' + year
      );
    }

    var nextYear = String(Number(year) + 1);
    var ss = getBillingSpreadsheet_();
    var settingSheet = ss.getSheetByName(APP.SHEETS.ARCHIVE_SETTING);
    var movedCounts = {};
    var totalMoved = 0;

    APP.ARCHIVE_TARGETS.forEach(function(target) {
      var baseName = APP.SHEETS[target.sheetKey];
      var archiveName = baseName + '_' + year;
      if (ss.getSheetByName(archiveName)) {
        throw new Error(archiveName + ' はすでに存在します。処理を中止しました。');
      }
      var sheet = ensureSheet_(ss, baseName, APP.HEADERS[target.headerKey]);
      var split = splitSheetRowsByTargetYear_(sheet, target.monthHeader, year);
      writeArchiveSheetFromSplit_(ss, archiveName, split.headers.length ? split.headers : APP.HEADERS[target.headerKey], split.targetRows);
      rewriteCurrentSheetDataForArchive_(
        sheet,
        split.headers.length ? split.headers : APP.HEADERS[target.headerKey],
        split.remainingRows,
        split.lastRowBefore,
        split.lastColumn
      );
      movedCounts[baseName] = split.targetRows.length;
      totalMoved += split.targetRows.length;
    });

    if (!totalMoved) {
      // 作成した空アーカイブシートを残さないよう削除
      APP.ARCHIVE_TARGETS.forEach(function(target) {
        var archiveName = APP.SHEETS[target.sheetKey] + '_' + year;
        var created = ss.getSheetByName(archiveName);
        if (created) ss.deleteSheet(created);
      });
      throw new Error(year + '年分のアーカイブ対象データがありません。');
    }

    settingSheet.getRange(active.rowNumber, 1, 1, APP.HEADERS.ARCHIVE_SETTING.length).setValues([[
      nextYear,
      nextYear + '-01-01',
      nextYear + '-12-31',
      '1',
      active.order || 1,
      '現在使用中'
    ]]);

    appendSheetObjects_(settingSheet, APP.HEADERS.ARCHIVE_SETTING, [{
      '表示名': year,
      '開始日': year + '-01-01',
      '終了日': year + '-12-31',
      '使用中': '',
      '並び順': '',
      '備考': 'アーカイブ済み'
    }]);
    resequenceArchiveSettings_(settingSheet);

    appendHistory_({
      targetMonth: year + '-12',
      type: '年次アーカイブ',
      targetId: '',
      targetName: '',
      before: { year: year },
      after: { nextYear: nextYear, movedCounts: movedCounts },
      memo: year + '年アーカイブ作成'
    });

    return {
      success: true,
      year: year,
      nextYear: nextYear,
      movedCounts: movedCounts,
      totalMoved: totalMoved,
      message: year + '年のアーカイブを作成しました（' + totalMoved + '行を移動）。',
      adminData: getArchiveAdminData()
    };
  });
}
