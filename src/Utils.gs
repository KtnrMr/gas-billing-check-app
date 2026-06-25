function normalizeString_(value) {
  return String(value == null ? '' : value).replace(/\u00A0/g, ' ').trim();
}

function normalizeIdForMatch_(value) {
  var text = normalizeString_(value)
    .replace(/[０-９]/g, function(char) {
      return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
    })
    .replace(/^0+/, '');
  return text;
}

function normalizeYearMonth_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, APP.TIMEZONE, 'yyyy-MM');
  }
  var text = normalizeString_(value);
  if (!text) return '';
  var match = text.match(/^(\d{4})[-\/](\d{1,2})(?:[-\/]\d{1,2})?$/);
  if (match) {
    return match[1] + '-' + ('0' + match[2]).slice(-2);
  }
  try {
    var parsed = new Date(text);
    if (!isNaN(parsed.getTime())) {
      return Utilities.formatDate(parsed, APP.TIMEZONE, 'yyyy-MM');
    }
  } catch (e) {}
  return '';
}

function yearMonthKeyEquals_(left, right) {
  return normalizeYearMonth_(left) === normalizeYearMonth_(right);
}

function nowIso_() {
  return Utilities.formatDate(new Date(), APP.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
}

function formatDateTime_(date) {
  return Utilities.formatDate(date || new Date(), APP.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
}

function getOperator_() {
  try {
    var email = Session.getActiveUser().getEmail();
    if (email) return email;
  } catch (e) {}
  try {
    return Session.getEffectiveUser().getEmail() || 'unknown';
  } catch (e2) {
    return 'unknown';
  }
}

function parseAmount_(value) {
  var text = normalizeString_(value)
    .replace(/[¥￥円]/g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '');
  if (!text) {
    return { ok: false, error: '金額が空欄です', value: null };
  }
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    return { ok: false, error: '金額の形式が不正です', value: null };
  }
  var num = Number(text);
  if (!isFinite(num)) {
    return { ok: false, error: '金額の形式が不正です', value: null };
  }
  if (num < 0) {
    return { ok: false, warning: true, value: Math.round(num) };
  }
  return { ok: true, value: Math.round(num) };
}

function amountForCopy_(value) {
  return String(Math.round(Number(value) || 0));
}

function namesDiffer_(nameA, nameB) {
  var a = normalizeString_(nameA).replace(/\s+/g, '');
  var b = normalizeString_(nameB).replace(/\s+/g, '');
  if (!a || !b) return false;
  return a !== b;
}

function toJson_(value) {
  return JSON.stringify(value == null ? null : value);
}

function fromJson_(value) {
  if (!normalizeString_(value)) return null;
  try {
    return JSON.parse(value);
  } catch (e) {
    return value;
  }
}

function compareYearMonth_(left, right) {
  return normalizeYearMonth_(left).localeCompare(normalizeYearMonth_(right));
}

function isMonthInRange_(targetMonth, startMonth, endMonth) {
  var month = normalizeYearMonth_(targetMonth);
  var start = normalizeYearMonth_(startMonth);
  var end = normalizeYearMonth_(endMonth);
  if (!month) return false;
  if (start && compareYearMonth_(month, start) < 0) return false;
  if (end && compareYearMonth_(month, end) > 0) return false;
  return true;
}

function withScriptLock_(callback) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function scoreCsvText_(text) {
  var score = 0;
  ['利用者番号', '利用者名', '請求額', '顧客番号', '顧客名', '請求金額', '請求年月'].forEach(function(marker) {
    if (String(text).indexOf(marker) >= 0) score += 10;
  });
  score -= (String(text).match(/\uFFFD/g) || []).length;
  return score;
}

function decodeUploadedCsv_(base64Content) {
  var bytes = Utilities.base64Decode(String(base64Content || ''));
  var blob = Utilities.newBlob(bytes);
  var encodings = ['UTF-8', 'Shift_JIS', 'Windows-31j', 'MS932'];
  var bestText = '';
  var bestScore = -1;
  encodings.forEach(function(encoding) {
    try {
      var text = blob.getDataAsString(encoding);
      var score = scoreCsvText_(text);
      if (score > bestScore) {
        bestScore = score;
        bestText = text;
      }
    } catch (e) {}
  });
  if (bestScore < 10) {
    throw new Error(
      'CSVの文字コードを判別できませんでした。UTF-8 または Shift_JIS で保存し直してください。'
    );
  }
  return String(bestText).replace(/^\uFEFF/, '');
}

function resolveCsvPayload_(payload) {
  var text = String(payload || '');
  if (text.indexOf('B64:') === 0) {
    return decodeUploadedCsv_(text.slice(4));
  }
  return text.replace(/^\uFEFF/, '');
}

function parseCsvRows_(csvText) {
  var text = String(csvText || '').replace(/^\uFEFF/, '');
  var firstLine = text.split(/\r?\n/)[0] || '';
  if (firstLine.indexOf('\t') >= 0 && firstLine.indexOf(',') < 0) {
    return text.split(/\r?\n/).filter(function(line) {
      return normalizeString_(line);
    }).map(function(line) {
      return line.split('\t');
    });
  }
  return Utilities.parseCsv(text);
}

function normalizeCsvHeader_(value) {
  return normalizeString_(value)
    .replace(/^\uFEFF/, '')
    .replace(/[""「」'']/g, '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/[\s\u00A0\u3000]/g, '');
}

function csvHeaderMatches_(normalizedHeader, label) {
  var normalizedLabel = normalizeCsvHeader_(label);
  if (!normalizedHeader || !normalizedLabel) return false;
  if (normalizedHeader === normalizedLabel) return true;
  return normalizedHeader.indexOf(normalizedLabel) >= 0
    || normalizedLabel.indexOf(normalizedHeader) >= 0;
}

function findCsvHeaderMapping_(rows, columnDefs) {
  var result = null;
  rows.slice(0, 50).some(function(values, index) {
    var normalized = values.map(function(value) {
      return normalizeCsvHeader_(value);
    });
    var columns = {};
    var missing = [];
    columnDefs.forEach(function(def) {
      var colIndex = -1;
      var i;
      for (i = 0; i < normalized.length; i++) {
        var matched = def.labels.some(function(label) {
          return csvHeaderMatches_(normalized[i], label);
        });
        if (matched) {
          colIndex = i;
          break;
        }
      }
      if (colIndex < 0) missing.push(def.labels[0]);
      else columns[def.key] = colIndex;
    });
    if (missing.length) return false;
    result = {
      index: index,
      columns: columns,
      rawHeaders: values.map(function(value) {
        return normalizeString_(value);
      })
    };
    return true;
  });
  return result;
}

function describeCsvHeaders_(rows) {
  var samples = rows.slice(0, 5).map(function(values) {
    return values.map(function(value) {
      return normalizeString_(value);
    }).filter(Boolean).join(' / ');
  }).filter(Boolean);
  return samples.length ? samples.join(' | ') : '（見出し行を検出できませんでした）';
}

function buildHonobonoHeaderDefs_() {
  return [
    { key: 'id', labels: APP.HONOBONO_CSV.ID_ALIASES },
    { key: 'name', labels: APP.HONOBONO_CSV.NAME_ALIASES },
    { key: 'amount', labels: APP.HONOBONO_CSV.AMOUNT_ALIASES }
  ];
}

function buildEshuHeaderDefs_() {
  return [
    { key: 'id', labels: APP.ESHU_CSV.ID_ALIASES },
    { key: 'name', labels: APP.ESHU_CSV.NAME_ALIASES },
    { key: 'amount', labels: APP.ESHU_CSV.AMOUNT_ALIASES }
  ];
}

function findCsvHeaderRow_(rows, requiredHeaders) {
  var mapping = findCsvHeaderMapping_(rows, requiredHeaders.map(function(header) {
    return { key: header, labels: [header] };
  }));
  if (!mapping) return null;
  return {
    index: mapping.index,
    headers: mapping.rawHeaders
  };
}

function headerIndex_(headers, name) {
  return headers.indexOf(name);
}

function generateId_(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function isTruthyFlag_(value) {
  var text = normalizeString_(value);
  return text === '1' || text.toUpperCase() === 'TRUE' || text === 'はい';
}

function isActiveFlag_(value) {
  return isTruthyFlag_(value) || normalizeString_(value) === '有効';
}
