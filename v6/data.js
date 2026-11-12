/* 톰토미 대시보드 v6 — 데이터 불러오기
 *
 * 저장소는 v5와 같은 Supabase 표(tomtomi_data)를 그대로 읽는다.
 * v6가 쓰는 것은 원가표(skuCost) 하나뿐이고, 올릴 때마다 새 판으로 추가만 한다(기존 줄을 고치거나 지우지 않음).
 * (그 밖의 파일 올리기, 수정은 당분간 v5 화면에서 한다.)
 */
(function (root) {
  'use strict';
  var SUPABASE_URL = 'https://ctyhisrbisqaescnpxbx.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eWhpc3JiaXNxYWVzY25weGJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNjU0NzIsImV4cCI6MjA5MTg0MTQ3Mn0.v4SuezDeg3n8PDkHID1UinvZTH1dGFmqSAmYqtD4R8c';
  var GSHEET_ID = '1yr_sgn3d6odRjF39hdRWadep2oPPc_9IkzK1Mm5N2lU'; // 기타마켓 구글 시트
  var PAGE = 1000;
  var SKIP = { slackConfig: 1 }; // 웹훅 주소는 화면에 필요 없으므로 읽지 않는다

  function loadSupabase() {
    var all = [];
    function page(offset) {
      var url = SUPABASE_URL + '/rest/v1/tomtomi_data?select=channel,date,data&order=channel,date&limit=' + PAGE + '&offset=' + offset;
      return fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } })
        .then(function (res) { if (!res.ok) throw new Error('데이터 서버 응답 오류 (HTTP ' + res.status + ')'); return res.json(); })
        .then(function (rows) {
          all = all.concat(rows || []);
          if (rows && rows.length === PAGE) return page(offset + PAGE);
          return all;
        });
    }
    return page(0).then(function (rows) {
      var raw = {};
      rows.forEach(function (r) {
        if (!r || SKIP[r.channel] || !Array.isArray(r.data)) return;
        (raw[r.channel] = raw[r.channel] || []).push.apply(raw[r.channel], r.data);
      });
      raw._rows = rows.length;
      return raw;
    });
  }

  // 기타마켓: 구글 시트(공개 조회)에서 읽는다. 실패하면 빈 목록으로 두고 화면에 알린다.
  function loadOther() {
    return new Promise(function (resolve) {
      var done = false;
      function finish(rows, ok) { if (done) return; done = true; resolve({ rows: rows, ok: ok }); }
      var timer = setTimeout(function () { finish([], false); }, 8000);
      root.google = root.google || {};
      root.google.visualization = root.google.visualization || {};
      root.google.visualization.Query = root.google.visualization.Query || {};
      root.google.visualization.Query.setResponse = function (resp) {
        clearTimeout(timer);
        try {
          if (!resp || !resp.table) return finish([], false);
          var cols = resp.table.cols.map(function (c) { return (c.label || '').trim(); });
          var iDate = cols.indexOf('날짜'), iMkt = cols.indexOf('채널'), iProd = cols.indexOf('상품명'), iCode = cols.indexOf('품번'), iQty = cols.indexOf('수량'), iAmt = cols.indexOf('매출액');
          if (iDate < 0 || iAmt < 0) return finish([], false);
          var out = [];
          resp.table.rows.forEach(function (row) {
            var c = row.c || [];
            function val(i) { return i >= 0 && c[i] ? c[i].v : ''; }
            var dv = c[iDate] ? (c[iDate].f || c[iDate].v || '') : '';
            var gm = String(dv).match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})/); // 구글 시트 날짜값: 월이 0부터 시작
            if (gm) dv = gm[1] + '-' + (+gm[2] + 1) + '-' + gm[3];
            var amt = TTCalc.num(val(iAmt));
            if (!dv || !amt) return;
            out.push({ d: String(dv), m: String(val(iMkt) || ''), product: String(val(iProd) || ''), code: String(val(iCode) || '').trim(), qty: TTCalc.num(val(iQty)), a: amt });
          });
          finish(out, true);
        } catch (e) { finish([], false); }
      };
      var s = document.createElement('script');
      s.src = 'https://docs.google.com/spreadsheets/d/' + GSHEET_ID + '/gviz/tq?tqx=out:json';
      s.onerror = function () { clearTimeout(timer); finish([], false); };
      document.head.appendChild(s);
    });
  }

  function load() {
    return Promise.all([loadSupabase(), loadOther()]).then(function (r) {
      var raw = r[0];
      raw.other = r[1].rows;
      raw._otherOk = r[1].ok;
      return raw;
    });
  }

  // 원가표 저장: channel=skuCost, date=판 번호(저장 시각). 같은 판 번호가 이미 있으면 실패하게 둔다(덮어쓰기 방지).
  function saveCost(ver) {
    return fetch(SUPABASE_URL + '/rest/v1/tomtomi_data', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify([{ channel: 'skuCost', date: ver.ver, data: [ver] }])
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error('저장 실패 (HTTP ' + res.status + ') ' + String(t).slice(0, 120)); });
      return true;
    });
  }

  root.TTData = { load: load, saveCost: saveCost };
})(window);
