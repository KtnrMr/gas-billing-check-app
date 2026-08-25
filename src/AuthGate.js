// 各アプリ共通のログイン判定。再適用するときは PERM_GATE_ENABLED を true にする。
const PERM_GATE_ENABLED = false;
const PERM_STORE_ID = '1yzGumxF-QNXP2W13s2uyIsL1M55eB-QOpVPu0VEt8CM';
const PERM_PEPPER_PROPERTY = 'AUTH_PEPPER';
const PERM_IDENTITY_SECRET_PROPERTY = 'PERM_IDENTITY_SECRET';
const PERM_SECURITY_ALERT_EMAIL_PROPERTY = 'SECURITY_ALERT_EMAIL';
const PERM_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const PERM_LOGIN_MAX_FAILURES = 5;
const PERM_LOGIN_LOCK_MS = 15 * 60 * 1000;
const PERM_SHEET = Object.freeze({
  STAFF: '職員',
  GOOGLE: 'Googleアカウント',
  WORKPLACE: '職場アカウント',
  SESSION: 'セッション',
  APP_ACCESS: 'アプリ権限',
  LOG: 'ログ',
  LOGIN_ATTEMPT: 'ログイン制限'
});

function permStore_() {
  return SpreadsheetApp.openById(PERM_STORE_ID);
}

function permSheet_(name) {
  const store = permStore_();
  let sheet = store.getSheetByName(name);
  if (!sheet && name === PERM_SHEET.LOGIN_ATTEMPT) {
    sheet = store.insertSheet(name);
    sheet.getRange(1, 1, 1, 6).setValues([['キー', '職員ID', 'メール', '失敗回数', '停止期限', '更新日時']]);
    sheet.setFrozenRows(1);
  }
  if (!sheet) throw new Error(name + 'シートが見つかりません。');
  if (name === PERM_SHEET.SESSION && String(sheet.getRange(1, 1).getValue() || '').trim() === 'トークン') {
    const rowCount = sheet.getLastRow();
    if (rowCount > 1) sheet.getRange(2, 1, rowCount - 1, sheet.getLastColumn()).clearContent();
    sheet.getRange(1, 1).setValue('トークンハッシュ');
  }
  return sheet;
}

function permAudit_(loginId, action, detail, email) {
  try {
    permSheet_(PERM_SHEET.LOG).appendRow([Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'), permNormId_(loginId), action || '', detail || '', permNormEmail_(email)]);
    if (action === 'ログイン一時停止') permSendSecurityAlert_(loginId, action, detail, email);
  } catch (error) {}
}

function permSendSecurityAlert_(loginId, action, detail, email) {
  const recipient = String(PropertiesService.getScriptProperties().getProperty(PERM_SECURITY_ALERT_EMAIL_PROPERTY) || '').trim();
  if (!recipient) return;
  const stamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  try {
    MailApp.sendEmail({
      to: recipient,
      subject: '【やすら樹アプリ】' + String(action || 'セキュリティ通知'),
      body: [
        'やすら樹アプリでログインが一時停止されました。',
        '',
        '日時: ' + stamp,
        '職員ID: ' + permNormId_(loginId),
        'Googleアカウント: ' + permNormEmail_(email),
        '内容: ' + String(detail || ''),
        '',
        '心当たりがない場合は、権限管理アプリで対象職員を緊急停止してください。'
      ].join('\n'),
      name: 'やすら樹アプリ'
    });
    permSheet_(PERM_SHEET.LOG).appendRow([stamp, permNormId_(loginId), 'セキュリティ通知送信', action || '', permNormEmail_(email)]);
  } catch (error) {
    permSheet_(PERM_SHEET.LOG).appendRow([stamp, permNormId_(loginId), 'セキュリティ通知失敗', action + ' / ' + String(error && error.message || error), permNormEmail_(email)]);
  }
}

function permFindAttempt_(loginId, email) {
  const key = permNormId_(loginId) + '|' + permNormEmail_(email);
  const sheet = permSheet_(PERM_SHEET.LOGIN_ATTEMPT);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) if (String(values[i][0] || '') === key) return { row: i + 1, key: key, count: Number(values[i][3] || 0), lockUntil: Number(values[i][4] || 0), updatedAt: Number(values[i][5] || 0) };
  return { row: 0, key: key, count: 0, lockUntil: 0, updatedAt: 0 };
}

function permAssertLoginAllowed_(loginId, email) {
  const item = permFindAttempt_(loginId, email);
  if (item.lockUntil > Date.now()) {
    const minutes = Math.max(1, Math.ceil((item.lockUntil - Date.now()) / 60000));
    throw new Error('ログインに複数回失敗したため、あと約' + minutes + '分待ってから再度お試しください。');
  }
}

function permRecordLoginFailure_(loginId, email, reason) {
  const sheet = permSheet_(PERM_SHEET.LOGIN_ATTEMPT);
  const item = permFindAttempt_(loginId, email);
  const now = Date.now();
  const count = (item.updatedAt && now - item.updatedAt > PERM_LOGIN_LOCK_MS ? 0 : item.count) + 1;
  const lockUntil = count >= PERM_LOGIN_MAX_FAILURES ? now + PERM_LOGIN_LOCK_MS : 0;
  const row = [item.key, permNormId_(loginId), permNormEmail_(email), count, lockUntil, now];
  if (item.row) sheet.getRange(item.row, 1, 1, row.length).setValues([row]); else sheet.appendRow(row);
  permAudit_(loginId, lockUntil ? 'ログイン一時停止' : 'ログイン失敗', String(reason || '') + ' / ' + count + '回', email);
}

function permClearLoginFailures_(loginId, email) {
  const item = permFindAttempt_(loginId, email);
  if (item.row) permSheet_(PERM_SHEET.LOGIN_ATTEMPT).deleteRow(item.row);
}

function permIdentitySecret_() {
  return String(PropertiesService.getScriptProperties().getProperty(PERM_IDENTITY_SECRET_PROPERTY) || '');
}

function permHmac_(value) {
  const secret = permIdentitySecret_();
  if (!secret) return '';
  const bytes = Utilities.computeHmacSha256Signature(String(value || ''), secret);
  return bytes.map(function(byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function permParseIdentity_(identity) {
  if (!identity) return '';
  if (typeof identity === 'string') {
    try {
      identity = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(identity)).getDataAsString());
    } catch (error) {
      return '';
    }
  }
  if (typeof identity !== 'object') return '';
  const email = permNormEmail_(identity.email);
  const ts = Number(identity.ts || 0);
  const sig = String(identity.sig || '');
  if (!email || !ts || !sig) return '';
  if (permHmac_(email + ':' + ts) !== sig) return '';
  return email;
}

function permEmail_(identity) {
  const fromIdentity = permParseIdentity_(identity);
  if (fromIdentity) return fromIdentity;
  return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
}

function permRequireEmail_(identity) {
  const email = permEmail_(identity);
  if (!email) throw new Error('Googleアカウントを取得できません。個人アカウントの場合は、確認画面の許可を行ってから開き直してください。');
  return email;
}

function permNormId_(value) {
  return String(value || '').trim();
}

function permNormEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function permRowToStaff_(row) {
  return {
    loginId: permNormId_(row[0]),
    name: String(row[1] || '').trim(),
    role: String(row[2] || '').trim(),
    status: String(row[3] || '').trim(),
    passwordHash: String(row[4] || '').trim(),
    salt: String(row[5] || '').trim(),
    mustChange: String(row[6] || '').trim() === 'はい' || String(row[6] || '').trim() === '再設定'
  };
}

function permListStaff_() {
  const values = permSheet_(PERM_SHEET.STAFF).getDataRange().getValues();
  if (values.length <= 1) return [];
  return values.slice(1).map(permRowToStaff_).filter(function(staff) {
    return !!staff.loginId;
  });
}

function permGetStaff_(loginId) {
  const id = permNormId_(loginId);
  const list = permListStaff_();
  for (let i = 0; i < list.length; i++) {
    if (list[i].loginId === id) return list[i];
  }
  return null;
}

function permIsWorkplace_(email) {
  const normalized = permNormEmail_(email);
  const values = permSheet_(PERM_SHEET.WORKPLACE).getDataRange().getValues();
  if (values.length <= 1) return false;
  return values.slice(1).some(function(row) {
    return permNormEmail_(row[0]) === normalized;
  });
}

function permStaffForEmail_(email) {
  const normalized = permNormEmail_(email);
  const values = permSheet_(PERM_SHEET.GOOGLE).getDataRange().getValues();
  if (values.length <= 1) return [];
  const ids = {};
  values.slice(1).forEach(function(row) {
    if (permNormEmail_(row[1]) === normalized) ids[permNormId_(row[0])] = true;
  });
  return permListStaff_().filter(function(staff) {
    return staff.status === '有効' && ids[staff.loginId];
  });
}

function permIsBound_(loginId, email) {
  const id = permNormId_(loginId);
  const normalized = permNormEmail_(email);
  const values = permSheet_(PERM_SHEET.GOOGLE).getDataRange().getValues();
  if (values.length <= 1) return false;
  return values.slice(1).some(function(row) {
    return permNormId_(row[0]) === id && permNormEmail_(row[1]) === normalized;
  });
}

function permHasAppAccess_(loginId) {
  const id = permNormId_(loginId);
  const appId = ScriptApp.getScriptId();
  const values = permSheet_(PERM_SHEET.APP_ACCESS).getDataRange().getValues();
  if (values.length <= 1) return false;
  return values.slice(1).some(function(row) {
    return permNormId_(row[0]) === id &&
      String(row[1] || '').trim() === appId &&
      String(row[2] || '').trim() === 'はい';
  });
}

function permHash_(password, salt) {
  const pepper = String(PropertiesService.getScriptProperties().getProperty(PERM_PEPPER_PROPERTY) || '');
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    pepper + ':' + salt + ':' + password,
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function permHashSessionToken_(token) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(token || ''),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function permVerifyPassword_(password, salt, expectedHash) {
  const actual = permHash_(password, salt);
  if (actual.length !== String(expectedHash || '').length) return false;
  let different = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual.charAt(i) !== expectedHash.charAt(i)) different = 1;
  }
  return different === 0;
}

function permHasPassword_(staff) {
  return !!(staff && staff.passwordHash && staff.salt);
}

function permNeedsSetup_(staff) {
  return !permHasPassword_(staff) || !!(staff && staff.mustChange);
}

function permCreateSession_(staff, email) {
  const token = Utilities.getUuid();
  permSheet_(PERM_SHEET.SESSION).appendRow([
    permHashSessionToken_(token),
    staff.loginId,
    email,
    staff.role,
    Date.now() + PERM_SESSION_TTL_MS,
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')
  ]);
  return token;
}

function permGetSession_(token) {
  const value = String(token || '').trim();
  if (!value) return null;
  const tokenHash = permHashSessionToken_(value);
  const values = permSheet_(PERM_SHEET.SESSION).getDataRange().getValues();
  const now = Date.now();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() !== tokenHash) continue;
    if (Number(values[i][4] || 0) <= now) return null;
    return {
      token: value,
      loginId: permNormId_(values[i][1]),
      email: permNormEmail_(values[i][2]),
      role: String(values[i][3] || '').trim()
    };
  }
  return null;
}

function permPublicUser_(staff, email) {
  return {
    loginId: staff.loginId,
    name: staff.name,
    role: staff.role,
    googleEmail: email || ''
  };
}

function getPermissionContext(identity) {
  const email = permEmail_(identity);
  const workplace = email ? permIsWorkplace_(email) : false;
  const candidates = email ? permStaffForEmail_(email) : [];
  return {
    googleEmail: email,
    isWorkplace: workplace,
    bound: candidates.length > 0,
    candidates: candidates.map(function(staff) {
      return {
        loginId: staff.loginId,
        name: staff.name,
        role: staff.role,
        canUseApp: permHasAppAccess_(staff.loginId),
        needsPasswordSetup: permNeedsSetup_(staff)
      };
    })
  };
}

function permissionLogin(loginId, password, identity) {
  const email = permRequireEmail_(identity);
  const id = permNormId_(loginId);
  const pass = String(password || '');
  if (!id) throw new Error('職員IDを入力してください。');
  permAssertLoginAllowed_(id, email);

  const staff = permGetStaff_(id);
  if (!staff || staff.status !== '有効') {
    permRecordLoginFailure_(id, email, '職員IDまたは状態');
    throw new Error('職員IDまたはパスワードが正しくありません。');
  }
  if (!permIsBound_(id, email)) {
    permRecordLoginFailure_(id, email, 'Google紐付け');
    throw new Error('このGoogleアカウントでは、その職員IDではログインできません。');
  }
  if (permNeedsSetup_(staff)) {
    throw new Error('まだパスワードがありません。権限管理アプリの新規登録から設定してください。');
  }
  if (!pass) throw new Error('パスワードを入力してください。');
  const pepper = String(PropertiesService.getScriptProperties().getProperty(PERM_PEPPER_PROPERTY) || '');
  if (!pepper) {
    throw new Error('ログイン設定が完了していません。管理者に連絡してください。');
  }
  if (!permVerifyPassword_(pass, staff.salt, staff.passwordHash)) {
    permRecordLoginFailure_(id, email, 'パスワード');
    throw new Error('職員IDまたはパスワードが正しくありません。');
  }
  if (!permHasAppAccess_(staff.loginId)) {
    permAudit_(id, 'ログイン拒否', 'アプリ権限なし', email);
    throw new Error('このアプリを使う権限がありません。管理者に連絡してください。');
  }
  permClearLoginFailures_(id, email);
  permAudit_(id, 'ログイン成功', ScriptApp.getScriptId(), email);
  return {
    success: true,
    token: permCreateSession_(staff, email),
    expiresAt: Date.now() + PERM_SESSION_TTL_MS,
    user: permPublicUser_(staff, email)
  };
}

function permissionVerifySession(token) {
  const session = permGetSession_(token);
  if (!session) return { valid: false };
  const staff = permGetStaff_(session.loginId);
  if (!staff || staff.status !== '有効' || !permHasAppAccess_(staff.loginId)) {
    return { valid: false };
  }
  return { valid: true, user: permPublicUser_(staff, session.email) };
}

function permissionLogout(token) {
  const value = String(token || '').trim();
  if (!value) return { success: true };
  const tokenHash = permHashSessionToken_(value);
  const current = permGetSession_(value);
  const sheet = permSheet_(PERM_SHEET.SESSION);
  const values = sheet.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0] || '').trim() === tokenHash) sheet.deleteRow(i + 1);
  }
  if (current) permAudit_(current.loginId, 'ログアウト', ScriptApp.getScriptId(), current.email);
  return { success: true };
}

function requireArchiveAdmin_(token) {
  if (!PERM_GATE_ENABLED) return { loginId: '', email: '', role: '管理者' };
  const session = requirePermissionAccess_(token);
  const staff = permGetStaff_(session.loginId);
  if (!staff || staff.role !== '管理者') {
    throw new Error('アーカイブは管理者だけが使えます。');
  }
  return session;
}

function requirePermissionAccess_(token) {
  if (!PERM_GATE_ENABLED) return { loginId: '', email: '', role: '' };
  const session = permGetSession_(token);
  if (!session) throw new Error('ログインの有効期限が切れました。再度ログインしてください。');
  const staff = permGetStaff_(session.loginId);
  if (!staff || staff.status !== '有効') throw new Error('このIDは利用できません。');
  if (!permHasAppAccess_(staff.loginId)) {
    throw new Error('このアプリを使う権限がありません。管理者に連絡してください。');
  }
  return session;
}
