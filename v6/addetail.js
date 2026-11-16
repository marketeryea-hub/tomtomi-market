/* 톰토미 대시보드 v6 — 광고 상세 저장 (캠페인, 광고그룹, 소재/상품 단위)
 *
 * 왜 따로 있나: v5 파서는 광고 파일의 상세 줄을 읽기는 했지만 클라우드에는 일별 합계(naverAd, coupAd)만 저장했다.
 * 그래서 2026-04-16부터 상세가 사라졌다. 여기서는 같은 파일에서 상세 줄을 칸 이름으로 읽어
 * naverAdDetail, coupAdDetail 채널에 (채널, 날짜) 한 줄씩 저장한다. 일별 합계 계산(v5 파서)은 건드리지 않는다.
 */
(function (root) {
  'use strict';
  function num(v) {
    if (v === null || v === undefined || v === '' || v === '-') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var n = parseFloat(String(v).replace(/[,%원\s"]/g, ''));
    return isFinite(n) ? n : 0;
  }
  function day(v) {
    if (v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
    var s = String(v === null || v === undefined ? '' : v).trim(), m;
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})(\.0+)?$/))) return m[1] + '-' + m[2] + '-' + m[3]; // 쿠팡: 20261114
    if ((m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/))) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    return null;
  }
  function splitCSV(line) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === ',' && !q) { out.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    out.push(cur.trim());
    return out;
  }
  // 칸 이름으로 위치 찾기 (정확히 같은 이름 우선, 없으면 포함하는 이름)
  function finder(hdr) {
    return function (names, def) {
      var i, j;
      for (j = 0; j < names.length; j++) { i = hdr.indexOf(names[j]); if (i >= 0) return i; }
      for (j = 0; j < names.length; j++) for (i = 0; i < hdr.length; i++) if (hdr[i].indexOf(names[j]) >= 0) return i;
      return def === undefined ? -1 : def;
    };
  }
  function nonzero(o, keys) { return keys.some(function (k) { return o[k]; }); }
  // 파일에 나온 날짜는 상세를 통째로 새로 쓴다 (v5의 덮어쓰기 규칙과 같음)
  function apply(DB, ch, rows, touched) {
    var days = {};
    rows.forEach(function (r) { days[r.d] = 1; });
    DB[ch] = (DB[ch] || []).filter(function (e) { return !days[e.d]; }).concat(rows);
    Object.keys(days).forEach(function (d) { touched[ch + '|' + d] = 1; });
    return Object.keys(days).length;
  }

  // 네이버 SA 보고서 CSV (1줄: 보고서 이름, 2줄: 칸 이름)
  function naver(text, DB, touched) {
    var lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/), hi = -1, k;
    for (k = 0; k < Math.min(lines.length, 5); k++) if (/캠페인/.test(lines[k]) && /(일별|날짜)/.test(lines[k])) { hi = k; break; }
    if (hi < 0) return 0;
    var hdr = splitCSV(lines[hi]), f = finder(hdr);
    var c = { type: f(['캠페인유형']), camp: f(['캠페인']), group: f(['광고그룹']), ad: f(['소재']), kw: f(['키워드']), d: f(['일별', '날짜']),
      imp: f(['노출수']), clicks: f(['클릭수']), cost: f(['총비용']), conv: f(['총 전환수', '전환수']), rev: f(['총 전환매출액(원)', '전환매출액']) };
    if (c.d < 0 || c.cost < 0) return 0;
    var rows = [];
    for (k = hi + 1; k < lines.length; k++) {
      var r = splitCSV(lines[k]); if (r.length < 3) continue;
      var d = day(r[c.d]); if (!d) continue;
      var o = { d: d, type: c.type >= 0 ? r[c.type] : '', camp: c.camp >= 0 ? r[c.camp] : '', group: c.group >= 0 ? r[c.group] : '', ad: c.ad >= 0 ? r[c.ad] : '', imp: num(r[c.imp]), clicks: num(r[c.clicks]), cost: num(r[c.cost]), conv: num(r[c.conv]), rev: num(r[c.rev]) };
      if (c.kw >= 0) o.kw = r[c.kw];
      if (o.ad === '-') o.ad = '';
      if (nonzero(o, ['imp', 'clicks', 'cost', 'conv', 'rev'])) rows.push(o);
    }
    return rows.length ? apply(DB, 'naverAdDetail', rows, touched) : 0;
  }

  // 쿠팡 광고 맞춤 보고서 (custom_report.xlsx)
  function coupang(wb, DB, touched) {
    var X = root.XLSX, ws = wb.Sheets[wb.SheetNames[0]];
    var all = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    if (!all.length) return 0;
    var hdr = all[0].map(function (v) { return String(v || '').trim(); }), f = finder(hdr);
    var c = { d: f(['날짜'], 0), camp: f(['캠페인 이름', '캠페인명', '캠페인'], 1), goal: f(['광고 목표']), group: f(['광고그룹'], 3), prod: f(['광고집행 상품명'], 4), conv: f(['광고 전환 매출 발생 상품명'], 5),
      optId: f(['광고집행 옵션ID']), convOptId: f(['광고전환매출발생 옵션ID', '광고 전환 매출 발생 옵션ID']),
      imp: f(['노출수'], 7), clicks: f(['클릭수'], 8), cost: f(['광고비'], 10), orders: f(['총 주문수 (1일)', '총 주문수'], 11), rev: f(['총 전환 매출액 (1일)', '총 전환 매출액', '전환매출액'], 12), qty: f(['총 판매 수량 (1일)', '총 판매 수량'], 14) };
    var rows = [];
    all.slice(1).forEach(function (r) {
      var d = day(r[c.d]); if (!d) return;
      var o = { d: d, camp: String(r[c.camp] || ''), goal: c.goal >= 0 ? String(r[c.goal] || '') : '', group: String(r[c.group] || ''), prod: String(r[c.prod] || ''), convProd: String(r[c.conv] || ''),
        imp: num(r[c.imp]), clicks: num(r[c.clicks]), cost: num(r[c.cost]), orders: num(r[c.orders]), rev: num(r[c.rev]), qty: num(r[c.qty]) };
      if (c.optId >= 0) o.optId = String(r[c.optId] || '');
      if (c.convOptId >= 0) o.convOptId = String(r[c.convOptId] || '');
      // 광고비 0이어도 전환이 있는 줄(다른 상품 광고로 팔린 경우)은 남긴다
      if (nonzero(o, ['imp', 'clicks', 'cost', 'orders', 'rev', 'qty'])) rows.push(o);
    });
    return rows.length ? apply(DB, 'coupAdDetail', rows, touched) : 0;
  }

  // 광고그룹이나 소재 칸이 있는 보고서인지 (캠페인 단위 보고서와 구분)
  function isDetailCsv(text) {
    var lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).slice(0, 5);
    return lines.some(function (l) { return /캠페인/.test(l) && (/광고그룹/.test(l) || /소재/.test(l)); });
  }
  var api = { naver: naver, coupang: coupang, isDetailCsv: isDetailCsv, _day: day, _num: num };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TTAdDetail = api;
})(typeof window !== 'undefined' ? window : globalThis);
