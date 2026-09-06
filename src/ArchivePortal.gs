function doPost(e) {
  return buildArchivePortalResponse_(e, function(action, token, year) {
    requireArchiveAdmin_(token);
    if (action === 'create') {
      var created = createYearArchive(token, { year: year });
      return { title: '請求確定', message: created.message || '年次アーカイブを作成しました。' };
    }
    var data = getArchiveAdminData(token);
    return archivePortalStatus_('請求確定', data.active, (data.history || []).concat(data.active ? [data.active] : []), data.archiveTargets || []);
  });
}

