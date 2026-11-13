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
      var raw = {}, meta = {};
      rows.forEach(function (r) {
        if (!r || SKIP[r.channel] || !Array.isArray(r.data)) return;
        (raw[r.channel] = raw[r.channel] || []).push.apply(raw[r.channel], r.data);
        // 저장 구조 점검용: 한 줄(채널, 날짜)에 다른 날짜 데이터가 섞여 있으면 odd로 센다
        var m = meta[r.channel] || (meta[r.channel] = { rows: 0, odd: 0 });
        m.rows++;
        if (r.data.some(function (e) { return e && (e.d || e.date) !== r.date; })) m.odd++;
      });
      raw._meta = meta;
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

  // 파일 올리기 저장: (채널, 날짜) 한 줄씩 덮어쓰기(upsert). v5의 클라우드 동기화와 같은 방식
  function saveRows(rows) {
    var i = 0, CH = 50;
    function next() {
      if (i >= rows.length) return Promise.resolve(rows.length);
      var part = rows.slice(i, i + CH); i += CH;
      return fetch(SUPABASE_URL + '/rest/v1/tomtomi_data?on_conflict=channel,date', {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(part)
      }).then(function (res) {
        if (!res.ok) return res.text().then(function (t) { throw new Error('저장 실패 (HTTP ' + res.status + ', ' + (i - CH) + '번째 줄부터) ' + String(t).slice(0, 120)); });
        return next();
      });
    }
    return next();
  }

  // 슬랙 웹훅 주소: v5와 같은 곳(브라우저 저장 → 없으면 클라우드 slackConfig)에서 읽는다. 화면에는 보여주지 않는다
  function loadWebhook() {
    var local = ''; try { local = localStorage.getItem('tt_slack_webhook') || ''; } catch (e) { /* 무시 */ }
    if (local) return Promise.resolve(local);
    var url = SUPABASE_URL + '/rest/v1/tomtomi_data?select=data&channel=eq.slackConfig';
    return fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } })
      .then(function (res) { return res.ok ? res.json() : []; })
      .then(function (rows) { var u = ''; (rows || []).forEach(function (r) { (r.data || []).forEach(function (x) { if (x && x.url) u = x.url; }); }); return u; })
      .catch(function () { return ''; });
  }
  // 온라인 대시보드 구글 시트: SNS 팔로워(시트1), 경쟁사 검색량(competitor) — v5와 같은 시트
  var ONLINE_GSHEET_ID = '1vuyz2V0I6KgJ0vrpH2cwJ_5XzOcqj12opLRGM4irtu0';
  function csvLine(r) { var out = [], cur = '', q = false; for (var i = 0; i < r.length; i++) { var ch = r[i]; if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; }
  function sheetCsv(sheet) {
    return fetch('https://docs.google.com/spreadsheets/d/' + ONLINE_GSHEET_ID + '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(sheet))
      .then(function (res) { return res.text(); }).then(function (t) { return t.trim().split('\n').map(csvLine); });
  }
  function ymd(v) { var m = String(v || '').match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/); return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : null; }
  function numv(v) { var n = parseFloat(String(v || '').replace(/,/g, '')); return isNaN(n) ? 0 : n; }
  function loadOnline() {
    var out = { crm: null, competitor: null };
    var a = sheetCsv('시트1').then(function (rows) {
      if (rows.length < 2) return;
      var hd = rows[0].map(function (h) { return String(h || '').toLowerCase().trim(); });
      function ix(names, def) { var i = hd.findIndex(function (h) { return names.indexOf(h) >= 0; }); return i >= 0 ? i : def; }
      var ci = { d: ix(['date'], 0), naver: ix(['naver', '알림받기', 'smartstore'], 1), insta: ix(['insta', 'instagram'], 2), tiktok: ix(['tiktok', '틱톡'], 3), threads: ix(['threads', '쓰레드'], 4) }, crm = { naver: [], insta: [], tiktok: [], threads: [] };
      rows.slice(1).forEach(function (r) { var d = ymd(r[ci.d]); if (!d) return; ['naver', 'insta', 'tiktok', 'threads'].forEach(function (k) { var v = parseInt(String(r[ci[k]] || '').replace(/,/g, ''), 10); if (v > 0) crm[k].push({ date: d, val: v }); }); });
      Object.keys(crm).forEach(function (k) { crm[k].sort(function (x, y) { return x.date < y.date ? -1 : 1; }); });
      out.crm = crm;
    }).catch(function () { /* 못 읽으면 SNS 줄을 뺀다 */ });
    var b = sheetCsv('competitor').then(function (rows) {
      if (rows.length < 2) return;
      var hd = rows[0].map(function (h) { return String(h || '').toLowerCase().trim(); });
      function fi(f, def) { var i = hd.findIndex(f); return i >= 0 ? i : def; }
      var ci = { m: fi(function (h) { return h.indexOf('month') >= 0 || h.indexOf('월') >= 0; }, 0), b: fi(function (h) { return h.indexOf('brand') >= 0 || h.indexOf('브랜드') >= 0; }, 1), mo: fi(function (h) { return h === 'mo' || h === '모바일'; }, 2), pc: fi(function (h) { return h === 'pc'; }, 3), t: fi(function (h) { return h.indexOf('합계') >= 0 || h === 'total'; }, 4) }, bs = {};
      rows.slice(1).forEach(function (r) {
        var mm = String(r[ci.m] || '').trim().match(/^(\d{4})[-./](\d{1,2})/), brand = String(r[ci.b] || '').trim(); if (!mm || !brand) return;
        var month = mm[1] + '-' + ('0' + mm[2]).slice(-2), tot = numv(r[ci.t]) || numv(r[ci.mo]) + numv(r[ci.pc]);
        var o = bs[brand] || (bs[brand] = { dates: [], vals: [] }); o.dates.push(month); o.vals.push(tot);
      });
      Object.keys(bs).forEach(function (k) { var z = bs[k].dates.map(function (d, i) { return { d: d, v: bs[k].vals[i] }; }).sort(function (x, y) { return x.d < y.d ? -1 : 1; }); bs[k].dates = z.map(function (x) { return x.d; }); bs[k].vals = z.map(function (x) { return x.v; }); });
      out.competitor = bs;
    }).catch(function () { /* 못 읽으면 경쟁사 줄을 뺀다 */ });
    return Promise.all([a, b]).then(function () { return out; });
  }
  // 슬랙 보내기: v5와 같은 방식(본문만 JSON 문자열로, 브라우저 사전 확인 없이)
  function sendSlack(webhook, text) {
    return fetch(webhook, { method: 'POST', body: JSON.stringify({ text: text }) }).then(function (res) {
      return res.text().then(function (t) { if (!res.ok) throw new Error('HTTP ' + res.status + (t ? ' (' + t + ')' : '')); return true; });
    });
  }

  root.TTData = { load: load, saveCost: saveCost, saveRows: saveRows, loadWebhook: loadWebhook, loadOnline: loadOnline, sendSlack: sendSlack };
})(window);
