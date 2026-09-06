function buildArchivePortalResponse_(e, handler) {
  var params = e && e.parameter ? e.parameter : {};
  var action = String(params.portalAction || '').trim();
  var title = 'アーカイブ管理';
  try {
    if (String(params.portal || '') !== 'yasuragi-archive') {
      throw new Error('この入口からは実行できません。');
    }
    if (action !== 'status' && action !== 'create') {
      throw new Error('操作内容が不正です。');
    }
    var token = String(params.token || '').trim();
    if (!token) throw new Error('ログイン情報がありません。権限管理へ戻ってください。');
    var year = String(params.year || '').trim();
    if (action === 'create' && !/^\d{4}$/.test(year)) {
      throw new Error('対象年を4桁で指定してください。');
    }
    var currentYear = Number(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy'));
    if (action === 'create' && Number(year) >= currentYear) {
      throw new Error('当年と未来年はアーカイブできません。年が終了してから実行してください。');
    }
    var result = handler(action, token, year, String(params.section || '').trim()) || {};
    title = result.title || title;
    return archivePortalHtml_(title, result, false);
  } catch (error) {
    return archivePortalHtml_(title, {
      message: error && error.message ? error.message : String(error || 'エラーが発生しました。')
    }, true);
  }
}

function archivePortalStatus_(title, active, settings, targets, candidateYears) {
  active = active || null;
  settings = settings || [];
  var activeLabel = active
    ? String(active.label || active.displayName || '').trim()
    : '';
  var startDate = active ? archivePortalFormatDate_(active.startDate) : '';
  var endDate = active ? archivePortalFormatDate_(active.endDate) : '';
  var history = settings.filter(function(item) {
    if (!item) return false;
    if (active && item === active) return false;
    return item.active === false || item.active === '' || item.active === 0;
  }).map(function(item) {
    return String(item.label || item.displayName || '').trim();
  }).filter(Boolean);
  var details = [
    { label: '現在の対象年', value: activeLabel || '使用中設定なし' },
    { label: '対象期間', value: startDate && endDate ? startDate + ' 〜 ' + endDate : '—' },
    { label: '対象シート', value: (targets || []).join('、') || '—' },
    { label: '作成済み', value: history.length ? history.join('、') : 'なし' }
  ];
  if (candidateYears && candidateYears.length) {
    details.push({
      label: '実行可能年',
      value: candidateYears.map(function(item) {
        return String((item && (item.year || item.label || item.value)) || item || '');
      }).filter(Boolean).join('、')
    });
  }
  return { title: title, message: '現在のアーカイブ設定を確認しました。', details: details };
}

function archivePortalFormatDate_(value) {
  if (value == null || value === '') return '';
  if (Object.prototype.toString.call(value) === '[object Date]') return isNaN(value.getTime()) ? '' : Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd');
  var text = String(value).trim();
  var isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  var slashMatch = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slashMatch) return slashMatch[1] + '-' + ('0' + slashMatch[2]).slice(-2) + '-' + ('0' + slashMatch[3]).slice(-2);
  return text;
}

function archivePortalHtml_(title, result, isError) {
  var escape = function(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var rows = (result.details || []).map(function(item) {
    return '<div class="row"><span>' + escape(item.label) + '</span><strong>' + escape(item.value) + '</strong></div>';
  }).join('');
  var html = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + escape(title) + '</title><style>'
    + 'body{margin:0;background:#f5f2eb;color:#273129;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}'
    + 'main{max-width:680px;margin:0 auto;padding:40px 20px}.card{background:#fff;border:1px solid #ded8cc;border-radius:18px;padding:28px;box-shadow:0 12px 32px rgba(39,49,41,.08)}'
    + 'h1{margin:0 0 8px;font-size:24px}.message{margin:18px 0;padding:14px 16px;border-radius:10px;background:' + (isError ? '#fff0ee;color:#9b2c21' : '#edf5ed;color:#315b3a') + '}'
    + '.row{display:grid;grid-template-columns:130px 1fr;gap:14px;padding:12px 0;border-bottom:1px solid #eee9df}.row span{color:#6d746f}.row strong{font-weight:600;overflow-wrap:anywhere}'
    + 'button{margin-top:22px;border:1px solid #bcb5a8;background:#fff;border-radius:10px;padding:10px 18px;font-size:15px;cursor:pointer}@media(max-width:560px){.row{grid-template-columns:1fr;gap:4px}}'
    + '</style></head><body><main><section class="card"><h1>' + escape(title) + '</h1><div class="message">' + escape(result.message || '') + '</div>'
    + rows + '<button type="button" onclick="window.close()">閉じる</button></section></main></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle(title + '｜アーカイブ管理');
}
