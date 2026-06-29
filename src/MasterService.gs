var masterUsersMemoryCache_ = null;

function clearMasterUsersMemoryCache_() {
  masterUsersMemoryCache_ = null;
}

function masterUserFromCacheRow_(row) {
  var matchId = normalizeIdForMatch_(row['照合用ID']);
  if (!matchId) return null;
  var category = normalizeString_(row['マスタ区分']) || APP.MASTER_CATEGORY.UNREGISTERED;
  return {
    matchId: matchId,
    rawId: normalizeString_(row['顧客番号']),
    name: normalizeString_(row['氏名']),
    kana: normalizeString_(row['フリガナ']),
    active: category === APP.MASTER_CATEGORY.ACTIVE,
    category: category
  };
}

function loadMasterUsersFromExternal_() {
  var perf = startPerfLog_('loadMasterUsersFromExternal_', {});
  var settings = getAppSettings_();
  var ss = getMasterSpreadsheetFromSettings_();
  var idColumn = settings.MASTER_ID_COLUMN || 'ID';
  var basicSheet = getRequiredSheet_(ss, settings.BASIC_INFO_SHEET_NAME);
  var endedSheet = getRequiredSheet_(ss, settings.ENDED_USER_SHEET_NAME);
  var users = {};

  perf.mark('read basic info');
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

  perf.mark('read ended users');
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

  perf.done();
  return users;
}

function writeMasterUserCache_(users) {
  var syncedAt = formatDateTime_(new Date());
  var rows = Object.keys(users || {}).map(function(key) {
    var user = users[key];
    return {
      '照合用ID': user.matchId,
      '顧客番号': user.rawId,
      '氏名': user.name,
      'フリガナ': user.kana,
      'マスタ区分': user.category,
      '同期日時': syncedAt
    };
  }).sort(function(a, b) {
    return compareByKanaName_(a, b);
  });
  var sheet = ensureSheet_(
    getBillingSpreadsheet_(),
    APP.SHEETS.MASTER_CACHE,
    APP.HEADERS.MASTER_CACHE
  );
  writeSheetObjects_(sheet, APP.HEADERS.MASTER_CACHE, rows);
  saveAppSetting_(APP.SETTINGS_KEYS.MASTER_CACHE_SYNCED_AT, syncedAt);
  return {
    count: rows.length,
    syncedAt: syncedAt
  };
}

function syncMasterUserCache_() {
  clearMasterUsersMemoryCache_();
  clearAllBillingRecordCache_();
  var perf = startPerfLog_('syncMasterUserCache_', {});
  var users = loadMasterUsersFromExternal_();
  perf.mark('read external');
  var meta = writeMasterUserCache_(users);
  perf.mark('write cache');
  masterUsersMemoryCache_ = users;
  perf.done();
  return {
    users: users,
    count: meta.count,
    syncedAt: meta.syncedAt
  };
}

function readMasterUsersFromCache_() {
  var sheet = getBillingSpreadsheet_().getSheetByName(APP.SHEETS.MASTER_CACHE);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var users = {};
  readSheetObjects_(sheet).forEach(function(row) {
    var user = masterUserFromCacheRow_(row);
    if (user) users[user.matchId] = user;
  });
  return Object.keys(users).length ? users : null;
}

function loadMasterUsers_() {
  if (masterUsersMemoryCache_) return masterUsersMemoryCache_;

  var perf = startPerfLog_('loadMasterUsers_', {});
  var users = readMasterUsersFromCache_();
  if (users) {
    perf.mark('read cache');
    perf.done();
    masterUsersMemoryCache_ = users;
    return users;
  }

  syncMasterUserCache_();
  perf.mark('sync on cache miss');
  perf.done();
  return masterUsersMemoryCache_;
}

function getMasterUserCacheStatus() {
  validateConfig_();
  var settings = getAppSettings_();
  var users = readMasterUsersFromCache_();
  return {
    count: users ? Object.keys(users).length : 0,
    syncedAt: settings.MASTER_CACHE_SYNCED_AT || '',
    hasCache: !!users
  };
}

function ensureMasterUserCache_() {
  var status = getMasterUserCacheStatus();
  if (status.hasCache) {
    return {
      success: true,
      hasCache: true,
      syncedNow: false,
      count: status.count,
      syncedAt: status.syncedAt
    };
  }
  var result = syncMasterUserCache_();
  return {
    success: true,
    hasCache: true,
    syncedNow: true,
    count: result.count,
    syncedAt: result.syncedAt
  };
}

function ensureMasterUserCache() {
  validateConfig_();
  return withScriptLock_(function() {
    return ensureMasterUserCache_();
  });
}

function syncMasterUserCache() {
  validateConfig_();
  return withScriptLock_(function() {
    var result = syncMasterUserCache_();
    return {
      success: true,
      count: result.count,
      syncedAt: result.syncedAt
    };
  });
}

function warmMasterUserCacheInBackground_() {
  try {
    if (getMasterUserCacheStatus().hasCache) return;
    syncMasterUserCache_();
  } catch (e) {
    Logger.log('[master-cache] warm failed: ' + e.message);
  }
}

function lookupMasterUser_(users, matchId) {
  return users[normalizeIdForMatch_(matchId)] || null;
}

function rankUserSearchMatch_(user, query, searchKey, qId) {
  if (!searchKey && !qId) return null;
  if (qId && user.matchId.indexOf(qId) >= 0) return 0;
  if (user.rawId && user.rawId.indexOf(query) >= 0) return 0;
  var nameKey = toHiraganaForSearch_(user.name);
  var kanaKey = toHiraganaForSearch_(user.kana);
  if (searchKey) {
    if (kanaKey.indexOf(searchKey) === 0 || nameKey.indexOf(searchKey) === 0) return 1;
    if (kanaKey.indexOf(searchKey) >= 0 || nameKey.indexOf(searchKey) >= 0) return 2;
  }
  if (query && user.name && user.name.indexOf(query) >= 0) return 2;
  return null;
}

function searchMasterUsers_(query, options) {
  var opts = options || {};
  var includeEnded = !!opts.includeEnded;
  var activeOnly = !!opts.activeOnly;
  var limit = Number(opts.limit) || 25;
  var users = loadMasterUsers_();
  var q = normalizeString_(query);
  var searchKey = toHiraganaForSearch_(q);
  var qId = normalizeIdForMatch_(q);
  if (!searchKey && !qId) return [];

  var ranked = [];
  Object.keys(users).forEach(function(key) {
    var user = users[key];
    if (activeOnly && user.category === APP.MASTER_CATEGORY.ENDED) return;
    if (!includeEnded && !activeOnly && user.category === APP.MASTER_CATEGORY.ENDED) return;
    var rank = rankUserSearchMatch_(user, q, searchKey, qId);
    if (rank == null) return;
    ranked.push({ user: user, rank: rank });
  });

  ranked.sort(function(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return (a.user.kana || a.user.name).localeCompare(b.user.kana || b.user.name, 'ja');
  });

  return ranked.slice(0, limit).map(function(item) {
    return item.user;
  });
}

function searchMasterUsers(query, includeEnded) {
  validateConfig_();
  return searchMasterUsers_(query, { includeEnded: !!includeEnded, limit: 25 });
}

function searchActiveMasterUsers(query) {
  validateConfig_();
  return searchMasterUsers_(query, { activeOnly: true, limit: 25 });
}
