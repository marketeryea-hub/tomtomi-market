/* 톰토미 대시보드 v6 — 계산 모듈
 *
 * 화면과 분리된 순수 계산만 둔다. 같은 입력이면 항상 같은 결과가 나오고,
 * 브라우저 없이도(node) 검증할 수 있다.
 *
 * 숫자 정의 (v6 전체 공통)
 *  - 네이버 순매출 = 총 판매금액 - 환불. 환불은 환불이 처리된 날짜에 잡힌다.
 *  - 쿠팡 입고 = B2B 납품 공급가액. 쿠팡 광고 전환매출은 실매출이 아니다(참고 숫자).
 *  - 실매출 = 네이버 순매출 + 쿠팡 입고 + 기타마켓
 *  - 스토어 광고비 = 네이버SA + 메타 + 애드부스트
 *  - 스토어 ROAS = 네이버 순매출 / 스토어 광고비
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TTCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function num(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var n = parseFloat(String(v).replace(/,/g, '').replace(/%/g, ''));
    return isNaN(n) ? 0 : n;
  }

  // '2026-3-8', '2026.03.08', '2026/03/08 10:00' → '2026-03-08'. 날짜가 아니면 ''.
  function normDate(v) {
    if (!v) return '';
    var m = String(v).trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (!m) return '';
    var mo = ('0' + m[2]).slice(-2), da = ('0' + m[3]).slice(-2);
    if (+mo < 1 || +mo > 12 || +da < 1 || +da > 31) return '';
    return m[1] + '-' + mo + '-' + da;
  }

  function toDate(ds) { var p = ds.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtDate(dt) {
    return dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2);
  }
  function addDays(ds, n) { var d = toDate(ds); d.setDate(d.getDate() + n); return fmtDate(d); }
  function dayDiff(a, b) { return Math.round((toDate(b) - toDate(a)) / 86400000); }
  function inRange(d, from, to) { return d >= from && d <= to; }

  /* ───────── 원본 → 정리된 데이터 ─────────
   * v5 시절 저장 형식이 시기마다 달라서, 여기서 한 번만 통일한다.
   * 화면과 계산은 이 결과만 본다.
   */
  function normalize(raw) {
    raw = raw || {};
    var out = { naver: [], naverProd: [], coupang: [], other: [], ads: { sa: [], meta: [], boost: [], coupang: [] }, orders: [], skuMap: [], visits: [] };

    // 네이버 일매출: 옛 양식 행은 r이 총 판매금액, 새 양식(newSales)은 r이 순매출
    var nd = {};
    (raw.naver || []).forEach(function (e) {
      var d = normDate(e && e.d); if (!d) return;
      var isNew = e.src === 'newSales';
      var refund = num(e.refund);
      var gross = isNew ? num(e.rev_gross) : num(e.r);
      var net = isNew ? num(e.r) : num(e.r) - refund;
      var o = nd[d] || (nd[d] = { d: d, net: 0, gross: 0, refund: 0, orders: 0, qty: 0, visits: 0 });
      o.net += net; o.gross += gross; o.refund += refund;
      o.orders += num(e.o); o.qty += num(e.qty); o.visits += num(e.visits);
    });
    out.naver = Object.keys(nd).sort().map(function (d) { return nd[d]; });

    (raw.naverProd || []).forEach(function (e) {
      var d = normDate(e && (e.d || e.date)); if (!d) return;
      out.naverProd.push({ d: d, prodId: String(e.prodId || e.pid || ''), name: String(e.name || ''), orders: num(e.o || e.orders), qty: num(e.qty), net: num(e.rev) });
    });

    // 쿠팡 입고: 2026-03-24~04-15 구간은 div 대신 type, wh 대신 center로 저장돼 있음
    (raw.coupStock || []).forEach(function (e) {
      var d = normDate(e && e.d); if (!d) return;
      var div = e.div || e.type || '';
      if (div !== '발주') return;
      out.coupang.push({ d: d, amount: num(e.a || e.amount), qty: num(e.qty), sku: String(e.sku || e.skuName || ''), skuNo: String(e.skuNo || ''), center: String(e.wh || e.center || '') });
    });

    (raw.other || []).forEach(function (e) {
      var d = normDate(e && e.d); if (!d) return;
      out.other.push({ d: d, amount: num(e.a || e.amount), qty: num(e.qty), market: String(e.m || e.market || ''), product: String(e.product || ''), code: String(e.code || '') });
    });

    (raw.naverAd || []).forEach(function (e) {
      var d = normDate(e && e.d); if (!d) return;
      out.ads.sa.push({ d: d, cost: num(e.cost), rev: num(e.rev), clicks: num(e.clicks), imp: num(e.imp), conv: num(e.conv), campaign: String(e.campaign || '') });
    });
    // 같은 날짜에 캠페인별 행과 하루 합계 행이 함께 있으면 합계 행을 버린다(이중 집계 방지)
    var saCamp = {};
    out.ads.sa.forEach(function (e) { if (e.campaign) saCamp[e.d] = 1; });
    out.ads.sa = out.ads.sa.filter(function (e) { return e.campaign || !saCamp[e.d]; });

    (raw.metaAd || []).forEach(function (e) {
      var d = normDate(e && e.d); if (!d) return;
      out.ads.meta.push({ d: d, cost: num(e.cost), clicks: num(e.clicks), imp: num(e.imp), reach: num(e.reach), setName: String(e.setName || '') });
    });
    (raw.naverAdBoost || []).forEach(function (e) {
      var d = normDate(e && e.d); if (!d) return;
      out.ads.boost.push({ d: d, cost: num(e.cost), clicks: num(e.clicks), imp: num(e.imp), conv: num(e.conv) });
    });
    (raw.coupAd || []).forEach(function (e) {
      var d = normDate(e && e.d); if (!d) return;
      out.ads.coupang.push({ d: d, cost: num(e.cost), rev: num(e.rev), clicks: num(e.clicks), imp: num(e.imp), conv: num(e.conv), campaign: String(e.campaign || '') });
    });

    (raw.naverOrder || []).forEach(function (e) {
      var d = normDate(e && e.d); if (!d) return;
      out.orders.push({ d: d, prodId: String(e.prodId || ''), name: String(e.name || ''), opt: String(e.opt || ''), qty: num(e.qty), st: String(e.st || ''), claim: String(e.claim || '') });
    });
    out.skuMap = (raw.skuMap || []).filter(function (r) { return r && r.k; });
    out.costVer = costPick(raw.skuCost);

    // 조회 가능한 범위: 채널별 첫 날짜와 마지막 날짜
    function span(rows) {
      var a = '', b = '';
      rows.forEach(function (e) { if (!a || e.d < a) a = e.d; if (e.d > b) b = e.d; });
      return { first: a, last: b };
    }
    out.span = { naver: span(out.naver), coupang: span(out.coupang), other: span(out.other) };
    var firsts = [out.span.naver.first, out.span.coupang.first, out.span.other.first].filter(Boolean).sort();
    var lasts = [out.span.naver.last, out.span.coupang.last].filter(Boolean).sort();
    out.first = firsts[0] || '';
    out.last = lasts.length ? lasts[lasts.length - 1] : '';
    return out;
  }

  /* ───────── 기간 ───────── */
  function prevPeriod(from, to) { // 바로 앞 같은 길이
    var len = dayDiff(from, to) + 1;
    return { from: addDays(from, -len), to: addDays(from, -1) };
  }
  function lastYear(from, to) { // 작년 같은 기간
    function back(ds) { var d = toDate(ds); d.setFullYear(d.getFullYear() - 1); return fmtDate(d); }
    return { from: back(from), to: back(to) };
  }
  function preset(key, anchor, first) {
    var a = toDate(anchor);
    if (key === '1' || key === '7' || key === '30' || key === '90') return { from: addDays(anchor, -(+key - 1)), to: anchor };
    if (key === 'thisMonth') return { from: fmtDate(new Date(a.getFullYear(), a.getMonth(), 1)), to: anchor };
    if (key === 'lastMonth') return { from: fmtDate(new Date(a.getFullYear(), a.getMonth() - 1, 1)), to: fmtDate(new Date(a.getFullYear(), a.getMonth(), 0)) };
    if (key === 'thisYear') return { from: a.getFullYear() + '-01-01', to: anchor };
    if (key === 'all') return { from: first || anchor, to: anchor };
    return null;
  }

  /* ───────── 요약 ───────── */
  function sum(rows, from, to, field) {
    var s = 0;
    for (var i = 0; i < rows.length; i++) { var e = rows[i]; if (e.d >= from && e.d <= to) s += e[field] || 0; }
    return s;
  }
  function summary(data, from, to) {
    var r = {};
    r.naverNet = sum(data.naver, from, to, 'net');
    r.naverGross = sum(data.naver, from, to, 'gross');
    r.naverRefund = sum(data.naver, from, to, 'refund');
    r.naverOrders = sum(data.naver, from, to, 'orders');
    r.naverVisits = sum(data.naver, from, to, 'visits');
    r.coupang = sum(data.coupang, from, to, 'amount');
    r.other = sum(data.other, from, to, 'amount');
    r.total = r.naverNet + r.coupang + r.other;
    r.adSa = sum(data.ads.sa, from, to, 'cost');
    r.adMeta = sum(data.ads.meta, from, to, 'cost');
    r.adBoost = sum(data.ads.boost, from, to, 'cost');
    r.adStore = r.adSa + r.adMeta + r.adBoost;
    r.storeRoas = r.adStore > 0 ? r.naverNet / r.adStore : null;
    var mc = sum(data.ads.meta, from, to, 'clicks'), mi = sum(data.ads.meta, from, to, 'imp');
    r.metaCtr = mi > 0 ? mc / mi : null;
    r.coupAdCost = sum(data.ads.coupang, from, to, 'cost');
    r.coupAdRev = sum(data.ads.coupang, from, to, 'rev');
    r.coupAdRoas = r.coupAdCost > 0 ? r.coupAdRev / r.coupAdCost : null;
    return r;
  }
  // 증감: 이전 값이 0이면 비율을 계산하지 않는다(null)
  function delta(cur, prev) {
    return { diff: cur - prev, pct: prev ? (cur - prev) / Math.abs(prev) : null };
  }

  // 날짜별 실매출과 스토어 광고비
  function daily(data, from, to) {
    var m = {};
    function slot(d) { return m[d] || (m[d] = { d: d, naver: 0, coupang: 0, other: 0, sales: 0, ad: 0 }); }
    data.naver.forEach(function (e) { if (inRange(e.d, from, to)) slot(e.d).naver += e.net; });
    data.coupang.forEach(function (e) { if (inRange(e.d, from, to)) slot(e.d).coupang += e.amount; });
    data.other.forEach(function (e) { if (inRange(e.d, from, to)) slot(e.d).other += e.amount; });
    ['sa', 'meta', 'boost'].forEach(function (k) { data.ads[k].forEach(function (e) { if (inRange(e.d, from, to)) slot(e.d).ad += e.cost; }); });
    var out = [];
    for (var d = from; d <= to; d = addDays(d, 1)) {
      var o = slot(d); o.sales = o.naver + o.coupang + o.other; out.push(o);
    }
    return out;
  }
  // 기간이 길면 주 또는 월 단위로 묶는다
  function bucket(series, unit) {
    if (unit === 'day') return series.map(function (o) { return { key: o.d, label: o.d.slice(5).replace('-', '.'), sales: o.sales, ad: o.ad }; });
    var m = {}, order = [];
    series.forEach(function (o) {
      var key;
      if (unit === 'month') key = o.d.slice(0, 7);
      else { var dt = toDate(o.d); var dow = (dt.getDay() + 6) % 7; key = addDays(o.d, -dow); } // 월요일 시작
      if (!m[key]) { m[key] = { key: key, label: unit === 'month' ? key.slice(2).replace('-', '.') : key.slice(5).replace('-', '.') + ' 주', sales: 0, ad: 0 }; order.push(key); }
      m[key].sales += o.sales; m[key].ad += o.ad;
    });
    return order.map(function (k) { return m[k]; });
  }
  function autoUnit(from, to) { var n = dayDiff(from, to) + 1; return n <= 62 ? 'day' : (n <= 370 ? 'week' : 'month'); }

  /* ───────── 매출 메뉴: 날짜별 상세 ─────────
   * 한 날짜에 필요한 숫자를 모두 담은 줄을 만들고, 주/월로 묶을 때는 숫자 칸을 그대로 더한다.
   */
  var FULL_FIELDS = ['nNet', 'nGross', 'nRefund', 'nOrders', 'nVisits', 'coup', 'coupQty', 'other', 'otherQty', 'adStore', 'coupAdCost', 'coupAdRev', 'total'];
  function dailyFull(data, from, to) {
    var m = {};
    function slot(d) {
      if (!m[d]) { m[d] = { d: d }; FULL_FIELDS.forEach(function (f) { m[d][f] = 0; }); }
      return m[d];
    }
    data.naver.forEach(function (e) { if (!inRange(e.d, from, to)) return; var o = slot(e.d); o.nNet += e.net; o.nGross += e.gross; o.nRefund += e.refund; o.nOrders += e.orders; o.nVisits += e.visits; });
    data.coupang.forEach(function (e) { if (!inRange(e.d, from, to)) return; var o = slot(e.d); o.coup += e.amount; o.coupQty += e.qty; });
    data.other.forEach(function (e) { if (!inRange(e.d, from, to)) return; var o = slot(e.d); o.other += e.amount; o.otherQty += e.qty; });
    ['sa', 'meta', 'boost'].forEach(function (k) { data.ads[k].forEach(function (e) { if (inRange(e.d, from, to)) slot(e.d).adStore += e.cost; }); });
    data.ads.coupang.forEach(function (e) { if (!inRange(e.d, from, to)) return; var o = slot(e.d); o.coupAdCost += e.cost; o.coupAdRev += e.rev; });
    var out = [];
    for (var d = from; d <= to; d = addDays(d, 1)) { var o = slot(d); o.total = o.nNet + o.coup + o.other; out.push(o); }
    return out;
  }
  function bucketFull(rows, unit) {
    var m = {}, order = [];
    rows.forEach(function (o) {
      var key, label;
      if (unit === 'month') { key = o.d.slice(0, 7); label = key.replace('-', '.'); }
      else if (unit === 'week') { var dt = toDate(o.d); key = addDays(o.d, -((dt.getDay() + 6) % 7)); label = key.slice(5).replace('-', '.') + ' 주'; }
      else { key = o.d; label = o.d.slice(5).replace('-', '.'); }
      if (!m[key]) { m[key] = { key: key, label: label, from: o.d, to: o.d }; FULL_FIELDS.forEach(function (f) { m[key][f] = 0; }); order.push(key); }
      var b = m[key]; b.to = o.d;
      FULL_FIELDS.forEach(function (f) { b[f] += o[f]; });
    });
    return order.map(function (k) { return m[k]; });
  }
  function totalFull(rows) {
    var t = {}; FULL_FIELDS.forEach(function (f) { t[f] = 0; });
    rows.forEach(function (o) { FULL_FIELDS.forEach(function (f) { t[f] += o[f]; }); });
    return t;
  }
  // 쿠팡 입고 상위 품목
  function coupangTop(data, from, to) {
    var m = {};
    data.coupang.forEach(function (e) {
      if (!inRange(e.d, from, to)) return;
      var k = e.skuNo || e.sku; var o = m[k] || (m[k] = { skuNo: e.skuNo, name: e.sku, qty: 0, amount: 0 });
      o.qty += e.qty; o.amount += e.amount; if (e.sku) o.name = e.sku;
    });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.amount - a.amount; });
  }
  // 기타마켓: 마켓별 합계와 주문 목록
  function otherByMarket(data, from, to) {
    var m = {};
    data.other.forEach(function (e) {
      if (!inRange(e.d, from, to)) return;
      var k = e.market || '(마켓 미기재)'; var o = m[k] || (m[k] = { market: k, qty: 0, amount: 0, count: 0 });
      o.qty += e.qty; o.amount += e.amount; o.count += 1;
    });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.amount - a.amount; });
  }
  function otherRows(data, from, to) {
    return data.other.filter(function (e) { return inRange(e.d, from, to); }).sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : 0; });
  }

  /* ───────── 광고 메뉴 ─────────
   * 비율(CTR, CPC, ROAS)은 날짜별 값을 더하지 않고, 합계끼리 나눠서 구한다.
   */
  var AD_FIELDS = ['saCost', 'saRev', 'saClicks', 'saImp', 'saConv', 'metaCost', 'metaClicks', 'metaImp', 'metaReach',
    'boostCost', 'boostClicks', 'boostImp', 'boostConv', 'coupCost', 'coupRev', 'coupClicks', 'coupImp', 'coupConv', 'nNet', 'store'];
  function adsDaily(data, from, to) {
    var m = {};
    function slot(d) {
      if (!m[d]) { m[d] = { d: d }; AD_FIELDS.forEach(function (f) { m[d][f] = 0; }); }
      return m[d];
    }
    data.ads.sa.forEach(function (e) { if (!inRange(e.d, from, to)) return; var o = slot(e.d); o.saCost += e.cost; o.saRev += e.rev; o.saClicks += e.clicks; o.saImp += e.imp; o.saConv += e.conv; });
    data.ads.meta.forEach(function (e) { if (!inRange(e.d, from, to)) return; var o = slot(e.d); o.metaCost += e.cost; o.metaClicks += e.clicks; o.metaImp += e.imp; o.metaReach += e.reach; });
    data.ads.boost.forEach(function (e) { if (!inRange(e.d, from, to)) return; var o = slot(e.d); o.boostCost += e.cost; o.boostClicks += e.clicks; o.boostImp += e.imp; o.boostConv += e.conv; });
    data.ads.coupang.forEach(function (e) { if (!inRange(e.d, from, to)) return; var o = slot(e.d); o.coupCost += e.cost; o.coupRev += e.rev; o.coupClicks += e.clicks; o.coupImp += e.imp; o.coupConv += e.conv; });
    data.naver.forEach(function (e) { if (inRange(e.d, from, to)) slot(e.d).nNet += e.net; });
    var out = [];
    for (var d = from; d <= to; d = addDays(d, 1)) { var o = slot(d); o.store = o.saCost + o.metaCost + o.boostCost; out.push(o); }
    return out;
  }
  function bucketBy(rows, unit, fields) {
    var m = {}, order = [];
    rows.forEach(function (o) {
      var key, label;
      if (unit === 'month') { key = o.d.slice(0, 7); label = key.replace('-', '.'); }
      else if (unit === 'week') { var dt = toDate(o.d); key = addDays(o.d, -((dt.getDay() + 6) % 7)); label = key.slice(5).replace('-', '.') + ' 주'; }
      else { key = o.d; label = o.d.slice(5).replace('-', '.'); }
      if (!m[key]) { m[key] = { key: key, label: label, from: o.d, to: o.d }; fields.forEach(function (f) { m[key][f] = 0; }); order.push(key); }
      var b = m[key]; b.to = o.d;
      fields.forEach(function (f) { b[f] += o[f]; });
    });
    return order.map(function (k) { return m[k]; });
  }
  function totalBy(rows, fields) {
    var t = {}; fields.forEach(function (f) { t[f] = 0; });
    rows.forEach(function (o) { fields.forEach(function (f) { t[f] += o[f]; }); });
    return t;
  }
  function adsBucket(rows, unit) { return bucketBy(rows, unit, AD_FIELDS); }
  function adsTotal(rows) { return totalBy(rows, AD_FIELDS); }
  function ratio(a, b) { return b > 0 ? a / b : null; }
  // 매체 안에서 캠페인(메타는 광고 세트)별로 나눠 보기
  function adsBreakdown(data, medium, from, to) {
    var src = medium === 'sa' ? data.ads.sa : medium === 'meta' ? data.ads.meta : medium === 'coupang' ? data.ads.coupang : [];
    var m = {};
    src.forEach(function (e) {
      if (!inRange(e.d, from, to)) return;
      var k = (medium === 'meta' ? e.setName : e.campaign) || '(구분 없음)';
      var o = m[k] || (m[k] = { name: k, cost: 0, rev: 0, clicks: 0, imp: 0, conv: 0 });
      o.cost += e.cost; o.rev += e.rev || 0; o.clicks += e.clicks; o.imp += e.imp; o.conv += e.conv || 0;
    });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.cost - a.cost; });
  }

  /* ───────── 옵션 → SKU (v5.38과 같은 규칙) ───────── */
  function skuNorm(v) {
    v = String(v || '').replace(/\s+/g, '');
    v = v.replace(/^(학산키즈워크북:|학산키즈:)/, '');
    v = v.replace(/^노래하는스티커북-/, '');
    return v;
  }
  function skuParseOpt(opt) {
    var out = []; opt = String(opt || ''); if (!opt) return out;
    opt.split(' / ').forEach(function (part) {
      var i = part.indexOf(': '), lab = i >= 0 ? part.slice(0, i) : '', val = i >= 0 ? part.slice(i + 2) : part;
      var vals = lab.indexOf('3종 세트') >= 0 ? val.split('+') : [val];
      vals.forEach(function (x) { var n = skuNorm(x); if (n && n !== '선택안함') out.push(n); });
    });
    return out;
  }
  function skuKeys(e) {
    var vals = skuParseOpt(e.opt);
    return vals.length ? vals.map(function (v) { return e.prodId + '|' + v; }) : [e.prodId + '|(없음)'];
  }
  function skuIndex(skuMap) {
    var idx = {}, names = {};
    (skuMap || []).forEach(function (r) {
      idx[r.k] = r;
      (r.codes || []).forEach(function (c, i) { if (r.names && r.names[i] && !names[c.c]) names[c.c] = r.names[i]; });
    });
    return { idx: idx, names: names };
  }
  // SKU별 주문 수량, 취소/반품 수량 (주문일 기준, 미결제 취소 제외)
  function skuAggregate(data, from, to) {
    var ix = skuIndex(data.skuMap), m = {};
    data.orders.forEach(function (e) {
      if (e.st === '미결제취소' || e.d < from || e.d > to) return;
      var cancel = (e.st === '취소' || e.st === '반품');
      skuKeys(e).forEach(function (k) {
        var r = ix.idx[k], items;
        if (!r) items = [{ c: '(매핑 없음)', q: 1, nm: '매핑표에 없는 옵션' }];
        else if (!r.codes || !r.codes.length) items = [{ c: '(종류 미상)', q: 1, nm: (r.pname || '') + ' (종류 미상)' }];
        else items = r.codes.map(function (c) { return { c: c.c, q: c.q || 1, nm: ix.names[c.c] || '' }; });
        items.forEach(function (x) {
          var o = m[x.c] || (m[x.c] = { code: x.c, name: x.nm, qty: 0, cancel: 0 });
          if (!o.name && x.nm) o.name = x.nm;
          o.qty += x.q * e.qty; if (cancel) o.cancel += x.q * e.qty;
        });
      });
    });
    return Object.keys(m).map(function (k) { var o = m[k]; o.net = o.qty - o.cancel; return o; })
      .sort(function (a, b) { return b.net - a.net; });
  }
  /* ───────── 원가 (SKU 1개당, 부가세 포함 금액으로 저장) ───────── */
  // 원가표는 올릴 때마다 새 판(ver)으로 쌓인다. 가장 최근 판을 쓴다.
  function costPick(list) {
    var best = null;
    (list || []).forEach(function (v) { if (v && Array.isArray(v.rows) && (!best || String(v.ver) > String(best.ver))) best = v; });
    return best;
  }
  function costIndex(ver) {
    var ix = {};
    if (!ver) return ix;
    ver.rows.forEach(function (r) { var c = num(r.cost); if (!r.c || !(c > 0)) return; (ix[r.c] = ix[r.c] || []).push({ from: r.from || '', cost: c }); });
    Object.keys(ix).forEach(function (k) { ix[k].sort(function (a, b) { return a.from < b.from ? -1 : a.from > b.from ? 1 : 0; }); });
    return ix;
  }
  // 그 날짜에 적용되는 원가. 없으면 null (0원으로 치지 않는다)
  function costAt(ix, code, d) {
    var a = ix[code], v = null; if (!a) return null;
    a.forEach(function (e) { if (!e.from || e.from <= d) v = e.cost; });
    return v;
  }
  // 새로 올린 원가표를 이전 판 위에 합친다: 같은 (코드, 적용 시작일)은 새 값으로, 새 표에 없는 줄은 그대로 둔다
  function costMerge(prev, rows) {
    var m = {}, order = [], st = { added: 0, changed: 0, same: 0, kept: 0 };
    ((prev && prev.rows) || []).forEach(function (r) { var k = r.c + '|' + (r.from || ''); if (!m[k]) order.push(k); m[k] = { c: r.c, name: r.name || '', cost: num(r.cost), from: r.from || '', note: r.note || '' }; });
    var touched = {};
    rows.forEach(function (r) {
      var k = r.c + '|' + (r.from || ''); touched[k] = 1;
      if (!m[k]) { order.push(k); st.added++; }
      else if (m[k].cost !== r.cost) st.changed++; else st.same++;
      m[k] = { c: r.c, name: r.name || (m[k] && m[k].name) || '', cost: r.cost, from: r.from || '', note: r.note || '' };
    });
    order.forEach(function (k) { if (!touched[k]) st.kept++; });
    return { rows: order.map(function (k) { return m[k]; }), stat: st };
  }
  // 네이버 상품별 성과 + SKU 풀이 + 원가
  //  - 수량, 순매출: 상품성과 파일(결제일 기준)
  //  - SKU 수량, 원가: 주문조회 파일(주문일 기준, 미결제취소/취소/반품 제외) × 매핑표 × 원가표
  //  - 마진 = 순매출 - 원가. 원가가 하나라도 빠진 상품은 마진을 계산하지 않는다(null)
  function products(data, from, to) {
    var ix = skuIndex(data.skuMap), cx = costIndex(data.costVer), P = {}, K = {};
    function prod(id) { return P[id] || (P[id] = { prodId: id, name: '', nameD: '', qty: 0, net: 0, oqty: 0, cost: 0, noCost: 0, skus: {} }); }
    data.naverProd.forEach(function (e) {
      if (!inRange(e.d, from, to)) return;
      var o = prod(e.prodId); o.qty += e.qty; o.net += e.net;
      if (e.name && e.d >= o.nameD) { o.name = e.name; o.nameD = e.d; }
    });
    data.orders.forEach(function (e) {
      if (e.st === '미결제취소' || !inRange(e.d, from, to)) return;
      var cancel = (e.st === '취소' || e.st === '반품');
      var o = prod(e.prodId); if (!o.name) o.name = e.name;
      skuKeys(e).forEach(function (k) {
        var r = ix.idx[k], items;
        if (!r) items = [{ c: '(매핑 없음)', q: 1, nm: '매핑표에 없는 옵션' }];
        else if (!r.codes || !r.codes.length) items = [{ c: '(종류 미상)', q: 1, nm: (r.pname || '') + ' (종류 미상)' }];
        else items = r.codes.map(function (c) { return { c: c.c, q: c.q || 1, nm: ix.names[c.c] || '' }; });
        items.forEach(function (x) {
          var q = x.q * e.qty;
          var g = K[x.c] || (K[x.c] = { code: x.c, name: x.nm, qty: 0, cancel: 0, cost: 0, noCost: 0, unit: null });
          var s = o.skus[x.c] || (o.skus[x.c] = { code: x.c, name: x.nm, qty: 0, cost: 0, noCost: 0, unit: null });
          if (!g.name && x.nm) g.name = x.nm;
          if (cancel) { g.cancel += q; return; }
          var c = costAt(cx, x.c, e.d);
          g.qty += q; s.qty += q; o.oqty += q;
          if (c === null) { g.noCost += q; s.noCost += q; o.noCost += q; }
          else { g.cost += c * q; s.cost += c * q; o.cost += c * q; g.unit = c; s.unit = c; }
        });
      });
    });
    var prods = Object.keys(P).map(function (k) {
      var o = P[k];
      o.skuList = Object.keys(o.skus).map(function (c) { return o.skus[c]; }).sort(function (a, b) { return b.qty - a.qty; });
      o.margin = (o.oqty > 0 && o.noCost === 0) ? o.net - o.cost : null;
      return o;
    }).filter(function (o) { return o.qty || o.net || o.oqty; }).sort(function (a, b) { return b.net - a.net || b.qty - a.qty; });
    var skus = Object.keys(K).map(function (k) { return K[k]; }).sort(function (a, b) { return b.qty - a.qty || (a.code < b.code ? -1 : 1); });
    var t = { count: 0, qty: 0, net: 0, cost: 0, margin: 0, netCosted: 0 };
    prods.forEach(function (o) {
      if (o.qty > 0) t.count++; t.qty += o.qty; t.net += o.net;
      if (o.margin !== null) { t.cost += o.cost; t.margin += o.margin; t.netCosted += o.net; }
    });
    return { prods: prods, skus: skus, total: t, noCost: skus.filter(function (s) { return s.noCost > 0 && s.code.charAt(0) !== '('; }), hasCost: !!data.costVer };
  }

  function skuUnmapped(data) {
    var ix = skuIndex(data.skuMap).idx, seen = {};
    data.orders.forEach(function (e) { if (e.st === '미결제취소') return; skuKeys(e).forEach(function (k) { if (!ix[k]) seen[k] = 1; }); });
    return Object.keys(seen);
  }

  /* ───────── 판매 파일과 주문 파일 대조 (v5.36과 같은 규칙) ───────── */
  function orderCheck(data) {
    var ord = {}, sal = {}, salDates = {}, ordDates = {};
    data.orders.forEach(function (e) {
      ordDates[e.d] = 1; if (e.st === '미결제취소') return;
      var k = e.d + '|' + e.prodId; ord[k] = (ord[k] || 0) + e.qty;
    });
    data.naverProd.forEach(function (e) {
      salDates[e.d] = 1; if (!e.prodId) return;
      var k = e.d + '|' + e.prodId; sal[k] = (sal[k] || 0) + e.qty;
    });
    var keys = {}, diff = [];
    Object.keys(ord).forEach(function (k) { keys[k] = 1; }); Object.keys(sal).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var p = k.split('|'), d = p[0];
      if (!ordDates[d] || !salDates[d]) return;
      var a = sal[k] || 0, b = ord[k] || 0;
      if (a !== b) diff.push({ d: d, prodId: p[1], sales: a, order: b, gap: b - a });
    });
    diff.sort(function (x, y) { return x.d < y.d ? -1 : x.d > y.d ? 1 : 0; });
    var shifted = 0;
    for (var i = 0; i < diff.length; i++) {
      var x = diff[i]; if (x.gap <= 0) continue;
      for (var j = i + 1; j < diff.length && x.gap > 0; j++) {
        var y = diff[j]; if (y.prodId !== x.prodId || y.gap >= 0) continue;
        if (dayDiff(x.d, y.d) > 7) break;
        var mm = Math.min(x.gap, -y.gap); x.gap -= mm; y.gap += mm; shifted += mm;
      }
    }
    return { diff: diff.filter(function (e) { return e.gap !== 0; }), shifted: shifted };
  }

  /* ───────── 확인할 것: 평소와 다른 것만 최대 3개 ─────────
   * 규칙은 단순하게, 왜 떴는지 한 줄로 설명할 수 있는 것만 둔다.
   */
  function signals(data, cur, prev, sCur, sPrev) {
    var out = [];
    function won(n) { return Math.round(n).toLocaleString('ko-KR') + '원'; }
    function pct(p) { return (p > 0 ? '+' : '') + Math.round(p * 100) + '%'; }

    // 1) 광고비는 늘었는데 네이버 순매출은 줄었을 때
    if (sPrev.adStore > 0 && sCur.adStore > sPrev.adStore * 1.1 && sCur.naverNet < sPrev.naverNet * 0.9) {
      out.push({ level: 'warn', score: 100, title: '광고비는 늘고 네이버 매출은 줄었어요',
        desc: '광고비 ' + pct(delta(sCur.adStore, sPrev.adStore).pct) + ', 순매출 ' + pct(delta(sCur.naverNet, sPrev.naverNet).pct) });
    }
    // 2) 스토어 ROAS가 30% 이상 떨어졌을 때
    if (sCur.storeRoas !== null && sPrev.storeRoas !== null && sCur.storeRoas < sPrev.storeRoas * 0.7) {
      out.push({ level: 'warn', score: 90, title: '스토어 ROAS가 크게 떨어졌어요',
        desc: Math.round(sPrev.storeRoas * 100) + '%에서 ' + Math.round(sCur.storeRoas * 100) + '%로' });
    }
    // 3) 채널별 매출이 30% 이상 움직였을 때 (이전 기간 10만원 이상일 때만)
    [['naverNet', '네이버 순매출'], ['coupang', '쿠팡 입고'], ['other', '기타마켓']].forEach(function (c) {
      var a = sCur[c[0]], b = sPrev[c[0]];
      if (b < 100000 && a < 100000) return;
      var d = delta(a, b);
      if (d.pct === null) { if (a >= 100000) out.push({ level: 'up', score: 40, title: c[1] + ' 새로 발생', desc: won(a) }); return; }
      if (Math.abs(d.pct) < 0.3) return;
      out.push({ level: d.pct > 0 ? 'up' : 'down', score: 50 + Math.min(40, Math.abs(d.diff) / 500000), title: c[1] + ' ' + pct(d.pct), desc: '이전 ' + won(b) + ', 이번 ' + won(a) });
    });
    // 4) SKU 판매 수량이 가장 크게 변한 것 1개 (10개 이상 차이)
    if (data.skuMap.length && data.orders.length) {
      var a = skuAggregate(data, cur.from, cur.to), b = skuAggregate(data, prev.from, prev.to), pm = {}, best = null;
      b.forEach(function (o) { pm[o.code] = o; });
      a.forEach(function (o) { var p = pm[o.code] ? pm[o.code].net : 0; var df = o.net - p; if (o.code.charAt(0) !== '(' && Math.abs(df) >= 10 && (!best || Math.abs(df) > Math.abs(best.df))) best = { o: o, p: p, df: df }; });
      b.forEach(function (o) { var has = a.some(function (x) { return x.code === o.code; }); if (!has && o.code.charAt(0) !== '(' && o.net >= 10 && (!best || o.net > Math.abs(best.df))) best = { o: { code: o.code, name: o.name, net: 0 }, p: o.net, df: -o.net }; });
      if (best) out.push({ level: best.df > 0 ? 'up' : 'down', score: 45, title: (best.o.name || best.o.code) + ' ' + best.o.net.toLocaleString('ko-KR') + '개',
        desc: '이전 ' + best.p.toLocaleString('ko-KR') + '개 대비 ' + (best.df > 0 ? '+' : '') + best.df.toLocaleString('ko-KR') + '개' });
    }
    out.sort(function (x, y) { return y.score - x.score; });
    return out.slice(0, 3);
  }

  /* ───────── 데이터 상태 ───────── */
  function lastDate(rows) { var m = ''; rows.forEach(function (e) { if (e.d > m) m = e.d; }); return m; }
  function health(data, today) {
    var chk = data.orders.length ? orderCheck(data) : null;
    return {
      lastNaver: lastDate(data.naver), lastCoupang: lastDate(data.coupang), lastOrders: lastDate(data.orders),
      lastSa: lastDate(data.ads.sa), lastMeta: lastDate(data.ads.meta),
      orders: data.orders.length, mapRows: data.skuMap.length,
      unmapped: data.skuMap.length ? skuUnmapped(data).length : null,
      mismatch: chk ? chk.diff.length : null, shifted: chk ? chk.shifted : null,
      naverStale: today && data.span.naver.last ? dayDiff(data.span.naver.last, today) : null
    };
  }

  return {
    num: num, normDate: normDate, addDays: addDays, dayDiff: dayDiff, normalize: normalize,
    prevPeriod: prevPeriod, lastYear: lastYear, preset: preset,
    summary: summary, delta: delta, daily: daily, bucket: bucket, autoUnit: autoUnit,
    dailyFull: dailyFull, bucketFull: bucketFull, totalFull: totalFull, coupangTop: coupangTop, otherByMarket: otherByMarket, otherRows: otherRows,
    adsDaily: adsDaily, adsBucket: adsBucket, adsTotal: adsTotal, adsBreakdown: adsBreakdown, ratio: ratio,
    skuAggregate: skuAggregate, skuUnmapped: skuUnmapped, skuParseOpt: skuParseOpt, orderCheck: orderCheck,
    costPick: costPick, costIndex: costIndex, costAt: costAt, costMerge: costMerge, products: products,
    signals: signals, health: health
  };
});
