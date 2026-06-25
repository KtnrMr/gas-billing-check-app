function loadMasterUsers_() {
  var settings = getAppSettings_();
  var ss = getMasterSpreadsheetFromSettings_();
  var idColumn = settings.MASTER_ID_COLUMN || 'ID';
  var basicSheet = getRequiredSheet_(ss, settings.BASIC_INFO_SHEET_NAME);
  var endedSheet = getRequiredSheet_(ss, settings.ENDED_USER_SHEET_NAME);
  var users = {};

  readSheetObjects_(basicSheet).forEach(function(row) {
    var matchId = normalizeIdForMatch_(row[idColumn]);
    if (!matchId) return;
    users[matchId] = {
      matchId: matchId,
      rawId: normalizeString_(row[idColumn]),
      name: normalizeString_(row['氏名']),
      kana: normalizeString_(row['フリガナ']),
      active: isTruthyFlag_(row['利用中']),
      category: APP.MASTER_CATEGORY.ACTIVE
    };
  });

  readSheetObjects_(endedSheet).forEach(function(row) {
    var matchId = normalizeIdForMatch_(row[idColumn]);
    if (!matchId || users[matchId]) return;
    users[matchId] = {
      matchId: matchId,
      rawId: normalizeString_(row[idColumn]),
      name: normalizeString_(row['氏名']),
      kana: normalizeString_(row['フリガナ']),
      active: false,
      category: APP.MASTER_CATEGORY.ENDED
    };
  });

  return users;
}

function lookupMasterUser_(users, matchId) {
  return users[normalizeIdForMatch_(matchId)] || null;
}

function searchMasterUsers_(query, includeEnded) {
  var users = loadMasterUsers_();
  var q = normalizeString_(query).toLowerCase();
  var qId = normalizeIdForMatch_(query);
  return Object.keys(users).map(function(key) {
    return users[key];
  }).filter(function(user) {
    if (!includeEnded && user.category === APP.MASTER_CATEGORY.ENDED) return false;
    if (!q) return true;
    if (qId && user.matchId.indexOf(qId) >= 0) return true;
    if (user.rawId && user.rawId.indexOf(query) >= 0) return true;
    if (user.name && user.name.indexOf(query) >= 0) return true;
    if (user.kana && user.kana.toLowerCase().indexOf(q) >= 0) return true;
    return false;
  }).sort(function(a, b) {
    return (a.kana || a.name).localeCompare(b.kana || b.name, 'ja');
  });
}

function searchMasterUsers(query, includeEnded) {
  return searchMasterUsers_(query, !!includeEnded);
}
