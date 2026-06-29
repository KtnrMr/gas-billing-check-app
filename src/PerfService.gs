/**
 * 処理時間ログ。Script Property DEBUG_PERFORMANCE=1 のときだけ Logger に出力する。
 */
function isDebugPerformanceEnabled_() {
  return getScriptProperty_('DEBUG_PERFORMANCE') === '1';
}

function startPerfLog_(name, context) {
  if (!isDebugPerformanceEnabled_()) {
    return {
      mark: function() {},
      done: function() { return null; }
    };
  }

  var startedAt = Date.now();
  var lastAt = startedAt;
  var marks = [];
  var label = normalizeString_(name) || 'perf';

  return {
    mark: function(step) {
      var now = Date.now();
      marks.push({
        step: normalizeString_(step),
        ms: now - lastAt,
        totalMs: now - startedAt
      });
      lastAt = now;
    },
    done: function() {
      var totalMs = Date.now() - startedAt;
      var lines = ['[perf] ' + label + ' total=' + totalMs + 'ms'];
      if (context && Object.keys(context).length) {
        lines.push('[perf] context ' + toJson_(context));
      }
      marks.forEach(function(mark) {
        lines.push(
          '[perf]   ' + mark.step + ': ' + mark.ms + 'ms (cum ' + mark.totalMs + 'ms)'
        );
      });
      Logger.log(lines.join('\n'));
      return {
        name: label,
        totalMs: totalMs,
        marks: marks
      };
    }
  };
}

function runWithPerfLog_(name, context, callback) {
  var perf = startPerfLog_(name, context);
  try {
    return callback(perf);
  } finally {
    perf.done();
  }
}
