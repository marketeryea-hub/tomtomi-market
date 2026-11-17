/* 톰토미 대시보드 v6 — 화면
 *
 * 계산은 calc.js, 데이터 읽기는 data.js가 맡고, 여기는 그리는 일만 한다.
 * 기간(조회/비교)은 모든 메뉴가 함께 쓰는 하나의 상태다.
 */
(function (root) {
  'use strict';
  var C = root.TTCalc;
  var DATA = null, RAW = null;      // 정리된 데이터
  var META = {};        // 불러오기 결과(기타마켓 연결 여부 등)
  var S = { view: 'home', from: '', to: '', preset: '1', cmp: 'prev', cmpFrom: '', cmpTo: '', ch: 'all', unit: 'auto', ad: 'store', page: 0, pch: 'all', pmode: 'item', open: '', draft: null, costMsg: '', saving: false, q: '', sel: [], selMsg: '', tpage: 0, topen: '', acOpen: {}, acSel: null, acBasis: 'ad', adView: 'camp', aitem: '', amd: 'all', apage: 0, aopen: {}, aiq: '', ppage: 0 };
  var READY = { home: 1, sales: 1, ads: 1, products: 1, customers: 1, promo: 1, data: 1, slack: 1 }; // 옮겨온 메뉴
  var STORE_KEY = 'tt6_state';

  var VIEWS = [
    { id: 'home', label: '홈', group: 'view' },
    { id: 'sales', label: '매출', group: 'view' },
    { id: 'ads', label: '광고', group: 'view' },
    { id: 'products', label: '상품', group: 'view' },
    { id: 'customers', label: '고객/유입', group: 'view' },
    { id: 'promo', label: '프로모션', group: 'view' },
    { id: 'slack', label: '슬랙 리포트', group: 'manage' },
    { id: 'data', label: '데이터 관리', group: 'manage' }
  ];
  var SNS_URL = 'https://script.google.com/macros/s/AKfycbwPP2q4xCM9g5XQwGLELKyS8lxRY9Nz1K9xMSb6wB3lSJtb4y1hmDIKb7gruPMcvMz-bA/exec';

  /* ───────── 도우미 ───────── */
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function won(n) { return Math.round(n).toLocaleString('ko-KR'); }
  function shortWon(n) { // 차트 눈금용
    var a = Math.abs(n);
    if (a >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '억';
    if (a >= 10000) return Math.round(n / 10000).toLocaleString('ko-KR') + '만';
    return Math.round(n).toLocaleString('ko-KR');
  }
  function dot(ds) { return ds ? ds.slice(0, 4) + '.' + ds.slice(5, 7) + '.' + ds.slice(8, 10) : '-'; }
  function mdot(ds) { return ds ? ds.slice(5, 7) + '.' + ds.slice(8, 10) : '-'; }
  function pctText(p) { return (p > 0 ? '+' : '') + Math.round(p * 100).toLocaleString('ko-KR') + '%'; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  // 열 때마다 기간은 '최근 1일'에서 시작한다. 보던 메뉴, 채널, 차트 단위만 기억한다.
  var KEEP = ['view', 'ch', 'unit', 'ad', 'pch', 'pmode', 'adView', 'amd', 'aitem'];
  function save() { try { var o = {}; KEEP.forEach(function (k) { o[k] = S[k]; }); localStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch (e) { /* 저장 못 해도 화면은 동작 */ } }
  function restore() { try { var v = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); if (v && typeof v === 'object') KEEP.forEach(function (k) { if (typeof v[k] === 'string') S[k] = v[k]; }); } catch (e) { /* 무시 */ } }

  /* ───────── 기간 상태 ───────── */
  function cmpRange() {
    if (S.cmp === 'off') return null;
    if (S.cmp === 'lastYear') return C.lastYear(S.from, S.to);
    if (S.cmp === 'custom' && S.cmpFrom && S.cmpTo && S.cmpFrom <= S.cmpTo) return { from: S.cmpFrom, to: S.cmpTo };
    return C.prevPeriod(S.from, S.to);
  }
  function applyPreset(key) {
    var r = C.preset(key, DATA.last, DATA.first); if (!r) return;
    S.preset = key; S.from = r.from < DATA.first ? DATA.first : r.from; S.to = r.to;
  }
  function clampDates() {
    if (!S.from || S.from < DATA.first) S.from = DATA.first;
    if (!S.to || S.to > DATA.last) S.to = DATA.last;
    if (S.from > S.to) S.from = S.to;
  }

  /* ───────── 공통 조각 ───────── */
  function deltaHtml(cur, prev, hasCmp) {
    if (!hasCmp) return '<span class="dlt">비교 꺼짐</span>';
    var d = C.delta(cur, prev);
    if (d.pct === null) return '<span class="dlt">이전 기간 값 없음</span>';
    var cls = d.diff > 0 ? 'up' : (d.diff < 0 ? 'down' : '');
    return '<span class="dlt"><span class="' + cls + '">' + pctText(d.pct) + '</span> 이전 ' + won(prev) + '원</span>';
  }
  function periodBar() {
    var cr = cmpRange();
    var presets = [['1', '1일'], ['7', '7일'], ['30', '30일'], ['90', '90일'], ['thisMonth', '이번 달'], ['lastMonth', '지난달'], ['thisYear', '올해'], ['all', '전체 기간']];
    var cmps = [['prev', '바로 앞 같은 길이'], ['lastYear', '작년 같은 기간'], ['custom', '직접 지정'], ['off', '비교 끄기']];
    var custom = S.cmp === 'custom';
    var h = '<section class="period" aria-label="기간 설정">';
    h += '<div class="period-row"><b>조회 기간</b>';
    h += '<label>시작<input type="date" data-act="from" value="' + S.from + '" min="' + DATA.first + '" max="' + DATA.last + '"></label>';
    h += '<label>끝<input type="date" data-act="to" value="' + S.to + '" min="' + DATA.first + '" max="' + DATA.last + '"></label>';
    presets.forEach(function (p) { h += '<button type="button" class="chip" data-act="preset" data-key="' + p[0] + '" aria-pressed="' + (S.preset === p[0]) + '">' + p[1] + '</button>'; });
    h += '</div><div class="period-row"><b>비교 기간</b>';
    h += '<label>시작<input type="date" data-act="cmpFrom" value="' + (cr ? cr.from : '') + '" min="' + DATA.first + '" max="' + DATA.last + '"' + (custom ? '' : ' disabled') + '></label>';
    h += '<label>끝<input type="date" data-act="cmpTo" value="' + (cr ? cr.to : '') + '" min="' + DATA.first + '" max="' + DATA.last + '"' + (custom ? '' : ' disabled') + '></label>';
    cmps.forEach(function (p) { h += '<button type="button" class="chip" data-act="cmp" data-key="' + p[0] + '" aria-pressed="' + (S.cmp === p[0]) + '">' + p[1] + '</button>'; });
    h += '</div><span class="period-note">가장 오래된 데이터인 ' + dot(DATA.first) + '부터 조회할 수 있습니다' + (DATA.span.naver.first ? ' (네이버는 ' + dot(DATA.span.naver.first) + '부터)' : '') + '. 여기서 정한 기간은 다른 메뉴로 옮겨도 유지됩니다.</span>';
    return h + '</section>';
  }

  /* ───────── 차트: 실매출(선) + 광고비(막대) + 비교 기간(점선) ───────── */
  // 조회 기간이 7일보다 짧으면 차트만 최근 14일 흐름을 보여주고 조회 기간을 색칠한다
  function chartCtx() {
    if (C.dayDiff(S.from, S.to) + 1 >= 7) return null;
    var f = C.addDays(S.to, -13); if (f < DATA.first) f = DATA.first;
    return { from: f, to: S.to };
  }
  function hlRange(rows) {
    var a = -1, b = -1;
    rows.forEach(function (o, i) { if (o.key >= S.from && o.key <= S.to) { if (a < 0) a = i; b = i; } });
    return a < 0 ? null : { a: a, b: b };
  }
  /* 선(주 지표) + 막대(광고비) + 비교 기간(점선).
   * 날짜 칸 어디에 마우스를 올려도 그 날짜의 값을 한꺼번에 보여준다.
   * opt: { line: 선 이름, bar: 막대 이름, unit: 선의 단위('원' 또는 '회') }
   */
  function chartSvg(cur, prev, hl, opt) {
    opt = opt || {};
    var lineName = opt.line || '실매출', barName = opt.bar || '광고비', unit = opt.unit || '원';
    var W = 760, H = 250, L = 52, R = 48, T = 12, B = 30, pw = W - L - R, ph = H - T - B, n = cur.length;
    if (!n) return '';
    var maxS = 0, maxA = 0;
    cur.forEach(function (o) { if (o.sales > maxS) maxS = o.sales; if (o.ad > maxA) maxA = o.ad; });
    (prev || []).slice(0, n).forEach(function (o) { if (o.sales > maxS) maxS = o.sales; });
    function nice(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
    maxS = nice(maxS); maxA = nice(maxA);
    var step = pw / n;
    function x(i) { return L + step * (i + 0.5); }
    function yS(v) { return T + ph - (Math.max(v, 0) / maxS) * ph; }
    function yA(v) { return T + ph - (v / maxA) * ph * 0.45; } // 막대는 아래쪽 45%만 쓴다
    var s = '<svg class="chart" role="img" aria-label="' + esc(lineName) + ' 선과 ' + esc(barName) + ' 막대 차트" viewBox="0 0 ' + W + ' ' + H + '">';
    for (var g = 0; g <= 4; g++) {
      var gy = T + ph - ph * g / 4;
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '" stroke="var(--line)" stroke-width="1"></line>';
      s += '<text x="' + (L - 6) + '" y="' + (gy + 4) + '" text-anchor="end">' + shortWon(maxS * g / 4) + '</text>';
    }
    if (maxA > 1) {
      s += '<text x="' + (W - R + 6) + '" y="' + (yA(maxA) + 4) + '">' + shortWon(maxA) + '</text>';
      s += '<text x="' + (W - R + 6) + '" y="' + (T + ph + 4) + '">0</text>';
    }
    if (hl) s += '<rect x="' + (L + step * hl.a).toFixed(1) + '" y="' + T + '" width="' + (step * (hl.b - hl.a + 1)).toFixed(1) + '" height="' + ph + '" fill="var(--accent-soft)"></rect>';
    var bw = Math.max(2, Math.min(28, step * 0.6));
    cur.forEach(function (o, i) {
      if (o.ad <= 0) return;
      var y = yA(o.ad);
      s += '<rect x="' + (x(i) - bw / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (T + ph - y).toFixed(1) + '" fill="var(--ad)" rx="2"></rect>';
    });
    function path(arr) { return arr.map(function (o, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + yS(o.sales).toFixed(1); }).join(' '); }
    if (prev && prev.length) s += '<path d="' + path(prev.slice(0, n)) + '" fill="none" stroke="var(--prev)" stroke-width="2" stroke-dasharray="6 6"></path>';
    s += '<path d="' + path(cur) + '" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"></path>';
    var every = Math.max(1, Math.ceil(n / 8));
    cur.forEach(function (o, i) {
      s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + yS(o.sales).toFixed(1) + '" r="' + (n <= 45 ? 3 : 1.5) + '" fill="var(--accent)"></circle>';
      if (i % every === 0) s += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(o.label) + '</text>';
    });
    // 날짜 칸 전체가 마우스를 받는다: 선, 비교, 막대 값을 한꺼번에 보여준다
    cur.forEach(function (o, i) {
      var lines = [o.label, lineName + ' ' + won(o.sales) + unit];
      if (prev && prev[i]) lines.push('비교 (' + prev[i].label + ') ' + won(prev[i].sales) + unit);
      if (opt.bar !== '') lines.push(barName + ' ' + won(o.ad) + (opt.barUnit || '원'));
      s += '<rect class="hit" x="' + (L + step * i).toFixed(1) + '" y="' + T + '" width="' + step.toFixed(1) + '" height="' + ph + '" data-tip="' + esc(lines.join('|')) + '"></rect>';
    });
    return s + '</svg>';
  }

  /* ───────── 홈 ───────── */
  function viewHome() {
    var cr = cmpRange(), has = !!cr;
    var sc = C.summary(DATA, S.from, S.to), sp = has ? C.summary(DATA, cr.from, cr.to) : null;
    var unit = C.autoUnit(S.from, S.to), ctx = chartCtx();
    var cur = C.bucket(ctx ? C.daily(DATA, ctx.from, ctx.to) : C.daily(DATA, S.from, S.to), unit);
    var prev = has && !ctx ? C.bucket(C.daily(DATA, cr.from, cr.to), unit) : null;
    var unitName = ctx ? '최근 14일' : unit === 'day' ? '일별' : unit === 'week' ? '주별' : '월별';
    var h = '';

    h += '<section aria-label="실매출"><div class="sec-h"><h2>실매출</h2><span>톰토미에 실제로 들어온 돈 (네이버 순매출 + 쿠팡 입고 + 기타마켓)</span></div><div class="kpis">';
    function kpi(label, cur, prev, main) {
      return '<div class="kpi' + (main ? ' main-kpi' : '') + '"><span class="lab">' + label + '</span><span class="val num">' + won(cur) + '<small>원</small></span>' + deltaHtml(cur, prev, has) + '</div>';
    }
    h += kpi('실매출 합계', sc.total, has ? sp.total : 0, true);
    h += kpi('네이버 순매출', sc.naverNet, has ? sp.naverNet : 0);
    h += kpi('쿠팡 입고 (B2B 납품)', sc.coupang, has ? sp.coupang : 0);
    h += kpi('기타마켓', sc.other, has ? sp.other : 0);
    h += '</div>';
    if (META.otherOk === false) h += '<p class="note">기타마켓 구글 시트를 불러오지 못해 0원으로 표시했습니다.</p>';
    h += '</section>';

    h += '<div class="row">';
    h += '<section class="card grow2" aria-label="실매출과 광고비 추이"><div class="card-h"><h2>' + unitName + ' 실매출과 광고비</h2>';
    h += '<span class="legend"><span class="lg-line"></span>이번 기간</span>';
    if (prev) h += '<span class="legend"><span class="lg-dash"></span>비교 기간</span>';
    if (ctx) h += '<span class="legend"><span class="lg-hl"></span>조회 기간</span>';
    h += '<span class="legend"><span class="lg-bar"></span>광고비 (오른쪽 눈금)</span></div>';
    h += chartSvg(cur, prev, ctx ? hlRange(cur) : null);
    h += '<span class="note">선은 실매출(왼쪽 눈금), 막대는 스토어 광고비(네이버SA + 메타 + 애드부스트)입니다. 차트에 마우스를 올리면 그 날짜의 값이 보입니다.</span></section>';

    var cmpEmpty = has && cr.to < DATA.first; // 비교 기간이 데이터 시작일보다 앞이면 비교할 값이 없다
    var sigs = has && !cmpEmpty ? C.signals(DATA, { from: S.from, to: S.to }, cr, sc, sp) : [];
    h += '<section class="card grow1" aria-label="확인할 것"><div class="card-h"><h2>확인할 것</h2><span class="hint">평소와 다른 것만 최대 3개</span></div>';
    if (!has) h += '<span class="note">비교 기간을 켜면 이전과 달라진 점을 찾아 보여줍니다.</span>';
    else if (cmpEmpty) h += '<span class="note">비교 기간(' + dot(cr.from) + ' ~ ' + dot(cr.to) + ')에는 데이터가 없어 비교할 수 없습니다.</span>';
    else if (!sigs.length) h += '<span class="note">이전 기간과 비교해 크게 달라진 것이 없습니다.</span>';
    sigs.forEach(function (g) {
      var t = g.level === 'up' ? ['up-t', '상승'] : g.level === 'down' ? ['down-t', '하락'] : ['warn-t', '주의'];
      h += '<div class="sig"><span class="tag ' + t[0] + '">' + t[1] + '</span><div><b>' + esc(g.title) + '</b><span>' + esc(g.desc) + '</span></div></div>';
    });
    h += '</section></div>';

    h += '<div class="row">';
    h += '<section class="card grow1" aria-label="광고 효율"><h2>광고 효율</h2>';
    h += '<div><span class="note">톰토미스토어 ROAS (네이버 순매출 ÷ 스토어 광고비)</span><div class="big num">' + (sc.storeRoas === null ? '-' : Math.round(sc.storeRoas * 100).toLocaleString('ko-KR') + '%') + '</div>';
    h += '<span class="note">광고비 ' + won(sc.adStore) + '원 (SA ' + won(sc.adSa) + ' / 메타 ' + won(sc.adMeta) + (sc.adBoost ? ' / 애드부스트 ' + won(sc.adBoost) : '') + ')';
    if (has && sp.storeRoas !== null) h += ', 이전 ROAS ' + Math.round(sp.storeRoas * 100).toLocaleString('ko-KR') + '%';
    h += '</span><br><span class="note">메타 CTR ' + (sc.metaCtr === null ? '-' : (sc.metaCtr * 100).toFixed(2) + '%') + ' (메타는 전환이 네이버에서 일어나 ROAS 대신 CTR로 봅니다)</span></div>';
    h += '<div class="ref"><b>참고 숫자 (실매출 아님)</b><span>쿠팡애즈 ROAS ' + (sc.coupAdRoas === null ? '-' : Math.round(sc.coupAdRoas * 100).toLocaleString('ko-KR') + '%') + ', 광고비 ' + won(sc.coupAdCost) + '원, 전환매출 ' + won(sc.coupAdRev) + '원</span></div></section>';

    h += '<section class="card grow1" aria-label="많이 팔린 SKU"><div class="card-h"><h2>많이 팔린 SKU</h2><span class="hint">네이버, 순 수량</span></div>';
    if (!DATA.skuMap.length || !DATA.orders.length) h += '<span class="note">주문조회 파일과 매핑표가 올라오면 표시됩니다.</span>';
    else {
      var sk = C.skuAggregate(DATA, S.from, S.to).filter(function (o) { return o.net > 0; }).slice(0, 5), top = sk.length ? sk[0].net : 1;
      if (!sk.length) h += '<span class="note">이 기간에 주문이 없습니다.</span>';
      sk.forEach(function (o) {
        h += '<div class="bar-item"><span title="' + esc(o.code) + '">' + esc(o.name || o.code) + '</span><b class="num">' + o.net.toLocaleString('ko-KR') + '</b></div>';
        h += '<div class="bar-track"><div class="bar-fill" style="width:' + Math.max(2, Math.round(o.net / top * 100)) + '%"></div></div>';
      });
      h += '<span class="note">주문일 기준, 취소/반품 제외. 세트는 구성품으로 나눠 셉니다.</span>';
    }
    h += '</section>';

    var hl = C.health(DATA, today());
    function st(label, value, ok) { return '<div class="st"><span class="dot' + (ok ? '' : ' chk') + '"></span><span class="grow">' + label + '</span><b class="' + (ok ? '' : 'chk') + '">' + value + '</b></div>'; }
    h += '<section class="card grow1" aria-label="데이터 상태"><h2>데이터 상태</h2>';
    h += st('네이버 판매 마지막 날짜', mdot(hl.lastNaver), hl.naverStale !== null && hl.naverStale <= 1);
    if (hl.mismatch !== null) h += st('판매와 주문 대조', '불일치 ' + hl.mismatch + '건', hl.mismatch === 0);
    if (hl.unmapped !== null) h += st('옵션 매핑', hl.mapRows + '줄, 누락 ' + hl.unmapped, hl.unmapped === 0);
    else h += st('옵션 매핑', '매핑표 없음', false);
    h += st('주문 데이터', hl.orders.toLocaleString('ko-KR') + '건', hl.orders > 0);
    h += st('광고 마지막 날짜', 'SA ' + mdot(hl.lastSa) + ' / 메타 ' + mdot(hl.lastMeta), true);
    h += '<a class="more" href="index.html">파일 올리기와 데이터 관리 (v5에서 열림)</a></section>';
    h += '</div>';
    return h;
  }

  /* ───────── 표 넘겨보기: 최근 날짜부터 10줄씩 ───────── */
  var PAGE_SIZE_DEF = 10;
  function pageOf(list, size, field) {
    var f = field || 'page', PAGE_SIZE = size || PAGE_SIZE_DEF, pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (!(S[f] >= 0)) S[f] = 0;
    if (S[f] >= pages) S[f] = pages - 1;
    return { rows: list.slice(S[f] * PAGE_SIZE, (S[f] + 1) * PAGE_SIZE), pages: pages, total: list.length, field: f };
  }
  // list = true 이면 날짜가 아닌 목록(품목 등)이라 '이전 / 다음'으로 부른다
  function pagerHtml(pg, list) {
    if (pg.pages <= 1) return '';
    var f = pg.field || 'page', cur = S[f] || 0, at = f === 'page' ? '' : ' data-field="' + f + '"';
    return '<div class="pager"><button type="button" class="chip" data-act="page" data-key="newer"' + at + (cur === 0 ? ' disabled' : '') + '>‹ ' + (list ? '이전' : '더 최근') + '</button>' +
      '<span class="num">' + (cur + 1) + ' / ' + pg.pages + ' <small>(전체 ' + pg.total + (list ? '개' : '줄') + ')</small></span>' +
      '<button type="button" class="chip" data-act="page" data-key="older"' + at + (cur >= pg.pages - 1 ? ' disabled' : '') + '>' + (list ? '다음' : '더 과거') + ' ›</button></div>';
  }

  /* ───────── 매출 ───────── */
  var CHANNELS = [['all', '전체'], ['naver', '네이버'], ['coupang', '쿠팡 입고'], ['other', '기타마켓']];
  var UNIT_NAME = { day: '일', week: '주', month: '월' };
  function n0(v) { return Math.round(v).toLocaleString('ko-KR'); }
  // 채널별 표 구성: 화면 표와 엑셀(CSV)이 같은 정의를 쓴다
  function salesColumns(ch) {
    if (ch === 'naver') return [['결제 건수', 'nOrders'], ['총 판매금액', 'nGross'], ['환불', 'nRefund'], ['순매출', 'nNet', 1], ['광고비', 'adStore'], ['방문', 'nVisits']];
    if (ch === 'coupang') return [['입고 수량', 'coupQty'], ['입고 금액', 'coup', 1], ['쿠팡애즈 광고비 (참고)', 'coupAdCost'], ['쿠팡애즈 전환매출 (참고)', 'coupAdRev']];
    return [['네이버 순매출', 'nNet'], ['쿠팡 입고', 'coup'], ['기타마켓', 'other'], ['실매출', 'total', 1], ['광고비', 'adStore']];
  }
  function salesModel() {
    var cr = cmpRange(), has = !!cr && cr.to >= DATA.first;
    var unit = S.unit === 'auto' ? C.autoUnit(S.from, S.to) : S.unit;
    var rows = C.bucketFull(C.dailyFull(DATA, S.from, S.to), unit);
    var prows = has ? C.bucketFull(C.dailyFull(DATA, cr.from, cr.to), unit) : null;
    return { cr: cr, has: has, unit: unit, rows: rows, prows: prows, t: C.totalFull(rows), pt: has ? C.totalFull(prows) : null };
  }
  function cell(label, value, sub, ref) {
    return '<div class="cell' + (ref ? ' cell-ref' : '') + '"><span class="lab">' + label + '</span><span class="val num">' + value + '</span><span class="sub">' + (sub || '&nbsp;') + '</span></div>';
  }
  function dsub(cur, prev, has) {
    if (!has) return '';
    var d = C.delta(cur, prev);
    if (d.pct === null) return '이전 값 없음';
    return '<span class="' + (d.diff > 0 ? 'up' : d.diff < 0 ? 'down' : '') + '">' + pctText(d.pct) + '</span> 이전 ' + n0(prev);
  }
  function viewSales() {
    var M = salesModel(), ch = S.ch, t = M.t, pt = M.pt, has = M.has, h = '';
    var chName = CHANNELS.filter(function (c) { return c[0] === ch; })[0][1];

    h += '<div class="tabs" role="tablist" aria-label="채널">';
    CHANNELS.forEach(function (c) { h += '<button type="button" role="tab" class="tab" data-act="ch" data-key="' + c[0] + '" aria-selected="' + (c[0] === ch) + '">' + c[1] + '</button>'; });
    h += '</div>';

    // 요약
    h += '<section class="strip" aria-label="' + chName + ' 요약">';
    if (ch === 'naver') {
      h += cell('순매출', n0(t.nNet), dsub(t.nNet, has ? pt.nNet : 0, has));
      h += cell('총 판매금액', n0(t.nGross), dsub(t.nGross, has ? pt.nGross : 0, has));
      h += cell('환불', n0(t.nRefund), '환불률 ' + (t.nGross > 0 ? (t.nRefund / t.nGross * 100).toFixed(1) + '%' : '-'));
      h += cell('결제 건수', n0(t.nOrders), t.nOrders > 0 ? '건당 ' + n0(t.nNet / t.nOrders) + '원' : '');
      h += cell('방문', t.nVisits > 0 ? n0(t.nVisits) : '-', t.nVisits > 0 ? '전환율 ' + (t.nOrders / t.nVisits * 100).toFixed(1) + '%' : '이 기간에는 방문 기록 없음');
    } else if (ch === 'coupang') {
      var top = C.coupangTop(DATA, S.from, S.to);
      h += cell('입고 금액', n0(t.coup), dsub(t.coup, has ? pt.coup : 0, has));
      h += cell('입고 수량', n0(t.coupQty), dsub(t.coupQty, has ? pt.coupQty : 0, has));
      h += cell('입고 품목', top.length + '종', t.coupQty > 0 ? '개당 ' + n0(t.coup / t.coupQty) + '원' : '');
      h += cell('쿠팡애즈 광고비 (참고)', n0(t.coupAdCost), '실매출 아님', 1);
      h += cell('쿠팡애즈 전환매출 (참고)', n0(t.coupAdRev), t.coupAdCost > 0 ? 'ROAS ' + n0(t.coupAdRev / t.coupAdCost * 100) + '%' : '', 1);
    } else if (ch === 'other') {
      var mk = C.otherByMarket(DATA, S.from, S.to);
      h += cell('매출', n0(t.other), dsub(t.other, has ? pt.other : 0, has));
      h += cell('수량', n0(t.otherQty), '');
      h += cell('주문 건수', n0(mk.reduce(function (a, o) { return a + o.count; }, 0)), '');
      h += cell('마켓', mk.length + '곳', '');
    } else {
      h += cell('실매출 합계', n0(t.total), dsub(t.total, has ? pt.total : 0, has));
      h += cell('네이버 순매출', n0(t.nNet), dsub(t.nNet, has ? pt.nNet : 0, has));
      h += cell('쿠팡 입고', n0(t.coup), dsub(t.coup, has ? pt.coup : 0, has));
      h += cell('기타마켓', n0(t.other), dsub(t.other, has ? pt.other : 0, has));
      h += cell('스토어 광고비', n0(t.adStore), t.adStore > 0 ? '스토어 ROAS ' + n0(t.nNet / t.adStore * 100) + '%' : '');
    }
    h += '</section>';
    var defs = { naver: '순매출 = 총 판매금액 - 환불. 환불은 환불이 처리된 날짜에 잡힙니다. 방문 수는 새 판매 파일 양식(2026년 3월 말 이후)에만 있습니다.',
      coupang: '쿠팡은 B2B 납품이라 입고 금액(공급가액)이 실매출입니다. 쿠팡애즈 전환매출은 쿠팡의 소비자 판매액이라 톰토미 매출이 아닙니다.',
      other: '기타마켓은 구글 시트에 적은 주문을 그대로 읽습니다.',
      all: '실매출 = 네이버 순매출 + 쿠팡 입고 + 기타마켓. 광고비는 스토어 광고비(네이버SA + 메타 + 애드부스트)입니다.' };
    h += '<span class="note tight">' + defs[ch] + '</span>';
    if (ch !== 'coupang' && META.otherOk === false) h += '<span class="note tight">기타마켓 구글 시트를 불러오지 못해 0원으로 표시했습니다.</span>';

    // 추이
    var sKey = { all: 'total', naver: 'nNet', coupang: 'coup', other: 'other' }[ch];
    var aKey = { all: 'adStore', naver: 'adStore', coupang: 'coupAdCost', other: '' }[ch];
    function series(rows) { return rows.map(function (o) { return { label: o.label, sales: o[sKey], ad: aKey ? o[aKey] : 0 }; }); }
    var sName = { all: '실매출', naver: '순매출', coupang: '입고 금액', other: '매출' }[ch];
    h += '<section class="card" aria-label="' + sName + ' 추이"><div class="card-h"><h2>' + sName + (aKey ? '과 광고비' : '') + ' 추이</h2><div class="units">';
    [['auto', '자동'], ['day', '일'], ['week', '주'], ['month', '월']].forEach(function (u) { h += '<button type="button" class="chip" data-act="unit" data-key="' + u[0] + '" aria-pressed="' + (S.unit === u[0]) + '">' + u[1] + '</button>'; });
    h += '</div><span class="legend"><span class="lg-line"></span>' + sName + '</span>';
    var ctx = chartCtx(), crow = ctx ? C.bucketFull(C.dailyFull(DATA, ctx.from, ctx.to), 'day') : M.rows;
    if (has && !ctx) h += '<span class="legend"><span class="lg-dash"></span>비교 기간</span>';
    if (ctx) h += '<span class="legend"><span class="lg-hl"></span>조회 기간</span>';
    if (aKey) h += '<span class="legend"><span class="lg-bar"></span>' + (ch === 'coupang' ? '쿠팡애즈 광고비 (참고)' : '광고비') + '</span>';
    h += '</div>' + chartSvg(series(crow), has && !ctx ? series(M.prows) : null, ctx ? hlRange(crow) : null, { line: sName, bar: aKey ? (ch === 'coupang' ? '쿠팡애즈 광고비 (참고)' : '광고비') : '' });
    h += '<span class="note">' + (ctx ? '조회 기간이 짧아 최근 14일 흐름을 함께 보여줍니다. 색칠된 부분이 조회 기간입니다.' : UNIT_NAME[M.unit] + ' 단위' + (S.unit === 'auto' ? ' (기간 길이에 맞춰 자동 선택)' : '') + '.') + ' 차트에 마우스를 올리면 그 날짜의 값이 보입니다.</span></section>';

    // 표 + 옆 목록
    h += '<div class="row">';
    h += '<section class="card grow3 flush" aria-label="기간별 실적"><div class="card-h pad"><h2>' + (ch === 'other' ? '주문 목록' : UNIT_NAME[M.unit] + '별 실적') + '</h2><span class="hint">합계는 조회 기간 전체</span><button type="button" class="chip" data-act="csv">엑셀로 받기 (CSV)</button></div><div class="scroll">';
    if (ch === 'other') {
      var orows = C.otherRows(DATA, S.from, S.to);
      h += '<table class="tbl"><thead><tr><th scope="col">날짜</th><th scope="col">마켓</th><th scope="col">상품</th><th scope="col" class="r">수량</th><th scope="col" class="r">매출</th></tr></thead><tbody>';
      if (!orows.length) h += '<tr><td colspan="5" class="none">이 기간에 기타마켓 주문이 없습니다.</td></tr>';
      var opg = pageOf(orows);
      opg.rows.forEach(function (e) { h += '<tr><th scope="row">' + dot(e.d) + '</th><td>' + esc(e.market) + '</td><td>' + esc(e.product) + '</td><td class="r num">' + n0(e.qty) + '</td><td class="r num b">' + n0(e.amount) + '</td></tr>'; });
      if (orows.length) h += '<tr class="sum"><th scope="row">합계</th><td></td><td></td><td class="r num">' + n0(t.otherQty) + '</td><td class="r num b">' + n0(t.other) + '</td></tr>';
      h += '</tbody></table>' + pagerHtml(opg);
    } else {
      var cols = salesColumns(ch), list = M.rows.slice().reverse(), pg = pageOf(list);
      h += '<table class="tbl"><thead><tr><th scope="col">' + (M.unit === 'day' ? '날짜' : '기간') + '</th>';
      cols.forEach(function (c) { h += '<th scope="col" class="r">' + c[0] + '</th>'; });
      h += '</tr></thead><tbody>';
      pg.rows.forEach(function (o) {
        h += '<tr><th scope="row">' + (M.unit === 'day' ? dot(o.key) : esc(o.label)) + '</th>';
        cols.forEach(function (c) { var v = o[c[1]]; h += '<td class="r num' + (c[2] ? ' b' : '') + '">' + (v ? n0(v) : '<span class="zero">0</span>') + '</td>'; });
        h += '</tr>';
      });
      h += '<tr class="sum"><th scope="row">합계</th>';
      cols.forEach(function (c) { h += '<td class="r num' + (c[2] ? ' b' : '') + '">' + n0(t[c[1]]) + '</td>'; });
      h += '</tr></tbody></table>';
      h += pagerHtml(pg);
    }
    h += '</div></section>';

    h += '<section class="card grow2 flush" aria-label="상세 목록">';
    if (ch === 'coupang') {
      var tp = C.coupangTop(DATA, S.from, S.to);
      h += '<div class="card-h pad"><h2>많이 입고된 품목</h2><span class="hint">입고 금액 순</span></div>';
      if (!tp.length) h += '<p class="note pad">이 기간에 입고가 없습니다.</p>';
      tp.slice(0, 8).forEach(function (o) { h += '<div class="li"><span title="' + esc(o.name) + '">' + esc(o.name) + '</span><span class="num sub2">' + n0(o.qty) + '개</span><b class="num">' + n0(o.amount) + '</b></div>'; });
    } else if (ch === 'other') {
      var mk2 = C.otherByMarket(DATA, S.from, S.to);
      h += '<div class="card-h pad"><h2>마켓별 매출</h2></div>';
      if (!mk2.length) h += '<p class="note pad">이 기간에 기타마켓 주문이 없습니다.</p>';
      mk2.forEach(function (o) { h += '<div class="li"><span>' + esc(o.market) + '</span><span class="num sub2">' + n0(o.count) + '건</span><b class="num">' + n0(o.amount) + '</b></div>'; });
    } else if (ch === 'all') {
      h += '<div class="card-h pad"><h2>채널 비중</h2><span class="hint">실매출 기준</span></div>';
      [['네이버 순매출', t.nNet], ['쿠팡 입고', t.coup], ['기타마켓', t.other]].forEach(function (c) {
        var share = t.total > 0 ? c[1] / t.total : 0;
        h += '<div class="li"><span>' + c[0] + '</span><span class="num sub2">' + (share * 100).toFixed(1) + '%</span><b class="num">' + n0(c[1]) + '</b></div><div class="bar-track mx"><div class="bar-fill" style="width:' + Math.max(0, Math.min(100, share * 100)).toFixed(1) + '%"></div></div>';
      });
    } else {
      h += '<div class="card-h pad"><h2>많이 팔린 SKU</h2><span class="hint">순 수량' + (has ? ', 비교 기간 대비' : '') + '</span></div>';
      if (!DATA.skuMap.length || !DATA.orders.length) h += '<p class="note pad">주문조회 파일과 매핑표가 올라오면 표시됩니다.</p>';
      else {
        var sk = C.skuAggregate(DATA, S.from, S.to).filter(function (o) { return o.net > 0; }).slice(0, 8), pm = {};
        if (has) C.skuAggregate(DATA, M.cr.from, M.cr.to).forEach(function (o) { pm[o.code] = o.net; });
        if (!sk.length) h += '<p class="note pad">이 기간에 주문이 없습니다.</p>';
        sk.forEach(function (o) {
          var df = o.net - (pm[o.code] || 0);
          h += '<div class="li"><span title="' + esc(o.code) + '">' + esc(o.name || o.code) + '</span>' + (has ? '<span class="num sub2 ' + (df > 0 ? 'up' : df < 0 ? 'down' : '') + '">' + (df > 0 ? '+' : '') + n0(df) + '</span>' : '') + '<b class="num">' + n0(o.net) + '</b></div>';
        });
        h += '<p class="note pad">주문일 기준, 취소/반품 제외. 세트는 구성품으로 나눠 셉니다.</p>';
      }
    }
    h += '</section></div>';
    return h;
  }

  // 화면의 표와 같은 내용을 CSV로 내려받는다 (엑셀에서 바로 열림)
  function downloadCsv() {
    var M = salesModel(), ch = S.ch, lines = [];
    function q(v) { v = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    if (ch === 'other') {
      lines.push(['날짜', '마켓', '상품', '품번', '수량', '매출']);
      C.otherRows(DATA, S.from, S.to).forEach(function (e) { lines.push([e.d, e.market, e.product, e.code, e.qty, e.amount]); });
    } else {
      var cols = salesColumns(ch);
      lines.push([M.unit === 'day' ? '날짜' : '기간 시작', M.unit === 'day' ? '' : '기간 끝'].filter(Boolean).concat(cols.map(function (c) { return c[0]; })));
      M.rows.forEach(function (o) { lines.push((M.unit === 'day' ? [o.key] : [o.from, o.to]).concat(cols.map(function (c) { return Math.round(o[c[1]]); }))); });
      lines.push((M.unit === 'day' ? ['합계'] : ['합계', '']).concat(cols.map(function (c) { return Math.round(M.t[c[1]]); })));
    }
    var csv = '﻿' + lines.map(function (r) { return r.map(q).join(','); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'tomtomi_sales_' + ch + '_' + S.from + '_' + S.to + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ───────── 광고 ───────── */
  var MEDIA = [['store', '스토어 광고 전체'], ['sa', '네이버SA'], ['meta', '메타'], ['boost', '애드부스트'], ['coupang', '쿠팡애즈 (참고)']];
  function pct1(v) { return v === null ? '-' : (v * 100).toFixed(2) + '%'; }
  function roasText(v) { return v === null ? '-' : n0(v * 100) + '%'; }
  // 매체별 표 구성: [열 이름, 값 함수, 표시 방식, 강조]. 화면 표와 CSV가 함께 쓴다.
  function adsColumns(md) {
    var R = C.ratio;
    if (md === 'sa') return [['광고비', function (o) { return o.saCost; }, 'n', 1], ['노출', function (o) { return o.saImp; }, 'n'], ['클릭', function (o) { return o.saClicks; }, 'n'],
      ['CTR', function (o) { return R(o.saClicks, o.saImp); }, 'p'], ['CPC', function (o) { return R(o.saCost, o.saClicks); }, 'n'], ['전환수', function (o) { return o.saConv; }, 'n'],
      ['전환매출', function (o) { return o.saRev; }, 'n'], ['ROAS', function (o) { return R(o.saRev, o.saCost); }, 'r']];
    if (md === 'meta') return [['광고비', function (o) { return o.metaCost; }, 'n', 1], ['노출', function (o) { return o.metaImp; }, 'n'], ['도달', function (o) { return o.metaReach; }, 'n'],
      ['클릭', function (o) { return o.metaClicks; }, 'n'], ['CTR', function (o) { return R(o.metaClicks, o.metaImp); }, 'p'], ['CPC', function (o) { return R(o.metaCost, o.metaClicks); }, 'n']];
    if (md === 'boost') return [['광고비', function (o) { return o.boostCost; }, 'n', 1], ['노출', function (o) { return o.boostImp; }, 'n'], ['클릭', function (o) { return o.boostClicks; }, 'n'],
      ['CTR', function (o) { return R(o.boostClicks, o.boostImp); }, 'p'], ['전환수', function (o) { return o.boostConv; }, 'n']];
    if (md === 'coupang') return [['광고비', function (o) { return o.coupCost; }, 'n', 1], ['노출', function (o) { return o.coupImp; }, 'n'], ['클릭', function (o) { return o.coupClicks; }, 'n'],
      ['CTR', function (o) { return R(o.coupClicks, o.coupImp); }, 'p'], ['전환수', function (o) { return o.coupConv; }, 'n'], ['전환매출 (참고)', function (o) { return o.coupRev; }, 'n'], ['ROAS (참고)', function (o) { return R(o.coupRev, o.coupCost); }, 'r']];
    return [['네이버SA', function (o) { return o.saCost; }, 'n'], ['메타', function (o) { return o.metaCost; }, 'n'], ['애드부스트', function (o) { return o.boostCost; }, 'n'],
      ['스토어 광고비', function (o) { return o.store; }, 'n', 1], ['네이버 순매출', function (o) { return o.nNet; }, 'n'], ['스토어 ROAS', function (o) { return R(o.nNet, o.store); }, 'r']];
  }
  function fmtBy(v, kind) {
    if (v === null || v === undefined) return '-';
    if (kind === 'p') return (v * 100).toFixed(2) + '%';
    if (kind === 'r') return n0(v * 100) + '%';
    return n0(v);
  }
  function adsModel() {
    var cr = cmpRange(), has = !!cr && cr.to >= DATA.first;
    var unit = S.unit === 'auto' ? C.autoUnit(S.from, S.to) : S.unit;
    var rows = C.adsBucket(C.adsDaily(DATA, S.from, S.to), unit);
    var prows = has ? C.adsBucket(C.adsDaily(DATA, cr.from, cr.to), unit) : null;
    return { cr: cr, has: has, unit: unit, rows: rows, prows: prows, t: C.adsTotal(rows), pt: has ? C.adsTotal(prows) : null };
  }
  function adViewToggle() {
    var h = '<div class="viewtoggle" role="group" aria-label="광고 보기 방식">';
    [['camp', '캠페인 기준'], ['item', '상품 기준']].forEach(function (v) { h += '<button type="button" class="chip" data-act="adview" data-key="' + v[0] + '" aria-pressed="' + (S.adView === v[0]) + '">' + v[1] + '</button>'; });
    return h + '</div>';
  }
  function viewAds() {
    if (S.adView === 'item') return adViewToggle() + viewAdItem();
    var M = adsModel(), md = S.ad, t = M.t, pt = M.pt, has = M.has, R = C.ratio, h = adViewToggle();
    var mdName = MEDIA.filter(function (c) { return c[0] === md; })[0][1];
    h += '<div class="tabs" role="tablist" aria-label="광고 매체">';
    MEDIA.forEach(function (c) { h += '<button type="button" role="tab" class="tab" data-act="ad" data-key="' + c[0] + '" aria-selected="' + (c[0] === md) + '">' + c[1] + '</button>'; });
    h += '</div>';

    function rsub(cur, prev, kind) { // 비율 지표의 이전 값 표시 (kind: 'r' ROAS, 'p' CTR)
      if (!has || prev === null || cur === null) return '';
      return '이전 ' + fmtBy(prev, kind);
    }
    h += '<section class="strip" aria-label="' + mdName + ' 요약">';
    if (md === 'sa') {
      h += cell('광고비', n0(t.saCost), dsub(t.saCost, has ? pt.saCost : 0, has));
      h += cell('전환매출', n0(t.saRev), dsub(t.saRev, has ? pt.saRev : 0, has));
      h += cell('ROAS', roasText(R(t.saRev, t.saCost)), rsub(R(t.saRev, t.saCost), has ? R(pt.saRev, pt.saCost) : null, 'r'));
      h += cell('클릭', n0(t.saClicks), 'CPC ' + fmtBy(R(t.saCost, t.saClicks), 'n') + '원');
      h += cell('CTR', pct1(R(t.saClicks, t.saImp)), '노출 ' + n0(t.saImp) + ', 전환 ' + n0(t.saConv) + '건');
    } else if (md === 'meta') {
      h += cell('광고비', n0(t.metaCost), dsub(t.metaCost, has ? pt.metaCost : 0, has));
      h += cell('CTR', pct1(R(t.metaClicks, t.metaImp)), rsub(R(t.metaClicks, t.metaImp), has ? R(pt.metaClicks, pt.metaImp) : null, 'p'));
      h += cell('클릭', n0(t.metaClicks), dsub(t.metaClicks, has ? pt.metaClicks : 0, has));
      h += cell('CPC', fmtBy(R(t.metaCost, t.metaClicks), 'n'), '클릭 1회당 비용(원)');
      h += cell('노출', n0(t.metaImp), '도달 ' + n0(t.metaReach));
    } else if (md === 'boost') {
      h += cell('광고비', n0(t.boostCost), dsub(t.boostCost, has ? pt.boostCost : 0, has));
      h += cell('클릭', n0(t.boostClicks), 'CTR ' + pct1(R(t.boostClicks, t.boostImp)));
      h += cell('노출', n0(t.boostImp), '');
      h += cell('전환수', n0(t.boostConv), '');
    } else if (md === 'coupang') {
      h += cell('광고비 (참고)', n0(t.coupCost), dsub(t.coupCost, has ? pt.coupCost : 0, has), 1);
      h += cell('전환매출 (참고)', n0(t.coupRev), dsub(t.coupRev, has ? pt.coupRev : 0, has), 1);
      h += cell('ROAS (참고)', roasText(R(t.coupRev, t.coupCost)), rsub(R(t.coupRev, t.coupCost), has ? R(pt.coupRev, pt.coupCost) : null, 'r'), 1);
      h += cell('클릭', n0(t.coupClicks), 'CTR ' + pct1(R(t.coupClicks, t.coupImp)), 1);
      h += cell('전환수', n0(t.coupConv), '노출 ' + n0(t.coupImp), 1);
    } else {
      h += cell('스토어 광고비', n0(t.store), dsub(t.store, has ? pt.store : 0, has));
      h += cell('스토어 ROAS', roasText(R(t.nNet, t.store)), rsub(R(t.nNet, t.store), has ? R(pt.nNet, pt.store) : null, 'r'));
      h += cell('네이버 순매출', n0(t.nNet), dsub(t.nNet, has ? pt.nNet : 0, has));
      h += cell('매출 대비 광고비', t.nNet > 0 ? (t.store / t.nNet * 100).toFixed(1) + '%' : '-', '순매출 100원당 광고비');
      h += cell('메타 CTR', pct1(R(t.metaClicks, t.metaImp)), rsub(R(t.metaClicks, t.metaImp), has ? R(pt.metaClicks, pt.metaImp) : null, 'p'));
    }
    h += '</section>';
    var defs = {
      store: '스토어 광고비 = 네이버SA + 메타 + 애드부스트. 스토어 ROAS = 네이버 순매출 ÷ 스토어 광고비 (광고를 거치지 않은 매출도 포함된 값입니다).',
      sa: '전환매출과 ROAS는 네이버 광고가 직접 집계한 값입니다 (광고를 누른 뒤 일어난 구매).',
      meta: '메타는 구매가 네이버에서 일어나 전환을 잴 수 없습니다. 그래서 ROAS 대신 CTR(노출 대비 클릭)로 봅니다.',
      boost: '애드부스트는 집행한 날짜에만 기록이 있습니다.',
      coupang: '쿠팡애즈 전환매출은 쿠팡의 소비자 판매액입니다. 톰토미 실매출(쿠팡 입고)이 아니므로 참고로만 봅니다.' };
    h += '<span class="note tight">' + defs[md] + '</span>';

    // 추이: 막대는 광고비, 선은 매체별 대표 성과
    var spec = { store: ['nNet', 'store', '네이버 순매출', '원'], sa: ['saRev', 'saCost', 'SA 전환매출', '원'], meta: ['metaClicks', 'metaCost', '클릭', '회'],
      boost: ['boostClicks', 'boostCost', '클릭', '회'], coupang: ['coupRev', 'coupCost', '전환매출 (참고)', '원'] }[md];
    function series(rows) { return rows.map(function (o) { return { label: o.label, key: o.key, sales: o[spec[0]], ad: o[spec[1]] }; }); }
    var ctx = chartCtx(), crow = ctx ? C.adsBucket(C.adsDaily(DATA, ctx.from, ctx.to), 'day') : M.rows;
    h += '<section class="card" aria-label="광고비 추이"><div class="card-h"><h2>광고비와 ' + spec[2] + ' 추이</h2><div class="units">';
    [['auto', '자동'], ['day', '일'], ['week', '주'], ['month', '월']].forEach(function (u) { h += '<button type="button" class="chip" data-act="unit" data-key="' + u[0] + '" aria-pressed="' + (S.unit === u[0]) + '">' + u[1] + '</button>'; });
    h += '</div><span class="legend"><span class="lg-line"></span>' + spec[2] + ' (왼쪽 눈금)</span>';
    if (has && !ctx) h += '<span class="legend"><span class="lg-dash"></span>비교 기간</span>';
    if (ctx) h += '<span class="legend"><span class="lg-hl"></span>조회 기간</span>';
    h += '<span class="legend"><span class="lg-bar"></span>광고비 (오른쪽 눈금)</span></div>';
    h += chartSvg(series(crow), has && !ctx ? series(M.prows) : null, ctx ? hlRange(crow) : null, { line: spec[2], bar: '광고비', unit: spec[3] });
    h += '<span class="note">' + (ctx ? '조회 기간이 짧아 최근 14일 흐름을 함께 보여줍니다. 색칠된 부분이 조회 기간입니다.' : UNIT_NAME[M.unit] + ' 단위' + (S.unit === 'auto' ? ' (기간 길이에 맞춰 자동 선택)' : '') + '.') + ' 차트에 마우스를 올리면 그 날짜의 값이 보입니다.</span></section>';

    // 표
    var cols = adsColumns(md), list = M.rows.slice().reverse(), pg = pageOf(list);
    h += '<div class="row"><section class="card grow3 flush" aria-label="기간별 광고 실적"><div class="card-h pad"><h2>' + UNIT_NAME[M.unit] + '별 실적</h2><span class="hint">합계는 조회 기간 전체</span><button type="button" class="chip" data-act="adcsv">엑셀로 받기 (CSV)</button></div><div class="scroll">';
    h += '<table class="tbl"><thead><tr><th scope="col">' + (M.unit === 'day' ? '날짜' : '기간') + '</th>';
    cols.forEach(function (c) { h += '<th scope="col" class="r">' + c[0] + '</th>'; });
    h += '</tr></thead><tbody>';
    pg.rows.forEach(function (o) {
      h += '<tr><th scope="row">' + (M.unit === 'day' ? dot(o.key) : esc(o.label)) + '</th>';
      cols.forEach(function (c) { var v = c[1](o); h += '<td class="r num' + (c[3] ? ' b' : '') + '">' + (v === 0 ? '<span class="zero">0</span>' : fmtBy(v, c[2])) + '</td>'; });
      h += '</tr>';
    });
    h += '<tr class="sum"><th scope="row">합계</th>';
    cols.forEach(function (c) { h += '<td class="r num' + (c[3] ? ' b' : '') + '">' + fmtBy(c[1](t), c[2]) + '</td>'; });
    h += '</tr></tbody></table>';
    h += pagerHtml(pg);
    h += '</div></section>';

    // 옆 목록
    h += '<section class="card grow2 flush" aria-label="상세 목록">';
    if (md === 'store') {
      h += '<div class="card-h pad"><h2>매체별 광고비</h2><span class="hint">스토어 광고비 기준</span></div>';
      [['네이버SA', t.saCost], ['메타', t.metaCost], ['애드부스트', t.boostCost]].forEach(function (c) {
        var share = t.store > 0 ? c[1] / t.store : 0;
        h += '<div class="li"><span>' + c[0] + '</span><span class="num sub2">' + (share * 100).toFixed(1) + '%</span><b class="num">' + n0(c[1]) + '</b></div><div class="bar-track mx"><div class="bar-fill" style="width:' + (share * 100).toFixed(1) + '%"></div></div>';
      });
      h += '<div class="ref" style="margin:12px 18px 16px"><b>참고 숫자 (실매출 아님)</b><span>쿠팡애즈 광고비 ' + n0(t.coupCost) + '원, 전환매출 ' + n0(t.coupRev) + '원, ROAS ' + roasText(R(t.coupRev, t.coupCost)) + '</span></div>';
    } else if (md === 'boost') {
      h += '<div class="card-h pad"><h2>세부 구분</h2></div><p class="note pad">애드부스트는 하루 합계만 기록되어 세부 구분이 없습니다.</p>';
    } else {
      var bd = C.adsBreakdown(DATA, md, S.from, S.to), isMeta = md === 'meta';
      h += '<div class="card-h pad"><h2>' + (isMeta ? '광고 세트별' : '캠페인별') + '</h2><span class="hint">광고비 순, ' + (isMeta ? 'CTR' : 'ROAS') + '</span></div>';
      if (!bd.length) h += '<p class="note pad">이 기간에 집행 기록이 없습니다.</p>';
      bd.slice(0, 10).forEach(function (o) {
        var k = isMeta ? pct1(R(o.clicks, o.imp)) : roasText(R(o.rev, o.cost));
        h += '<div class="li"><span title="' + esc(o.name) + '">' + esc(o.name) + '</span><span class="num sub2">' + k + '</span><b class="num">' + n0(o.cost) + '</b></div>';
      });
      if (bd.length > 10) h += '<p class="note pad">광고비 상위 10개만 표시 (전체 ' + bd.length + '개)</p>';
      if (md === 'sa' && bd.some(function (o) { return o.name === '(구분 없음)'; })) h += '<p class="note pad">네이버SA는 2026-04-15 이후 하루 합계만 저장되어 캠페인 구분이 없습니다. 캠페인별로 보려면 저장 방식을 바꿔야 합니다.</p>';
      if (md === 'coupang' && bd.some(function (o) { return o.name === '(구분 없음)'; })) h += '<p class="note pad">일부 기간은 하루 합계만 저장되어 캠페인 구분이 없습니다.</p>';
    }
    h += '</section></div>';
    if (md === 'sa' || md === 'coupang') h += adTreeHtml(md);
    return h;
  }
  /* ───────── 상품 기준 보기: 품목 하나 × 날짜 × 광고 ─────────
   * 기간 동안 몇 개가 팔렸고(전체 판매), 그중 광고로 몇 개가 팔렸는지(광고 판매)를 날짜별로 본다.
   */
  function dowOf(d) { var p = d.split('-'); return ['일', '월', '화', '수', '목', '금', '토'][new Date(+p[0], +p[1] - 1, +p[2]).getDay()]; }
  var AIC = { key: '', v: null };
  function aiCache(k, f) { if (AIC.key !== k) AIC = { key: k, v: f() }; return AIC.v; }
  function itemQtyRange(key, from, to) { // 그 품목의 전체 판매 수량, 매출 (네이버 + 쿠팡 입고 + 기타몰)
    if (key.indexOf('MULTI:') === 0) return null;
    var r = C.items(DATA, from, to).rows[key]; if (!r) return { qty: 0, rev: 0 };
    return { qty: r.ch.naver.qty + r.ch.coupang.qty + r.ch.other.qty, rev: r.ch.naver.rev + r.ch.coupang.rev + r.ch.other.rev };
  }
  function aiLabel(key) {
    if (key.indexOf('MULTI:') === 0) { var p = C.pageCodes(DATA)[key.slice(6)], cr = null; Object.keys(DATA.adDet.creatives).some(function (a) { if (DATA.adDet.creatives[a].mall === key.slice(6)) { cr = DATA.adDet.creatives[a]; return true; } return false; }); return '여러 품목: ' + (cr ? cr.name : '판매 페이지 ' + key.slice(6)) + (p ? ' (' + p.codes.slice(0, 4).join(', ') + ')' : ''); }
    return (key.indexOf('CP:') === 0 ? '코드 없음' : key) + ' ' + itemName(itemModel(S.from, S.to), key);
  }
  // 품목 검색 결과: 이 기간 광고가 있었던 품목(광고비 순) 먼저, 그다음 나머지 품목
  function aiCandidates(list) {
    var seen = {}, out = [];
    list.forEach(function (o) { seen[o.key] = 1; out.push({ key: o.key, cost: o.cost }); });
    itemOrder().forEach(function (c) { if (!seen[c]) out.push({ key: c, cost: 0 }); });
    return out;
  }
  function aiSuggest(list) {
    var q = S.aiq.trim().toLowerCase(); if (!q) return '';
    var words = q.split(/\s+/), hits = aiCandidates(list).filter(function (o) { var t = aiLabel(o.key).toLowerCase(); return words.every(function (w) { return t.indexOf(w) >= 0; }); }).slice(0, 8);
    if (!hits.length) return '<div class="aisug-none">검색 결과가 없습니다</div>';
    return hits.map(function (o, i) { return '<button type="button" role="option" class="aisug-i' + (i === 0 ? ' first' : '') + '" data-act="aipick" data-key="' + esc(o.key) + '"><span>' + esc(aiLabel(o.key)) + '</span><small>' + (o.cost ? '광고비 ' + n0(o.cost) + '원' : '이 기간 광고 없음') + '</small></button>'; }).join('');
  }
  var AILIST = [];
  function viewAdItem() {
    var h = '', md = S.amd, cr = cmpRange(), has = !!cr;
    var list = aiCache('list|' + md + '|' + S.from + '|' + S.to, function () { return C.adItemList(DATA, S.from, S.to, md); }); AILIST = list;
    if (!S.aitem || !list.some(function (o) { return o.key === S.aitem; })) { if (!S.aitem && list.length) S.aitem = list[0].key; }
    var key = S.aitem;
    h += '<div class="tabs" role="tablist" aria-label="광고 매체">';
    [['all', '전체'], ['sa', '네이버 SA'], ['coupang', '쿠팡애즈']].forEach(function (c) { h += '<button type="button" role="tab" class="tab" data-act="amd" data-key="' + c[0] + '" aria-selected="' + (md === c[0]) + '">' + c[1] + '</button>'; });
    h += '</div>';
    h += '<section class="card" aria-label="품목 고르기"><div class="aipick"><label for="aiq">품목</label><div class="aibox">';
    h += '<input id="aiq" type="search" data-act="aiq" value="' + esc(S.aiq) + '" placeholder="품목코드나 품목명으로 검색 (예: 캐롤, SOCD-0320)" autocomplete="off" aria-autocomplete="list" aria-controls="aisug">';
    h += '<div id="aisug" class="aisug" role="listbox"' + (S.aiq.trim() ? '' : ' hidden') + '>' + aiSuggest(list) + '</div></div></div>';
    h += key ? '<p class="aicur">지금 보는 품목: <b>' + esc(aiLabel(key)) + '</b>' + (list.some(function (o) { return o.key === key; }) ? '' : ' <span class="zero">(이 기간 광고 없음)</span>') + '</p>' : '<p class="note">품목을 검색해서 골라 주세요.</p>';
    h += '</section>';
    // 상세(캠페인 ▸ 광고그룹 ▸ 상품)가 없는 날짜는 품목에 연결할 수 없어 0으로 보인다. 숫자가 0인 이유를 먼저 알려 준다
    var warn = '';
    (md === 'all' ? ['sa', 'coupang'] : [md]).forEach(function (m) { var c = adCoverHtml(m); if (c.indexOf('class="cover pad"') >= 0) warn += '<div class="covwrap"><b class="covname">' + (m === 'sa' ? '네이버 SA' : '쿠팡애즈') + '</b>' + c + '</div>'; });
    if (md !== 'coupang') warn += saCreativeNote();
    if (warn) h += '<section class="card flush" aria-label="상세 데이터 안내"><div class="card-h pad"><h2>⚠️ 이 기간에는 품목까지 연결되지 않는 광고가 있습니다</h2><span class="hint">아래 날짜의 광고비와 광고매출은 이 화면에 0으로 보입니다</span></div>' + warn + '</section>';
    if (!key) return h;

    var rows = aiCache('d|' + key + '|' + md + '|' + S.from + '|' + S.to, function () { return C.adItemDaily(DATA, key, S.from, S.to, md); });
    var prow = has ? aiCache('p|' + key + '|' + md + '|' + cr.from + '|' + cr.to, function () { return C.adItemDaily(DATA, key, cr.from, cr.to, md); }) : null;
    function sum(rs) { var t = { cost: 0, rev: 0, qty: 0, clicks: 0, imp: 0 }; (rs || []).forEach(function (o) { t.cost += o.cost; t.rev += o.rev; t.qty += o.qty; t.clicks += o.clicks; t.imp += o.imp; }); return t; }
    var t = sum(rows), pt = sum(prow), multi = key.indexOf('MULTI:') === 0;
    var tq = itemQtyRange(key, S.from, S.to), pq = has ? itemQtyRange(key, cr.from, cr.to) : null;
    var qName = md === 'sa' ? '광고 전환 (건)' : md === 'all' ? '광고로 팔린 수량' : '광고로 팔린 수량';
    h += '<section class="strip" aria-label="품목 광고 요약">';
    h += cell('전체 판매 수량', tq ? n0(tq.qty) + '개' : '-', tq && has ? dsub(tq.qty, pq.qty, true) : multi ? '여러 품목 판매 페이지라 전체 수량은 품목별로 봐 주세요' : '네이버 + 쿠팡 입고 + 기타몰');
    h += cell(qName, n0(t.qty) + (md === 'sa' ? '건' : '개'), dsub(t.qty, pt.qty, has));
    h += cell('광고 비중', tq && tq.qty > 0 ? pctOf(Math.min(t.qty, tq.qty), tq.qty) : '-', '전체 판매 중 광고로 팔린 몫');
    h += cell('광고비', n0(t.cost), dsub(t.cost, pt.cost, has));
    h += cell('광고매출', n0(t.rev), dsub(t.rev, pt.rev, has));
    h += cell('ROAS', roasText(C.ratio(t.rev, t.cost)), has ? '이전 ' + roasText(C.ratio(pt.rev, pt.cost)) : '');
    h += '</section>';
    h += '<span class="note tight">광고비는 이 품목을 광고한 비용, 광고매출과 광고 판매는 광고를 보고 이 품목이 실제로 팔린 것 (다른 상품 광고를 보고 산 경우 포함)' + (md !== 'coupang' ? '. 네이버 SA는 판매 수량 대신 전환수(건)로 셉니다.' : '.') + ' 전체 판매의 쿠팡 몫은 쿠팡 입고(발주) 수량이라 소비자 판매와 날짜가 다를 수 있습니다.</span>';

    // 차트: 전체 판매 수량(선, 비교 기간 점선) + 광고비(막대)
    var byMonth = rows.length > 62, ser = [], pser = [];
    function bucketize(rs, from) {
      var out = [], m = {};
      rs.forEach(function (o) { var k = byMonth ? o.d.slice(0, 7) : o.d; if (!m[k]) { m[k] = { label: byMonth ? k.slice(2, 4) + '.' + k.slice(5, 7) : o.d.slice(5, 7) + '.' + o.d.slice(8, 10), key: k, from: o.d, to: o.d, ad: 0, adq: 0 }; out.push(m[k]); } m[k].to = o.d; m[k].ad += o.cost; m[k].adq += o.qty; });
      return out;
    }
    ser = bucketize(rows); if (prow) pser = bucketize(prow);
    var qcache = aiCache('q|' + key + '|' + S.from + '|' + S.to + '|' + (cr ? cr.from : ''), function () {
      return { c: ser.map(function (b) { var q = itemQtyRange(key, b.from, b.to); return q ? q.qty : 0; }), p: pser.map(function (b) { var q = itemQtyRange(key, b.from, b.to); return q ? q.qty : 0; }) };
    });
    ser.forEach(function (b, i) { b.sales = qcache.c[i]; }); pser.forEach(function (b, i) { b.sales = qcache.p[i]; });
    h += '<section class="card" aria-label="품목 추이"><div class="card-h"><h2>' + esc(aiLabel(key)) + '</h2><span class="legend"><span class="lg-line"></span>전체 판매 수량</span>' + (has ? '<span class="legend"><span class="lg-dash"></span>비교 기간</span>' : '') + '<span class="legend"><span class="lg-bar"></span>광고비</span></div>';
    h += ser.length >= 2 ? chartSvg(ser, has ? pser : null, null, { line: '전체 판매', bar: '광고비', unit: '개', barUnit: '원' }) : '<p class="note">조회 기간이 하루라서 차트는 생략했습니다.</p>';
    h += '<span class="note">' + (byMonth ? '월별' : '날짜별') + (multi ? '. 여러 품목 판매 페이지는 전체 판매 수량을 품목별로 나눌 수 없어 0으로 보입니다.' : '') + '</span></section>';

    // 날짜별 표 (최근부터 10줄)
    var list2 = rows.slice().reverse(), pg = pageOf(list2, 10, 'apage');
    h += '<section class="card flush" aria-label="날짜별 광고 성과"><div class="card-h pad"><h2>날짜별</h2><span class="hint">날짜를 누르면 그날 어느 캠페인, 광고그룹이었는지 펼쳐집니다' + (has ? '. 비교 칸은 비교 기간의 같은 순번 날짜' : '') + '</span></div><div class="scroll">';
    h += '<table class="tbl wrap"><thead><tr><th scope="col">날짜</th><th scope="col" class="r">광고비</th><th scope="col" class="r">광고매출</th><th scope="col" class="r">ROAS</th><th scope="col" class="r">' + (md === 'sa' ? '광고 전환' : '광고 판매') + '</th><th scope="col" class="r">전체 판매</th><th scope="col" class="r">광고 비중</th>' + (has ? '<th scope="col" class="r">비교: 전체 / 광고 판매</th>' : '') + '</tr></thead><tbody>';
    pg.rows.forEach(function (o) {
      var q = itemQtyRange(key, o.d, o.d), open = !!S.aopen[o.d], idx = C.dayDiff(S.from, o.d), pd = has ? C.addDays(cr.from, idx) : null, po = prow && prow[idx], pq2 = pd && pd <= cr.to ? itemQtyRange(key, pd, pd) : null;
      var zero = !o.cost && !o.rev && !(q && q.qty);
      h += '<tr' + (zero ? ' class="zero-row"' : '') + '><th scope="row">' + (o.lines.length ? '<button type="button" class="exp" data-act="aopen" data-key="' + o.d + '" aria-expanded="' + open + '">' + (open ? '▾ ' : '▸ ') + dot(o.d) + ' ' + dowOf(o.d) + '</button>' : '<span class="iname">' + dot(o.d) + ' ' + dowOf(o.d) + '</span>') + '</th>';
      h += '<td class="r num b">' + n0(o.cost) + '</td><td class="r num">' + n0(o.rev) + '</td><td class="r num">' + roasText(C.ratio(o.rev, o.cost)) + '</td><td class="r num b">' + n0(o.qty) + '</td><td class="r num">' + (q ? n0(q.qty) : '-') + '</td><td class="r num">' + (q && q.qty > 0 ? pctOf(Math.min(o.qty, q.qty), q.qty) : '-') + '</td>';
      if (has) h += '<td class="r num">' + (pq2 ? n0(pq2.qty) : '-') + ' / ' + (po ? n0(po.qty) : '-') + ' <small class="zero">' + (pd && pd <= cr.to ? dot(pd).slice(5) : '') + '</small></td>';
      h += '</tr>';
      if (open) o.lines.forEach(function (l) { h += '<tr class="subrow"><th scope="row">└ ' + (l.medium === 'sa' ? '네이버' : '쿠팡') + ' / ' + esc(l.camp) + ' / ' + esc(l.group) + '</th><td class="r num">' + n0(l.cost) + '</td><td class="r num">' + n0(l.rev) + '</td><td class="r num">' + roasText(C.ratio(l.rev, l.cost)) + '</td><td class="r num">' + n0(l.qty) + '</td><td></td><td></td>' + (has ? '<td></td>' : '') + '</tr>'; });
    });
    h += '<tr class="sum"><th scope="row">합계</th><td class="r num b">' + n0(t.cost) + '</td><td class="r num">' + n0(t.rev) + '</td><td class="r num">' + roasText(C.ratio(t.rev, t.cost)) + '</td><td class="r num b">' + n0(t.qty) + '</td><td class="r num">' + (tq ? n0(tq.qty) : '-') + '</td><td class="r num">' + (tq && tq.qty > 0 ? pctOf(Math.min(t.qty, tq.qty), tq.qty) : '-') + '</td>' + (has ? '<td class="r num">' + (pq ? n0(pq.qty) : '-') + ' / ' + n0(pt.qty) + '</td>' : '') + '</tr>';
    h += '</tbody></table>' + pagerHtml(pg) + '</div></section>';
    return h;
  }

  /* ───────── 캠페인 ▸ 광고그룹 ▸ 상품 ───────── */
  var ATCACHE = { key: '', T: null };
  function adTreeModel(md) {
    var basis = md === 'coupang' ? S.acBasis : 'ad', key = md + '|' + basis + '|' + S.from + '|' + S.to;
    if (ATCACHE.key !== key) ATCACHE = { key: key, T: C.adTree(DATA, md, S.from, S.to, basis) };
    return ATCACHE.T;
  }
  function adItemLabel(T, key) {
    var X = itemModel(S.from, S.to), muted = function (t) { return '<span class="code muted">' + t + '</span> '; };
    if (key === 'PL') return muted('파워링크') + '글 광고 (상품 없음)';
    if (key.indexOf('MULTI:') === 0) { var p = T.pageCodes && T.pageCodes[key.slice(6)]; return muted('여러 품목') + esc(T.names[key] || '판매 페이지 ' + key.slice(6)) + (p ? '<br><small>' + esc(p.codes.slice(0, 6).join(', ') + (p.codes.length > 6 ? ' 외' : '')) + '</small>' : ''); }
    if (key.indexOf('AD:') === 0) { var id = key.slice(3); return muted('소재') + esc(id.replace(/^nad-a001-0\d-0*/, '…')) + (/삭제/.test(id) ? ' (삭제된 소재)' : ' (소재 목록에 없음)'); }
    if (key.indexOf(C.AD_OTHER + '|') === 0) return muted('타사 상품') + esc(key.split('|').slice(1).join('|').split(',')[0]);
    if (key.indexOf(C.NONE + '|') === 0) return muted('미지정') + esc(key.split('|').slice(1).join('|').split(',')[0]);
    if (key.charAt(0) === '(') return muted('-') + esc(key);
    return codeLabel(key) + ' ' + esc(itemName(X, key));
  }
  function adTreeHtml(md) {
    var T = adTreeModel(md), cp = md === 'coupang', sold = cp && S.acBasis === 'sold', h = '';
    h += '<section class="card flush" aria-label="캠페인 분석"><div class="card-h pad"><h2>캠페인 ▸ 광고그룹 ▸ 상품</h2><span class="hint">이름을 누르면 펼치고, [추이]를 누르면 아래 차트가 그 줄로 바뀝니다</span>';
    if (cp) [['ad', '광고한 상품 기준'], ['sold', '팔린 상품 기준']].forEach(function (b) { h += '<button type="button" class="chip" data-act="acbasis" data-key="' + b[0] + '" aria-pressed="' + (S.acBasis === b[0]) + '">' + b[1] + '</button>'; });
    h += '<button type="button" class="chip" data-act="accsv">엑셀로 받기 (CSV)</button></div>' + adCoverHtml(md) + (md === 'sa' ? saCreativeNote() : '') + '<div class="scroll">';
    h += '<table class="tbl wrap adtree"><thead><tr><th scope="col">캠페인 / 광고그룹 / 상품</th><th scope="col" class="r">광고비</th><th scope="col" class="r">광고매출</th><th scope="col" class="r">ROAS</th><th scope="col" class="r">클릭</th><th scope="col" class="r">CTR</th><th scope="col" class="r">' + (cp ? '주문' : '전환') + '</th>' + (cp ? '<th scope="col" class="r">판매 수량</th>' : '') + '<th scope="col"></th></tr></thead><tbody>';
    function cells(m, lvl) {
      var hideCost = sold && lvl === 3;
      return '<td class="r num' + (lvl < 3 ? ' b' : '') + '">' + (hideCost ? '-' : n0(m.cost)) + '</td><td class="r num">' + n0(m.rev) + '</td><td class="r num">' + (hideCost ? '-' : roasText(C.ratio(m.rev, m.cost))) + '</td><td class="r num">' + (hideCost ? '-' : n0(m.clicks)) + '</td><td class="r num">' + (hideCost ? '-' : pct1(C.ratio(m.clicks, m.imp))) + '</td><td class="r num">' + n0(m.conv) + '</td>' + (cp ? '<td class="r num">' + n0(m.qty) + '</td>' : '');
    }
    function selBtn(path) { var k = JSON.stringify(path), on = S.acSel && JSON.stringify(S.acSel) === k; return '<td><button type="button" class="chip mini" data-act="acsel" data-key="' + esc(k) + '" aria-pressed="' + !!on + '">추이</button></td>'; }
    if (!T.camps.length) h += '<tr><td colspan="9" class="none">이 기간에 집행 기록이 없습니다.</td></tr>';
    T.camps.forEach(function (c) {
      var ck = 'c|' + c.name, co = !!S.acOpen[ck];
      h += '<tr class="lv1"><th scope="row"><button type="button" class="exp" data-act="acopen" data-key="' + esc(ck) + '" aria-expanded="' + co + '">' + (co ? '▾ ' : '▸ ') + esc(c.name) + '</button></th>' + cells(c.m, 1) + selBtn({ camp: c.name }) + '</tr>';
      if (!co) return;
      c.groups.forEach(function (g) {
        var gk = 'g|' + c.name + '|' + g.name, go = !!S.acOpen[gk], hasI = g.items.length > 0;
        h += '<tr class="lv2"><th scope="row">' + (hasI ? '<button type="button" class="exp" data-act="acopen" data-key="' + esc(gk) + '" aria-expanded="' + go + '">' + (go ? '▾ ' : '▸ ') + esc(g.name) + '</button>' : '<span class="iname">' + esc(g.name) + '</span>') + '</th>' + cells(g.m, 2) + selBtn({ camp: c.name, group: g.name }) + '</tr>';
        if (!go) return;
        g.items.forEach(function (it) { h += '<tr class="lv3"><th scope="row">' + adItemLabel(T, it.key) + '</th>' + cells(it.m, 3) + selBtn({ camp: c.name, group: g.name, item: it.key }) + '</tr>'; });
      });
    });
    if (T.camps.length) h += '<tr class="sum"><th scope="row">합계</th>' + cells(T.total, 1) + '<td></td></tr>';
    h += '</tbody></table></div>';
    // 고른 줄의 추이
    var path = S.acSel || {}, rows = C.adPathSeries(DATA, md, S.from, S.to, cp ? S.acBasis : 'ad', path), byMonth = rows.length > 62, ser = [], m = {};
    rows.forEach(function (o) { var k = byMonth ? o.d.slice(0, 7) : o.d; if (!m[k]) { m[k] = { label: byMonth ? k.slice(2, 4) + '.' + k.slice(5, 7) : o.d.slice(5, 7) + '.' + o.d.slice(8, 10), key: k, sales: 0, ad: 0 }; ser.push(m[k]); } m[k].sales += o.rev; m[k].ad += o.cost; });
    var title = !S.acSel ? '전체' : [path.camp, path.group, path.item ? adItemLabel(T, path.item).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null].filter(Boolean).join(' ▸ ');
    h += '<div class="pad cmpchart"><div class="card-h"><h2 style="font-size:15px">추이: ' + esc(title) + '</h2>' + (S.acSel ? '<button type="button" class="chip" data-act="acsel" data-key="">전체로</button>' : '') + '<span class="legend"><span class="lg-line"></span>광고매출 (왼쪽 눈금)</span><span class="legend"><span class="lg-bar"></span>광고비 (오른쪽 눈금)</span></div>';
    h += ser.length >= 2 ? chartSvg(ser, null, null, { line: '광고매출', bar: '광고비', unit: '원' }) : '<p class="note">조회 기간이 하루라서 추이 차트는 생략했습니다. 기간을 넓히면 차트가 나옵니다.</p>';
    h += '<span class="note">' + (byMonth ? '월별' : '날짜별') + ' 합계' + (sold && path.item ? '. 팔린 상품 기준이라 광고비는 그 상품이 팔린 줄에 붙은 광고비만 잡힙니다.' : '') + '</span></div>';
    var notes = [];
    if (md === 'sa') {
      notes.push('광고그룹과 소재(상품)는 광고그룹이 들어간 보고서를 올린 날짜만 나옵니다. 그 전 날짜는 캠페인까지만 있습니다.');
      if (!Object.keys(DATA.adDet.creatives).length) notes.push('<b>네이버 소재 목록 파일을 데이터 관리에 올리면 소재가 품목코드로 바뀝니다.</b>');
      notes.push('상품은 소재의 스마트스토어 상품번호로 연결합니다. 세트나 택1 판매 페이지는 품목을 나눌 수 없어 "여러 품목"으로 보입니다.');
    } else {
      notes.push('광고한 상품 기준: 그 상품 광고에 쓴 광고비와 그 광고로 생긴 매출. 팔린 상품 기준: 실제로 팔린 상품별 매출 (다른 상품 광고를 보고 산 경우 포함).');
      notes.push('쿠팡 광고 상품명은 이름 규칙으로 품목코드에 연결했습니다 (예영 확인 전 초안). 톰토미 상품이 아니면 "타사 상품"으로 보입니다.');
      notes.push('2026-04-16 이후는 상세를 다시 올린 날짜만 광고그룹, 상품이 나옵니다.');
    }
    h += '<p class="note pad">' + notes.join('<br>') + '</p></section>';
    return h;
  }
  // 이 기간 중 상세(캠페인 ▸ 광고그룹 ▸ 상품)가 있는 날짜와 다시 올려야 할 날짜
  function adCoverHtml(md) {
    var src = md === 'coupang' ? DATA.adDet.coupang : DATA.adDet.sa, act = {}, full = {}, campOnly = {};
    src.forEach(function (e) {
      if (e.d < S.from || e.d > S.to || !(e.cost || e.rev || e.clicks || e.imp)) return;
      act[e.d] = 1;
      if (!e.old) full[e.d] = 1;
      else if (md === 'coupang' ? (e.group && e.prod) : false) full[e.d] = 1;
      else if (e.camp) campOnly[e.d] = 1;
    });
    var days = Object.keys(act).sort(), nFull = days.filter(function (d) { return full[d]; }).length;
    if (!days.length) return '';
    var miss = days.filter(function (d) { return !full[d]; });
    if (!miss.length) return '<p class="cover ok pad">이 기간 광고 집행 ' + days.length + '일 모두 캠페인 ▸ 광고그룹 ▸ 상품까지 있습니다.</p>';
    // 이어지는 날짜는 묶어서 보여준다 (11.02 ~ 11.13)
    var ranges = [], a = miss[0], b = miss[0];
    for (var i = 1; i <= miss.length; i++) {
      if (i < miss.length && miss[i] === C.addDays(b, 1)) { b = miss[i]; continue; }
      ranges.push(a === b ? dot(a) : dot(a) + ' ~ ' + dot(b));
      if (i < miss.length) { a = miss[i]; b = miss[i]; }
    }
    var co = miss.filter(function (d) { return campOnly[d]; }).length;
    return '<div class="cover pad"><b>이 기간 광고 집행 ' + days.length + '일 중 상세(캠페인 ▸ 광고그룹 ▸ 상품)가 있는 날짜는 ' + nFull + '일입니다.</b>' +
      '<span>상세가 빠진 날짜' + (co ? ' (' + co + '일은 캠페인까지만 있음)' : '') + ': ' + esc(ranges.slice(0, 6).join(', ') + (ranges.length > 6 ? ' 외 ' + (ranges.length - 6) + '구간' : '')) + '</span>' +
      '<span>이 날짜들의 ' + (md === 'coupang' ? '쿠팡 광고 보고서(custom_report)' : '네이버 SA 보고서(광고그룹 항목 포함)') + '를 다시 받아 <button type="button" class="linkbtn" data-act="view" data-key="data">데이터 관리</button>에 올리면 채워집니다. v5로 올리면 합계만 남습니다.</span></div>';
  }
  // 네이버 소재 목록(소재 ID → 상품번호)이 없으면 SA 광고를 품목에 연결할 수 없다
  function saCreativeNote() {
    var hasSa = DATA.adDet.sa.some(function (e) { return e.d >= S.from && e.d <= S.to && e.ad && !/^nad-a001-01-/.test(e.ad); });
    if (!hasSa || Object.keys(DATA.adDet.creatives).length) return '';
    return '<div class="cover pad"><b>네이버 소재 목록 파일이 아직 없어서, 네이버 SA 광고가 어느 상품 광고인지 알 수 없습니다.</b><span>네이버 광고 관리 화면의 [소재] 탭에서 [다운로드]로 받은 엑셀 파일(캠페인마다 1개)을 <button type="button" class="linkbtn" data-act="view" data-key="data">데이터 관리</button>에 올리면 연결됩니다. 한 번만 올리면 되고, 소재를 새로 만들었을 때만 다시 올립니다.</span></div>';
  }
  function downloadAdTreeCsv() {
    var md = S.ad, T = adTreeModel(md), lines = [['캠페인', '광고그룹', '상품 구분', '품목코드', '품목명/상품명', '광고비', '광고매출', 'ROAS(%)', '노출', '클릭', '전환/주문', '판매 수량']];
    var X = itemModel(S.from, S.to);
    function row(c, g, it, m) {
      var code = '', nm = '', kind = '';
      if (it) { var k = it.key; if (k === 'PL') kind = '파워링크'; else if (k.indexOf('MULTI:') === 0) { kind = '여러 품목'; nm = T.names[k] || ''; code = (T.pageCodes && T.pageCodes[k.slice(6)] ? T.pageCodes[k.slice(6)].codes.join(' / ') : ''); } else if (k.indexOf('AD:') === 0) { kind = '소재'; nm = k.slice(3); } else if (k.indexOf('|') > 0) { kind = k.split('|')[0]; nm = k.split('|').slice(1).join('|'); } else if (k.charAt(0) === '(') kind = k; else { kind = '품목'; code = k; nm = itemName(X, k); } }
      lines.push([c, g, kind, code, nm, Math.round(m.cost), Math.round(m.rev), m.cost > 0 ? Math.round(m.rev / m.cost * 100) : '', m.imp, m.clicks, m.conv, m.qty]);
    }
    T.camps.forEach(function (c) { row(c.name, '', null, c.m); c.groups.forEach(function (g) { row(c.name, g.name, null, g.m); g.items.forEach(function (it) { row(c.name, g.name, it, it.m); }); }); });
    saveCsv(lines, 'tomtomi_adtree_' + md + (md === 'coupang' ? '_' + S.acBasis : '') + '_' + S.from + '_' + S.to + '.csv');
  }
  function downloadAdsCsv() {
    var M = adsModel(), cols = adsColumns(S.ad), lines = [];
    function q(v) { v = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    function val(c, o) { var v = c[1](o); if (v === null) return ''; return c[2] === 'p' ? (v * 100).toFixed(2) + '%' : c[2] === 'r' ? Math.round(v * 100) + '%' : Math.round(v); }
    lines.push((M.unit === 'day' ? ['날짜'] : ['기간 시작', '기간 끝']).concat(cols.map(function (c) { return c[0]; })));
    M.rows.forEach(function (o) { lines.push((M.unit === 'day' ? [o.key] : [o.from, o.to]).concat(cols.map(function (c) { return val(c, o); }))); });
    lines.push((M.unit === 'day' ? ['합계'] : ['합계', '']).concat(cols.map(function (c) { return val(c, M.t); })));
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.map(function (r) { return r.map(q).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'tomtomi_ads_' + S.ad + '_' + S.from + '_' + S.to + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ───────── 상품 ───────── */
  function rate(a, b) { return b > 0 ? (a / b * 100).toFixed(1) + '%' : '-'; }
  function miss(t) { return '<span class="miss">' + t + '</span>'; }
  var PCACHE = { key: '', M: null }, PCOUNT = 0;
  var CMP_COLORS = ['#4F46E5', '#D97706', '#0F7B4F', '#B42318', '#0284C7'], CMP_DASH = ['', '7 4', '2 4', '10 4 2 4', '1 5'], SEL_MAX = 5;
  function prodModel(from, to) {
    var key = from + '|' + to + '|' + (DATA.costVer ? DATA.costVer.ver : '');
    if (PCACHE.key !== key) PCACHE = { key: key, M: C.products(DATA, from, to) };
    return PCACHE.M;
  }
  // 검색: 띄어 쓴 낱말이 모두 들어 있으면 맞는 것으로 본다 (대소문자 무시)
  function qmatch(texts) {
    var q = S.q.trim().toLowerCase(); if (!q) return true;
    var t = texts.join(' ').toLowerCase();
    return q.split(/\s+/).every(function (w) { return t.indexOf(w) >= 0; });
  }
  function grow(cur, prev) {
    if (!prev) return cur ? '<span class="hint">이전 없음</span>' : '-';
    var d = C.delta(cur, prev);
    return '<span class="' + (d.diff > 0 ? 'up' : d.diff < 0 ? 'down' : '') + '">' + pctText(d.pct) + '</span>';
  }
  function prodTotals(list) {
    var t = { qty: 0, net: 0, cost: 0, margin: 0, netCosted: 0 };
    list.forEach(function (o) { t.qty += o.qty; t.net += o.net; if (o.margin !== null) { t.cost += o.cost; t.margin += o.margin; t.netCosted += o.net; } });
    return t;
  }
  // 품목 기준 모델: 기간이 바뀌어도 품목 목록과 순서는 그대로, 숫자만 바뀐다
  var ICACHE = { key: '', X: null }, IORDER = { key: '', list: null };
  var CH_NAME = { naver: '네이버', coupang: '쿠팡', other: '기타몰' }, CHS = ['naver', 'coupang', 'other'], ITEM_PAGE = 10;
  function itemModel(from, to) {
    var key = from + '|' + to + '|' + (DATA.costVer ? DATA.costVer.ver : '');
    if (ICACHE.key !== key) ICACHE = { key: key, X: C.items(DATA, from, to) };
    return ICACHE.X;
  }
  function itemOrder() {
    var key = DATA.costVer ? DATA.costVer.ver : '';
    if (IORDER.key !== key || !IORDER.list) IORDER = { key: key, list: C.itemOrder(DATA) };
    return IORDER.list;
  }
  function chList() { return S.pch === 'all' ? CHS : [S.pch]; }
  // 한 품목의 선택 채널 합계
  function iv(X, code) {
    var r = X.rows[code], o = { qty: 0, rev: 0, cost: 0, noCost: 0, est: false, chs: [], margin: null };
    if (!r) return o;
    chList().forEach(function (c) { var x = r.ch[c]; if (!x.n) return; o.qty += x.qty; o.rev += x.rev; o.cost += x.cost; o.noCost += x.noCost; if (x.est) o.est = true; o.chs.push(c); });
    o.margin = o.qty > 0 && o.noCost === 0 && code !== C.NONE ? o.rev - o.cost : null;
    return o;
  }
  function itemName(X, code) { var m = X.master[code]; return m && m.name ? m.name : ''; }
  function codeLabel(code) {
    if (code === C.NONE) return '<span class="code muted">미지정</span>';
    if (code.indexOf('CP:') === 0) return '<span class="code muted" title="ERP 품목코드 없음 (쿠팡 상품번호 ' + esc(code.slice(3)) + ')">코드 없음</span>';
    return '<span class="code num">' + esc(code) + '</span>';
  }
  function itemLabel(X, code) { return codeLabel(code) + ' ' + esc(code === C.NONE ? '품목 미지정 (매핑 없음, 품번 빈칸)' : itemName(X, code)); }
  function revName() { return S.pch === 'naver' ? '순매출 (배분)' : S.pch === 'coupang' ? '입고 금액' : S.pch === 'other' ? '매출액' : '매출'; }
  function itemList() {
    var X = itemModel(S.from, S.to), list = itemOrder().slice();
    list.push(C.NONE); // 품목 미지정은 항상 맨 아래 (기간에 따라 목록이 흔들리지 않게)
    return list.filter(function (c) { return qmatch([c, itemName(X, c)]); });
  }
  // 표 부분만 따로 그린다 (검색어를 치는 동안 입력칸은 건드리지 않기 위해)
  function prodBody() {
    if (S.pch === 'naver' && S.pmode === 'page') return pageBody();
    var h = '', X = itemModel(S.from, S.to), cr = cmpRange(), PX = cr ? itemModel(cr.from, cr.to) : null, all = S.pch === 'all';
    var list = itemList(), sumName = S.q.trim() ? '검색 결과 합계' : '합계', nc = 7 + (all ? 1 : 0) + (cr ? 1 : 0);
    var t = { qty: 0, rev: 0, cost: 0, margin: 0, revCosted: 0, prev: 0 };
    list.forEach(function (c) { var o = iv(X, c); t.qty += o.qty; t.rev += o.rev; if (o.margin !== null) { t.cost += o.cost; t.margin += o.margin; t.revCosted += o.rev; } if (PX) t.prev += iv(PX, c).rev; });
    PCOUNT = list.length;
    h += '<table class="tbl wrap items"><thead><tr><th scope="col">품목코드</th><th scope="col">품목명</th>' + (all ? '<th scope="col">판매채널</th>' : '') + '<th scope="col" class="r">수량</th><th scope="col" class="r">' + revName() + '</th>' + (cr ? '<th scope="col" class="r">비교 기간 대비</th>' : '') + '<th scope="col" class="r">원가</th><th scope="col" class="r">마진</th><th scope="col" class="r">마진율</th></tr></thead><tbody>';
    if (!list.length) h += '<tr><td colspan="' + nc + '" class="none">검색 결과가 없습니다.</td></tr>';
    var pg = pageOf(list, ITEM_PAGE);
    pg.rows.forEach(function (c) {
      var o = iv(X, c), pv = PX ? iv(PX, c) : null, open = all && S.open === c, zero = !o.qty && !o.rev, none = c === C.NONE;
      h += '<tr' + (zero ? ' class="zero-row"' : '') + '><th scope="row"><span class="pick">';
      h += none ? '<span class="nobox"></span>' : '<input type="checkbox" data-act="sel" data-key="' + esc(c) + '"' + (S.sel.indexOf(c) >= 0 ? ' checked' : '') + ' aria-label="비교에 넣기: ' + esc(itemName(X, c) || c) + '">';
      h += all && !zero ? '<button type="button" class="exp" data-act="open" data-key="' + esc(c) + '" aria-expanded="' + open + '">' + (open ? '▾ ' : '▸ ') + codeLabel(c) + '</button>' : '<span class="iname">' + codeLabel(c) + '</span>';
      h += '</span></th><td class="nm">' + esc(none ? '품목 미지정 (매핑 없음, 품번 빈칸)' : itemName(X, c)) + '</td>';
      if (all) h += '<td>' + (o.chs.length ? o.chs.map(function (k) { return '<span class="chtag ch-' + k + '">' + CH_NAME[k] + '</span>'; }).join(' ') : '<span class="zero">-</span>') + '</td>';
      h += '<td class="r num">' + n0(o.qty) + '</td><td class="r num b">' + (o.est ? '약 ' : '') + n0(o.rev) + '</td>';
      if (cr) h += '<td class="r num">' + (zero && !(pv && pv.rev) ? '-' : grow(o.rev, pv ? pv.rev : 0)) + '</td>';
      h += '<td class="r num">' + (!o.qty || none ? '-' : o.noCost > 0 ? miss(o.noCost < o.qty ? '일부 미입력' : '미입력') : n0(o.cost)) + '</td>';
      h += '<td class="r num">' + (o.margin === null ? '-' : n0(o.margin)) + '</td><td class="r num">' + (o.margin === null ? '-' : rate(o.margin, o.rev)) + '</td></tr>';
      if (open) CHS.forEach(function (k) {
        var x = X.rows[c] && X.rows[c].ch[k]; if (!x || !x.n) return;
        var m = x.qty > 0 && x.noCost === 0 && !none ? x.rev - x.cost : null;
        h += '<tr class="subrow"><th scope="row"></th><td>└ ' + CH_NAME[k] + ' <small>(' + (k === 'naver' ? '순매출 배분' : k === 'coupang' ? '입고 금액' : '매출액') + ')</small></td><td></td><td class="r num">' + n0(x.qty) + '</td><td class="r num">' + (x.est ? '약 ' : '') + n0(x.rev) + '</td>' + (cr ? '<td></td>' : '');
        h += '<td class="r num">' + (none ? '-' : x.noCost > 0 ? miss('미입력') : n0(x.cost)) + '</td><td class="r num">' + (m === null ? '-' : n0(m)) + '</td><td class="r num">' + (m === null ? '-' : rate(m, x.rev)) + '</td></tr>';
      });
    });
    if (list.length) h += '<tr class="sum"><th scope="row">' + sumName + '</th><td><small>원가, 마진은 원가가 다 입력된 품목만</small></td>' + (all ? '<td></td>' : '') + '<td class="r num">' + n0(t.qty) + '</td><td class="r num b">' + n0(t.rev) + '</td>' + (cr ? '<td class="r num">' + grow(t.rev, t.prev) + '</td>' : '') + '<td class="r num">' + (t.revCosted > 0 ? n0(t.cost) : '-') + '</td><td class="r num">' + (t.revCosted > 0 ? n0(t.margin) : '-') + '</td><td class="r num">' + (t.revCosted > 0 ? rate(t.margin, t.revCosted) : '-') + '</td></tr>';
    h += '</tbody></table>' + pagerHtml(pg, true);
    if (S.pch !== 'coupang' && S.pch !== 'other') h += '<p class="note pad">네이버 매출은 판매 페이지별 순매출을 그 페이지에서 팔린 품목 수량 비율로 나눈 값입니다. 세트나 추가구성처럼 여러 품목이 섞인 페이지에서 온 금액이 있으면 "약"을 붙였습니다.</p>';
    return h;
  }
  // 네이버 판매 페이지(스마트스토어 상품번호) 기준 표
  function pageBody() {
    var h = '', sumName = S.q.trim() ? '검색 결과 합계' : '합계';
    var M = prodModel(S.from, S.to), cr = cmpRange(), PM = cr ? prodModel(cr.from, cr.to) : null;
    {
      var prev = {}; if (PM) PM.prods.forEach(function (o) { prev[o.prodId] = o; });
      var list = M.prods.filter(function (o) { return qmatch([o.name, o.prodId].concat(o.skuList.map(function (x) { return x.code + ' ' + x.name; }))); });
      var t = prodTotals(list), nc = cr ? 7 : 6, pn = 0;
      PCOUNT = list.length;
      h += '<table class="tbl wrap"><thead><tr><th scope="col">판매 페이지 (누르면 품목 펼침)</th><th scope="col" class="r">수량</th><th scope="col" class="r">순매출</th>' + (cr ? '<th scope="col" class="r">비교 기간 대비</th>' : '') + '<th scope="col" class="r">원가</th><th scope="col" class="r">마진</th><th scope="col" class="r">마진율</th></tr></thead><tbody>';
      if (!list.length) h += '<tr><td colspan="' + nc + '" class="none">' + (S.q.trim() ? '검색 결과가 없습니다.' : '이 기간에 판매된 상품이 없습니다.') + '</td></tr>';
      var pg = pageOf(list);
      pg.rows.forEach(function (o) {
        var open = S.open === o.prodId, pv = prev[o.prodId];
        h += '<tr><th scope="row"><span class="pick">';
        h += '<button type="button" class="exp" data-act="open" data-key="' + esc(o.prodId) + '" aria-expanded="' + open + '">' + (open ? '▾ ' : '▸ ') + esc(o.name || o.prodId) + '</button></span></th>';
        h += '<td class="r num">' + n0(o.qty) + '</td><td class="r num b">' + n0(o.net) + '</td>';
        if (cr) h += '<td class="r num">' + grow(o.net, pv ? pv.net : 0) + '</td>';
        h += '<td class="r num">' + (o.oqty === 0 ? '-' : o.noCost > 0 ? miss(M.hasCost ? '일부 미입력' : '미입력') : n0(o.cost)) + '</td>';
        h += '<td class="r num">' + (o.margin === null ? '-' : n0(o.margin)) + '</td><td class="r num">' + (o.margin === null ? '-' : rate(o.margin, o.net)) + '</td></tr>';
        if (open) {
          if (!o.skuList.length) h += '<tr class="subrow"><th scope="row" colspan="' + nc + '">이 기간에 주문조회 기록이 없어 SKU를 풀 수 없습니다.</th></tr>';
          o.skuList.forEach(function (x) {
            h += '<tr class="subrow"><th scope="row">└ <span class="num">' + esc(x.code) + '</span> ' + esc(x.name) + '</th><td class="r num">' + n0(x.qty) + '</td><td class="r num">' + (o.skuList.length > 1 ? '약 ' : '') + n0(x.rev) + '</td>' + (cr ? '<td></td>' : '');
            h += '<td class="r num">' + (x.noCost > 0 ? miss('미입력') : n0(x.cost)) + '</td><td class="r num" colspan="2">' + (x.unit === null ? '' : '개당 ' + n0(x.unit)) + '</td></tr>';
          });
        }
      });
      if (PM) list.forEach(function (o) { pn += prev[o.prodId] ? prev[o.prodId].net : 0; });
      if (list.length) h += '<tr class="sum"><th scope="row">' + sumName + ' <small>(원가, 마진은 원가가 다 입력된 상품만)</small></th><td class="r num">' + n0(t.qty) + '</td><td class="r num b">' + n0(t.net) + '</td>' + (cr ? '<td class="r num">' + grow(t.net, pn) + '</td>' : '') + '<td class="r num">' + (t.netCosted > 0 ? n0(t.cost) : '-') + '</td><td class="r num">' + (t.netCosted > 0 ? n0(t.margin) : '-') + '</td><td class="r num">' + (t.netCosted > 0 ? rate(t.margin, t.netCosted) : '-') + '</td></tr>';
      return h + '</tbody></table>' + pagerHtml(pg);
    }
    return h;
  }
  function searchBar() {
    var ph = S.pch === 'naver' && S.pmode === 'page' ? '상품명, 상품번호, 품목코드로 검색' : '품목코드, 품목명으로 검색';
    return '<div class="search pad"><input type="search" data-act="q" value="' + esc(S.q) + '" placeholder="' + ph + '" aria-label="품목 검색" autocomplete="off">' +
      '<span class="hint">결과 <b id="pcount" class="num">' + PCOUNT + '</b>개' + (S.pch === 'naver' && S.pmode === 'page' ? '' : ', 체크하면 비교' + (S.pch === 'all' ? ', 코드를 누르면 채널별로 펼침' : '')) + '</span></div>';
  }
  // 고른 품목 비교 (최대 5개). 기간을 바꿔도 고른 품목은 그대로 남는다
  function compareHtml() {
    if ((S.pch === 'naver' && S.pmode === 'page') || !S.sel.length) return '';
    var X = itemModel(S.from, S.to), cr = cmpRange(), PX = cr ? itemModel(cr.from, cr.to) : null;
    var items = S.sel.map(function (c) { return { id: c, o: iv(X, c), pv: PX ? iv(PX, c) : null, name: itemName(X, c) || c }; });
    var h = '<section class="card flush" aria-label="품목 비교"><div class="card-h pad"><h2>품목 비교</h2><span class="hint">' + dot(S.from) + ' ~ ' + dot(S.to) + ', ' + (S.pch === 'all' ? '전체 채널' : CH_NAME[S.pch]) + ', ' + items.length + '개 선택 (최대 ' + SEL_MAX + '개)</span><button type="button" class="chip" data-act="selclear">선택 모두 해제</button></div>';
    if (S.selMsg) h += '<p class="note pad"><b>' + esc(S.selMsg) + '</b></p>';
    if (items.length < 2) return h + '<p class="note pad">하나 더 체크하면 나란히 비교합니다. 검색어나 기간을 바꿔도 체크한 품목은 유지됩니다.</p></section>';
    function row(label, f) { var r = '<tr><th scope="row">' + label + '</th>'; items.forEach(function (it) { r += '<td class="r num">' + f(it) + '</td>'; }); return r + '</tr>'; }
    h += '<div class="scroll"><table class="tbl wrap cmp"><thead><tr><th scope="col">항목</th>';
    items.forEach(function (it, i) { h += '<th scope="col" class="r"><span class="dotc" style="background:' + CMP_COLORS[i] + '"></span>' + codeLabel(it.id) + '<br>' + esc(it.name) + '</th>'; });
    h += '</tr></thead><tbody>';
    h += row('수량', function (it) { return it.o.qty ? n0(it.o.qty) : '<span class="zero">0</span>'; });
    h += row(revName(), function (it) { return '<b>' + (it.o.est ? '약 ' : '') + n0(it.o.rev) + '</b>'; });
    if (S.pch === 'all') CHS.forEach(function (k) { h += row('└ ' + CH_NAME[k], function (it) { var x = X.rows[it.id] && X.rows[it.id].ch[k]; return x && x.rev ? n0(x.rev) : '<span class="zero">0</span>'; }); });
    if (cr) {
      h += row('비교 기간 ' + revName() + ' <small>(' + mdot(cr.from) + ' ~ ' + mdot(cr.to) + ')</small>', function (it) { return it.pv.rev ? n0(it.pv.rev) : '<span class="zero">0</span>'; });
      h += row('매출 증감', function (it) { return grow(it.o.rev, it.pv.rev); });
      h += row('수량 증감', function (it) { return grow(it.o.qty, it.pv.qty); });
    }
    h += row('개당 평균 매출', function (it) { return it.o.qty > 0 ? n0(it.o.rev / it.o.qty) : '-'; });
    h += row('원가', function (it) { return !it.o.qty ? '-' : it.o.noCost > 0 ? miss('미입력') : n0(it.o.cost); });
    h += row('마진', function (it) { return it.o.margin !== null ? n0(it.o.margin) : '-'; });
    h += row('마진율', function (it) { return it.o.margin !== null ? rate(it.o.margin, it.o.rev) : '-'; });
    h += '</tbody></table></div>';
    var ps = C.itemSeries(DATA, S.sel, S.from, S.to, chList());
    if (ps.labels.length >= 2) h += '<div class="pad cmpchart">' + multiLine(ps, items) + '<span class="note">' + (ps.unit === 'day' ? '날짜별' : '월별') + ' ' + revName() + '. 선 위에 마우스를 올리면 값이 보입니다.</span></div>';
    else h += '<p class="note pad">조회 기간이 하루라서 추이 차트는 생략했습니다. 기간을 넓히면 차트가 나옵니다.</p>';
    return h + '</section>';
  }
  function multiLine(ps, items) {
    var W = 960, H = 260, L = 64, R = 16, T = 14, B = 30, n = ps.labels.length, max = 1, min = 0;
    items.forEach(function (it) { ps.series[it.id].forEach(function (v) { if (v > max) max = v; if (v < min) min = v; }); });
    function x(i) { return L + (W - L - R) * (n === 1 ? 0.5 : i / (n - 1)); }
    function y(v) { return T + (H - T - B) * (1 - (v - min) / (max - min)); }
    function lab(k) { return ps.unit === 'day' ? k.slice(5, 7) + '.' + k.slice(8, 10) : k.slice(2, 4) + '.' + k.slice(5, 7); }
    var g = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="고른 상품의 순매출 추이" class="mline">';
    [min, (min + max) / 2, max].forEach(function (v) { g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="grid"/><text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end" class="ax">' + n0(v) + '</text>'; });
    var step = Math.max(1, Math.ceil(n / 8)), i;
    for (i = 0; i < n; i += step) g += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle" class="ax">' + lab(ps.labels[i]) + '</text>';
    items.forEach(function (it, k) {
      var pts = ps.series[it.id].map(function (v, j) { return x(j).toFixed(1) + ',' + y(v).toFixed(1); }).join(' ');
      g += '<polyline points="' + pts + '" fill="none" stroke="' + CMP_COLORS[k] + '" stroke-width="2.5" stroke-linejoin="round"' + (CMP_DASH[k] ? ' stroke-dasharray="' + CMP_DASH[k] + '"' : '') + '/>';
    });
    var bw = (W - L - R) / Math.max(1, n - 1);
    for (i = 0; i < n; i++) {
      var tip = [ps.unit === 'day' ? dot(ps.labels[i]) : ps.labels[i].replace('-', '.')].concat(items.map(function (it) { return it.name.slice(0, 22) + ': ' + n0(ps.series[it.id][i]); })).join('|');
      g += '<rect class="hit" x="' + (x(i) - bw / 2) + '" y="' + T + '" width="' + bw + '" height="' + (H - T - B) + '" fill="transparent" data-tip="' + esc(tip) + '"/>';
    }
    g += '</svg><div class="legend">';
    items.forEach(function (it, k) { g += '<span><span class="dotc" style="background:' + CMP_COLORS[k] + '"></span>' + esc(it.name) + '</span>'; });
    return g + '</div>';
  }
  function viewProducts() {
    var pch = CH_NAME[S.pch] || S.pch === 'all' ? S.pch : 'all'; S.pch = pch;
    var h = '', body = prodBody(), X = itemModel(S.from, S.to), page = pch === 'naver' && S.pmode === 'page';
    h += '<div class="tabs" role="tablist" aria-label="채널">';
    [['all', '전체'], ['naver', '네이버'], ['coupang', '쿠팡'], ['other', '기타몰']].forEach(function (c) { h += '<button type="button" role="tab" class="tab" data-act="pch" data-key="' + c[0] + '" aria-selected="' + (c[0] === pch) + '">' + c[1] + '</button>'; });
    h += '</div>';
    var t = { n: 0, qty: 0, rev: 0, cost: 0, margin: 0, revCosted: 0 };
    Object.keys(X.rows).forEach(function (c) { var o = iv(X, c); if (o.qty > 0 && c !== C.NONE) t.n++; t.qty += o.qty; t.rev += o.rev; if (o.margin !== null) { t.cost += o.cost; t.margin += o.margin; t.revCosted += o.rev; } });
    h += '<section class="strip" aria-label="품목 요약">';
    h += cell('팔린 품목 수', n0(t.n) + '개', '전체 ' + n0(itemOrder().length) + '개 중');
    h += cell(pch === 'coupang' ? '입고 수량' : '판매 수량', n0(t.qty), '');
    h += cell(revName().replace(' (배분)', ''), n0(t.rev), pch === 'all' ? '매출 메뉴의 실매출과 같은 기준' : '');
    h += cell('마진 (원가 입력분)', DATA.costVer && t.revCosted > 0 ? n0(t.margin) : '-', !DATA.costVer ? '원가표를 올리면 계산됩니다' : t.revCosted > 0 ? '마진율 ' + rate(t.margin, t.revCosted) + ', 매출의 ' + rate(t.revCosted, t.rev) + '에 원가 입력됨' : '이 기간 판매 품목에 입력된 원가가 없습니다');
    h += '</section>';
    h += '<span class="note tight">매출 기준: 네이버 = 순매출, 쿠팡 = 입고 금액, 기타몰 = 매출액. 마진 = 매출 - 원가 (부가세 포함 기준)이고 수수료, 배송비, 광고비는 빼지 않은 값입니다.</span>';
    h += '<section class="card flush" aria-label="품목별 성과"><div class="card-h pad"><h2>' + (page ? '판매 페이지별 성과' : '품목별 성과') + '</h2><span class="hint">목록과 순서는 기간과 상관없이 고정 (전체 기간 누적 매출순), 10개씩</span>';
    if (pch === 'naver') [['item', '품목 기준'], ['page', '판매 페이지 기준']].forEach(function (m) { h += '<button type="button" class="chip" data-act="pmode" data-key="' + m[0] + '" aria-pressed="' + ((S.pmode === 'page' ? 'page' : 'item') === m[0]) + '">' + m[1] + '</button>'; });
    h += '<button type="button" class="chip" data-act="pcsv">엑셀로 받기 (CSV)</button></div>' + searchBar() + '<div class="scroll" id="pbody">' + body + '</div></section>';
    h += '<div class="row">' + costSide(X) + '</div>';
    h += '<div id="pcompare">' + compareHtml() + '</div>';
    return h;
  }
  function refreshProdBody() {
    var el = document.getElementById('pbody'), c = document.getElementById('pcount'); if (!el) return;
    el.innerHTML = prodBody(); if (c) c.textContent = PCOUNT;
  }
  function costSide(X) {
    var h = '';
    var cv = DATA.costVer;
    h += '<section class="card grow1 flush" aria-label="원가표와 확인할 것"><div class="card-h pad"><h2>원가표</h2><label class="chip filebtn">원가표 올리기<input type="file" accept=".xlsx" data-act="costfile" hidden></label></div>';
    h += '<p class="note pad">' + (cv ? '저장된 원가표: ' + esc(cv.ver) + ' 저장, ' + n0(cv.rows.length) + '줄' : '아직 저장된 원가표가 없습니다.') + '</p>';
    if (S.costMsg) h += '<p class="note pad"><b>' + esc(S.costMsg) + '</b></p>';
    var d = S.draft;
    if (d) {
      h += '<div class="draft"><b>저장하기 전에 확인</b><span>읽은 줄 ' + d.rows.length + '줄 (원가 있는 줄 ' + (d.rows.length - d.blank) + ') (기준: ' + (d.vat === 'excl' ? 'VAT 제외, 1.1을 곱해 저장' : 'VAT 포함') + ')</span>';
      h += '<span>새로 추가 ' + d.merged.stat.added + ', 값 변경 ' + d.merged.stat.changed + ', 그대로 ' + d.merged.stat.same + ', 이전 값 유지 ' + d.merged.stat.kept + '</span>';
      if (d.blank) h += '<span>원가 빈 줄 ' + d.blank + '개는 품목 이름만 저장 (기존 원가는 지우지 않음)</span>';
      if (d.bad.length) h += '<span class="miss">읽지 못한 줄 ' + d.bad.length + '개: ' + esc(d.bad.slice(0, 5).join(', ')) + (d.bad.length > 5 ? ' 외' : '') + '</span>';
      h += '<div><button type="button" class="chip" data-act="costsave" aria-pressed="true"' + (S.saving ? ' disabled' : '') + '>' + (S.saving ? '저장 중…' : '저장') + '</button> <button type="button" class="chip" data-act="costcancel">취소</button></div></div>';
    }
    h += '<div class="card-h pad"><h2>확인이 필요한 것</h2></div>';
    var nr = X.rows[C.NONE], nn = 0;
    if (nr) CHS.forEach(function (k) { var x = nr.ch[k]; if (x.n && Math.round(x.rev)) { nn++; h += '<div class="li"><span>' + CH_NAME[k] + ' 품목 미지정 매출 <small>(' + (k === 'naver' ? '매핑 없는 옵션, 종류 미상' : k === 'coupang' ? '매핑 없는 쿠팡 상품번호' : '구글 시트 품번 빈칸') + ')</small></span><b class="num">' + n0(x.rev) + '</b></div>'; } });
    var nc = Object.keys(X.rows).filter(function (c) { return c !== C.NONE && iv(X, c).noCost > 0; }).map(function (c) { return { c: c, q: iv(X, c).noCost }; }).sort(function (a, b) { return b.q - a.q; });
    if (!nc.length) h += '<p class="note pad">' + (nn ? '' : '품목 미지정 매출이 없습니다. ') + '이 기간에 팔린 품목은 모두 원가가 입력되어 있습니다.</p>';
    else {
      h += '<p class="note pad">원가 미입력 품목 ' + nc.length + '개 (이 기간 수량 순)</p>';
      nc.slice(0, 8).forEach(function (o) { h += '<div class="li"><span>' + codeLabel(o.c) + ' ' + esc(itemName(X, o.c)) + '</span><b class="num">' + n0(o.q) + '개</b></div>'; });
      if (nc.length > 8) h += '<p class="note pad">외 ' + (nc.length - 8) + '개는 표에서 원가 칸이 "미입력"으로 보입니다.</p>';
    }
    h += '</section>';
    return h;
  }
  function saveCsv(lines, name) {
    function q(v) { v = String(v === null || v === undefined ? '' : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.map(function (r) { return r.map(q).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(a.href); }, 1000);
  }
  function downloadProductsCsv() {
    var lines = [], tag = S.from + '_' + S.to;
    if (S.pch === 'naver' && S.pmode === 'page') {
      var M = C.products(DATA, S.from, S.to);
      lines.push(['상품번호', '상품명', '품목코드', '품목명', '수량', '순매출', '원가', '마진', '마진율(%)']);
      M.prods.forEach(function (o) {
        lines.push([o.prodId, o.name, '', '', o.qty, Math.round(o.net), o.margin === null ? '' : Math.round(o.cost), o.margin === null ? '' : Math.round(o.margin), o.margin === null || !(o.net > 0) ? '' : (o.margin / o.net * 100).toFixed(1)]);
        o.skuList.forEach(function (x) { lines.push([o.prodId, o.name, x.code, x.name, x.qty, Math.round(x.rev), x.noCost > 0 ? '' : Math.round(x.cost), '', '']); });
      });
      return saveCsv(lines, 'tomtomi_naver_pages_' + tag + '.csv');
    }
    var X = itemModel(S.from, S.to);
    lines.push(['품목코드', '품목명', '채널', '수량', '매출', '배분 추정', '원가', '원가 미입력 수량', '마진', '마진율(%)']);
    itemList().forEach(function (c) {
      var r = X.rows[c], code = c === C.NONE ? '' : c.indexOf('CP:') === 0 ? '(코드 없음, 쿠팡 ' + c.slice(3) + ')' : c, nm = c === C.NONE ? '품목 미지정' : itemName(X, c);
      chList().forEach(function (k) {
        var x = r ? r.ch[k] : null; if (!x || !x.n) { lines.push([code, nm, CH_NAME[k], 0, 0, '', '', '', '', '']); return; }
        var m = x.qty > 0 && x.noCost === 0 && c !== C.NONE ? x.rev - x.cost : null;
        lines.push([code, nm, CH_NAME[k], x.qty, Math.round(x.rev), x.est ? '추정' : '', c === C.NONE ? '' : Math.round(x.cost), x.noCost, m === null ? '' : Math.round(m), m === null || !(x.rev > 0) ? '' : (m / x.rev * 100).toFixed(1)]);
      });
    });
    saveCsv(lines, 'tomtomi_items_' + S.pch + '_' + tag + '.csv');
  }

  /* ───────── 원가표 올리기 ───────── */
  function loadXlsx() {
    if (root.XLSX) return Promise.resolve();
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = function () { ok(); }; s.onerror = function () { fail(new Error('엑셀 읽기 도구를 불러오지 못했습니다. 네트워크를 확인해 주세요.')); };
      document.head.appendChild(s);
    });
  }
  // 엑셀 날짜 값(일련번호 또는 글자)을 YYYY-MM-DD로
  function xlDate(v) {
    if (v === '' || v === null || v === undefined) return '';
    if (typeof v === 'number') { var d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
    return C.normDate(String(v).trim().replace(/[./]/g, '-')) || null;
  }
  function parseCostSheet(wb) {
    var ws = wb.Sheets['원가표'] || wb.Sheets[wb.SheetNames[0]];
    var aoa = root.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    var hr = -1, i;
    for (i = 0; i < aoa.length && hr < 0; i++) if (aoa[i].some(function (c) { return String(c).trim() === 'SKU코드'; })) hr = i;
    if (hr < 0) throw new Error('원가표 양식이 아닙니다. 제목 줄에 "SKU코드" 칸이 있어야 합니다.');
    function col(name) { var k = -1; aoa[hr].forEach(function (c, j) { if (k < 0 && String(c).trim().indexOf(name) === 0) k = j; }); return k; }
    var cCode = col('SKU코드'), cName = col('품명'), cCost = col('원가'), cFrom = col('적용 시작일'), cNote = col('비고');
    if (cCost < 0) throw new Error('원가표 양식이 아닙니다. 제목 줄에 "원가" 칸이 있어야 합니다.');
    var vat = '';
    for (i = 0; i < hr; i++) aoa[i].forEach(function (c) { c = String(c).trim(); if (c === 'VAT 제외') vat = 'excl'; else if (c === 'VAT 포함') vat = 'incl'; });
    if (!vat) throw new Error('원가 기준(VAT 포함 / VAT 제외) 칸을 찾지 못했습니다. B2 칸을 확인해 주세요.');
    var rows = [], bad = [], blank = 0, seen = {};
    for (i = hr + 1; i < aoa.length; i++) {
      var r = aoa[i], code = String(r[cCode] === undefined ? '' : r[cCode]).trim(); if (!code) continue;
      var raw = r[cCost];
      if (raw === '' || raw === null || raw === undefined) { // 원가 빈 줄: 품목 마스터(코드, 이름)로만 저장
        blank++; var bf = cFrom >= 0 ? xlDate(r[cFrom]) : '';
        if (bf !== null && !seen[code + '|' + bf]) { seen[code + '|' + bf] = 1; rows.push({ c: code, name: cName >= 0 ? String(r[cName] || '').trim() : '', cost: 0, from: bf, note: cNote >= 0 ? String(r[cNote] || '').trim() : '' }); }
        continue;
      }
      var cost = typeof raw === 'number' ? raw : (/^[\d,.\s원]+$/.test(String(raw)) ? C.num(String(raw).replace(/원/g, '')) : NaN);
      var from = cFrom >= 0 ? xlDate(r[cFrom]) : '';
      if (!(cost > 0) || from === null) { bad.push(code + (from === null ? ' (날짜)' : ' (원가)')); continue; }
      if (seen[code + '|' + from]) { bad.push(code + ' (같은 줄 중복)'); continue; }
      seen[code + '|' + from] = 1;
      rows.push({ c: code, name: cName >= 0 ? String(r[cName] || '').trim() : '', cost: Math.round(vat === 'excl' ? cost * 1.1 : cost), from: from, note: cNote >= 0 ? String(r[cNote] || '').trim() : '' });
    }
    return { vat: vat, rows: rows, bad: bad, blank: blank };
  }
  function readCostFile(file) {
    if (!file) return;
    S.costMsg = ''; S.draft = null;
    loadXlsx().then(function () { return file.arrayBuffer(); }).then(function (buf) {
      var p = parseCostSheet(root.XLSX.read(buf, { type: 'array' }));
      if (!p.rows.length) { S.costMsg = '원가가 입력된 줄이 없어 저장할 것이 없습니다.' + (p.bad.length ? ' 읽지 못한 줄: ' + p.bad.slice(0, 5).join(', ') : ''); render(); return; }
      p.merged = C.costMerge(DATA.costVer, p.rows);
      S.draft = p; render();
    }).catch(function (e) { S.costMsg = '원가표를 읽지 못했습니다. ' + (e && e.message || ''); render(); });
  }
  function stamp() { var d = new Date(); function z(n) { return ('0' + n).slice(-2); } return today() + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds()); }
  function saveCost() {
    var d = S.draft; if (!d || S.saving) return;
    var ver = { ver: stamp(), basis: d.vat, rows: d.merged.rows };
    S.saving = true; render();
    root.TTData.saveCost(ver).then(function () {
      DATA.costVer = ver; S.draft = null; S.saving = false; S.costMsg = '원가표를 저장했습니다 (' + ver.rows.length + '줄). 이전 저장본은 지우지 않고 남겨 두었습니다.'; render();
    }).catch(function (e) { S.saving = false; S.costMsg = '저장하지 못했습니다. 화면의 값은 바뀌지 않았습니다. ' + (e && e.message || ''); render(); });
  }

  /* ───────── 고객/유입 (네이버 visit 파일) ───────── */
  function pctOf(a, b) { return b > 0 ? (a / b * 100).toFixed(1) + '%' : '-'; }
  function viewCustomers() {
    var h = '', cr = cmpRange(), has = !!cr, tspan = (function () { var f = '', l = ''; DATA.traffic.forEach(function (e) { if (!f || e.d < f) f = e.d; if (e.d > l) l = e.d; }); return { first: f, last: l }; })();
    if (!tspan.first) return h + '<section class="card"><p class="note">아직 유입 데이터(visit 파일)가 없습니다.</p></section>';
    var cur = C.trafficTotal(C.trafficDaily(DATA, S.from, S.to)), prev = has ? C.trafficTotal(C.trafficDaily(DATA, cr.from, cr.to)) : null;
    var pHas = has && cr.to >= tspan.first;
    h += '<span class="note tight">네이버 스마트스토어 visit 파일 기준입니다 (' + dot(tspan.first) + ' ~ ' + dot(tspan.last) + '). 쿠팡은 입고 구조라 방문 데이터가 없습니다.' + (S.from < tspan.first ? ' <b>조회 기간 중 ' + dot(tspan.first) + ' 이전은 유입 데이터가 없어 0으로 잡힙니다.</b>' : '') + '</span>';
    h += '<section class="strip" aria-label="유입 요약">';
    h += cell('방문', n0(cur.visits), dsub(cur.visits, prev ? prev.visits : 0, pHas));
    h += cell('주문', n0(cur.orders), dsub(cur.orders, prev ? prev.orders : 0, pHas));
    var cv = cur.visits ? cur.orders / cur.visits : 0, pv = prev && prev.visits ? prev.orders / prev.visits : 0;
    h += cell('전환율 (주문 ÷ 방문)', pctOf(cur.orders, cur.visits), pHas && pv ? (cv - pv >= 0 ? '<span class="up">+' : '<span class="down">') + ((cv - pv) * 100).toFixed(1) + '%p</span> 이전 ' + pctOf(prev.orders, prev.visits) : '');
    h += cell('방문당 결제금액', cur.visits ? n0(cur.rev / cur.visits) : '-', pHas && prev.visits ? '이전 ' + n0(prev.rev / prev.visits) : '');
    h += '</section>';

    // 추이: 선 = 방문, 막대 = 주문
    var unit = S.unit === 'auto' ? C.autoUnit(S.from, S.to) : S.unit, ctx = chartCtx();
    function series(rows) { return rows.map(function (o) { return { label: o.label, key: o.key, sales: o.visits, ad: o.orders }; }); }
    var crow = C.trafficBucket(C.trafficDaily(DATA, ctx ? ctx.from : S.from, ctx ? ctx.to : S.to), ctx ? 'day' : unit);
    var prow = has && !ctx ? C.trafficBucket(C.trafficDaily(DATA, cr.from, cr.to), unit) : null;
    h += '<section class="card" aria-label="방문 추이"><div class="card-h"><h2>방문과 주문 추이</h2><div class="units">';
    [['auto', '자동'], ['day', '일'], ['week', '주'], ['month', '월']].forEach(function (u) { h += '<button type="button" class="chip" data-act="unit" data-key="' + u[0] + '" aria-pressed="' + (S.unit === u[0]) + '">' + u[1] + '</button>'; });
    h += '</div><span class="legend"><span class="lg-line"></span>방문 (왼쪽 눈금)</span>';
    if (prow) h += '<span class="legend"><span class="lg-dash"></span>비교 기간</span>';
    if (ctx) h += '<span class="legend"><span class="lg-hl"></span>조회 기간</span>';
    h += '<span class="legend"><span class="lg-bar"></span>주문 (오른쪽 눈금)</span></div>';
    h += chartSvg(series(crow), prow ? series(prow) : null, ctx ? hlRange(crow) : null, { line: '방문', bar: '주문', unit: '명', barUnit: '건' });
    h += '<span class="note">' + (ctx ? '조회 기간이 짧아 최근 14일 흐름을 함께 보여줍니다. 색칠된 부분이 조회 기간입니다.' : UNIT_NAME[unit] + ' 단위') + '</span></section>';

    // 유입경로
    var P = C.trafficPaths(DATA, S.from, S.to), PP = has ? C.trafficPaths(DATA, cr.from, cr.to) : [], pmap = {};
    PP.forEach(function (g) { pmap[g.name] = g; g.subList.forEach(function (x) { pmap[g.name + '|' + x.name] = x; }); });
    h += '<section class="card flush" aria-label="유입경로별"><div class="card-h pad"><h2>유입경로별</h2><span class="hint">경로를 누르면 세부 경로가 펼쳐집니다</span><button type="button" class="chip" data-act="tcsv">엑셀로 받기 (CSV)</button></div><div class="scroll">';
    h += trafficTable(P.map(function (g) { return { key: g.name, label: g.name, o: g, pv: pmap[g.name], subs: g.subList.map(function (x) { return { label: x.name, o: x, pv: pmap[g.name + '|' + x.name] }; }) }; }), cur.visits, has, '경로');
    h += '</div></section>';

    // 품목별 유입 (품목코드 중심, 목록 고정)
    var TI = C.trafficItems(DATA, S.from, S.to), TP = has ? C.trafficItems(DATA, cr.from, cr.to) : null, X = itemModel(S.from, S.to);
    var order = C.trafficOrder(DATA).concat([C.NONE]);
    h += '<section class="card flush" aria-label="품목별 유입"><div class="card-h pad"><h2>품목별 유입</h2><span class="hint">목록과 순서는 기간과 상관없이 고정 (전체 기간 누적 방문순), 10개씩</span></div><div class="scroll">';
    var pg = pageOf(order, 10, 'tpage');
    h += '<table class="tbl wrap items"><thead><tr><th scope="col">품목코드</th><th scope="col">품목명</th><th scope="col" class="r">방문</th><th scope="col" class="r">비중</th><th scope="col" class="r">주문</th><th scope="col" class="r">전환율</th><th scope="col" class="r">결제금액</th>' + (has ? '<th scope="col" class="r">방문 비교 대비</th>' : '') + '</tr></thead><tbody>';
    pg.rows.forEach(function (k) {
      var o = TI.rows[k] || { visits: 0, orders: 0, rev: 0 }, pv = TP && TP.rows[k], multi = k.indexOf('MULTI:') === 0, none = k === C.NONE, zero = !o.visits;
      var code = multi ? '<span class="code muted">여러 품목</span>' : codeLabel(k);
      var name = none ? '품목 미지정 (매핑표에 없는 판매 페이지)' : multi ? esc(multiName(TI, k)) + '<br><small>' + esc(multiCodes(TI, k)) + '</small>' : esc(itemName(X, k));
      h += '<tr' + (zero ? ' class="zero-row"' : '') + '><th scope="row">' + code + '</th><td class="nm">' + name + '</td><td class="r num b">' + n0(o.visits) + '</td><td class="r num">' + pctOf(o.visits, cur.visits) + '</td><td class="r num">' + n0(o.orders) + '</td><td class="r num">' + pctOf(o.orders, o.visits) + '</td><td class="r num">' + n0(o.rev) + '</td>';
      if (has) h += '<td class="r num">' + (zero && !(pv && pv.visits) ? '-' : grow(o.visits, pv ? pv.visits : 0)) + '</td>';
      h += '</tr>';
    });
    h += '</tbody></table>' + pagerHtml(pg, true) + '</div>';
    h += '<p class="note pad">판매 페이지 방문을 품목코드로 연결했습니다. 한 페이지의 주문 수량 중 한 품목이 80% 이상이면 그 품목으로 보고(예: 위인 SET 페이지 → SOMD-0020), 여러 품목이 고르게 팔리는 페이지(예: 스티커북 택1)는 방문을 품목별로 나눌 수 없어 "여러 품목"으로 따로 보여줍니다.</p></section>';

    // 보관 데이터 (네이버 개편으로 수집 중단)
    var q = C.queryTop(DATA), cd = C.custDemo(DATA);
    h += '<div class="row">';
    h += '<section class="card grow1 flush" aria-label="검색어 보관 데이터"><div class="card-h pad"><h2>검색어 순위</h2><span class="tag">보관 데이터</span></div>';
    h += '<p class="note pad">' + (q.span.first ? dot(q.span.first) + ' ~ ' + dot(q.span.last) + ' 전체 합계. 네이버 대시보드 개편으로 검색어 유입 기능이 없어져 이후 데이터는 없습니다. 조회 기간과 상관없이 보관 기간 전체를 보여줍니다.' : '보관된 검색어 데이터가 없습니다.') + '</p>';
    if (q.list.length) {
      h += '<div class="scroll"><table class="tbl"><thead><tr><th scope="col">검색어</th><th scope="col" class="r">방문</th><th scope="col" class="r">주문</th><th scope="col" class="r">결제금액</th></tr></thead><tbody>';
      q.list.slice(0, 20).forEach(function (o) { h += '<tr><th scope="row">' + esc(o.q) + '</th><td class="r num b">' + n0(o.visits) + '</td><td class="r num">' + n0(o.orders) + '</td><td class="r num">' + n0(o.rev) + '</td></tr>'; });
      h += '</tbody></table></div>';
    }
    h += '</section>';
    h += '<section class="card grow1 flush" aria-label="고객 보관 데이터"><div class="card-h pad"><h2>성별, 나이별 방문 고객</h2><span class="tag">보관 데이터</span></div>';
    h += '<p class="note pad">' + (cd.span.first ? dot(cd.span.first) + ' 주 ~ ' + dot(cd.span.last) + ' 주 합계. 7월 이후 데이터는 없습니다.' : '보관된 고객 데이터가 없습니다.') + '</p>';
    if (cd.list.length) {
      h += '<div class="scroll"><table class="tbl"><thead><tr><th scope="col">구분</th><th scope="col" class="r">방문 고객</th><th scope="col" class="r">비중</th><th scope="col" class="r">결제 고객</th><th scope="col" class="r">결제금액</th></tr></thead><tbody>';
      cd.list.forEach(function (o) { h += '<tr><th scope="row">' + esc(o.seg) + '</th><td class="r num b">' + n0(o.visitCust) + '</td><td class="r num">' + pctOf(o.visitCust, cd.total) + '</td><td class="r num">' + n0(o.payCust) + '</td><td class="r num">' + n0(o.rev) + '</td></tr>'; });
      h += '</tbody></table></div>';
    }
    h += '</section></div>';
    return h;
  }
  function multiName(TI, k) { var o = TI.rows[k]; return o && o.page ? o.page : '판매 페이지 ' + k.slice(6); }
  function multiCodes(TI, k) { var p = TI.pageCodes[k.slice(6)]; if (!p) return ''; var c = p.codes; return c.slice(0, 5).join(', ') + (c.length > 5 ? ' 외 ' + (c.length - 5) + '개' : ''); }
  // 유입경로 표 (큰 분류 + 펼치면 세부)
  function trafficTable(groups, total, has, label) {
    var h = '<table class="tbl wrap"><thead><tr><th scope="col">' + label + '</th><th scope="col" class="r">방문</th><th scope="col" class="r">비중</th><th scope="col" class="r">주문</th><th scope="col" class="r">전환율</th><th scope="col" class="r">결제금액</th>' + (has ? '<th scope="col" class="r">방문 비교 대비</th>' : '') + '</tr></thead><tbody>';
    if (!groups.length) h += '<tr><td colspan="' + (has ? 7 : 6) + '" class="none">이 기간에 유입 데이터가 없습니다.</td></tr>';
    var t = { visits: 0, orders: 0, rev: 0, prev: 0 };
    groups.forEach(function (g) {
      var open = S.topen === g.key, o = g.o;
      t.visits += o.visits; t.orders += o.orders; t.rev += o.rev; t.prev += g.pv ? g.pv.visits : 0;
      h += '<tr><th scope="row"><button type="button" class="exp" data-act="topen" data-key="' + esc(g.key) + '" aria-expanded="' + open + '">' + (open ? '▾ ' : '▸ ') + esc(g.label) + '</button></th>';
      h += '<td class="r num b">' + n0(o.visits) + '</td><td class="r num">' + pctOf(o.visits, total) + '</td><td class="r num">' + n0(o.orders) + '</td><td class="r num">' + pctOf(o.orders, o.visits) + '</td><td class="r num">' + n0(o.rev) + '</td>' + (has ? '<td class="r num">' + grow(o.visits, g.pv ? g.pv.visits : 0) + '</td>' : '') + '</tr>';
      if (open) g.subs.forEach(function (x) {
        h += '<tr class="subrow"><th scope="row">└ ' + esc(x.label) + '</th><td class="r num">' + n0(x.o.visits) + '</td><td class="r num">' + pctOf(x.o.visits, total) + '</td><td class="r num">' + n0(x.o.orders) + '</td><td class="r num">' + pctOf(x.o.orders, x.o.visits) + '</td><td class="r num">' + n0(x.o.rev) + '</td>' + (has ? '<td class="r num">' + grow(x.o.visits, x.pv ? x.pv.visits : 0) + '</td>' : '') + '</tr>';
      });
    });
    if (groups.length) h += '<tr class="sum"><th scope="row">합계</th><td class="r num b">' + n0(t.visits) + '</td><td class="r num">100%</td><td class="r num">' + n0(t.orders) + '</td><td class="r num">' + pctOf(t.orders, t.visits) + '</td><td class="r num">' + n0(t.rev) + '</td>' + (has ? '<td class="r num">' + grow(t.visits, t.prev) + '</td>' : '') + '</tr>';
    return h + '</tbody></table>';
  }
  function downloadTrafficCsv() {
    var lines = [['구분', '경로 또는 품목코드', '세부 경로 또는 품목명', '방문', '주문', '결제금액']];
    C.trafficPaths(DATA, S.from, S.to).forEach(function (g) {
      lines.push(['유입경로', g.name, '', g.visits, g.orders, Math.round(g.rev)]);
      g.subList.forEach(function (x) { lines.push(['유입경로', g.name, x.name, x.visits, x.orders, Math.round(x.rev)]); });
    });
    var TI = C.trafficItems(DATA, S.from, S.to), X = itemModel(S.from, S.to);
    C.trafficOrder(DATA).concat([C.NONE]).forEach(function (k) {
      var o = TI.rows[k] || { visits: 0, orders: 0, rev: 0 }, multi = k.indexOf('MULTI:') === 0;
      lines.push(['품목별 유입', multi ? '여러 품목 (' + multiCodes(TI, k) + ')' : k === C.NONE ? '' : k, multi ? multiName(TI, k) : k === C.NONE ? '품목 미지정' : itemName(X, k), o.visits, o.orders, Math.round(o.rev)]);
    });
    saveCsv(lines, 'tomtomi_traffic_' + S.from + '_' + S.to + '.csv');
  }

  /* ───────── 데이터 관리: 파일 올리기, 상태 점검, 백업 ─────────
   * 파일 읽기는 v5 파서를 그대로 쓴다(v6/parsers.js). 지금 클라우드 데이터의 복사본에 파일을 적용해 보고,
   * 바뀌는 (채널, 날짜)만 골라 보여준 뒤, 확인을 누르면 그 줄만 저장한다. 그날 첫 저장 전에는 백업을 자동으로 받는다.
   */
  var UP = { busy: false, msg: '', plan: null, saving: false };
  var CH_LABEL = { naver: '네이버 판매', naverProd: '네이버 상품별 판매', naverVisit: '유입경로', naverProdVisit: '상품별 유입', naverOrder: '주문조회', naverAd: '네이버 SA', naverAdDetail: '네이버 SA 상세 (캠페인, 광고그룹, 소재)', naverAdCreative: '네이버 소재 → 상품 연결표', coupAdDetail: '쿠팡애즈 상세 (캠페인, 광고그룹, 상품)', naverAdBoost: '애드부스트', metaAd: '메타', coupAd: '쿠팡애즈', coupStock: '쿠팡 입고' };
  var BK_KEY = 'tt6_backup_day';
  function backupDay() { try { return localStorage.getItem(BK_KEY) || ''; } catch (e) { return ''; } }
  function canon(rows) { return JSON.stringify(rows.map(function (r) { return JSON.stringify(r, Object.keys(r).sort()); }).sort()); }
  function rowsOf(src, ch, d) { return (src[ch] || []).filter(function (e) { return (e && (e.d || e.date)) === d; }); }
  function readFile(f) {
    return new Promise(function (ok, fail) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = function () { fail(new Error('파일을 읽지 못했습니다: ' + f.name)); }; r.readAsArrayBuffer(f); });
  }
  function onUpload(files) {
    files = Array.prototype.slice.call(files || []); if (!files.length) return;
    UP.busy = true; UP.msg = ''; UP.plan = null; render();
    loadXlsx().then(function () {
      // 지금 클라우드 데이터의 복사본 (원본 RAW는 건드리지 않는다)
      var DB = JSON.parse(JSON.stringify(RAW)); ['naverAdRaw', 'metaAdRaw', 'coupAdRaw', 'naverRaw'].forEach(function (k) { DB[k] = DB[k] || []; });
      Object.keys(CH_LABEL).forEach(function (k) { DB[k] = DB[k] || []; });
      var P = root.TTParse.make(DB), list = [];
      return files.reduce(function (pr, f) {
        return pr.then(function () { return readFile(f); }).then(function (buf) {
          var name = f.name.normalize('NFC'), type = P.detect(name), item = { name: name, type: type, ok: false, keys: [], notes: [] };
          list.push(item);
          if (!type && /\.xlsx$/i.test(name)) { // 이름으로 모르는 xlsx: 네이버 소재 목록인지 칸 이름으로 확인
            var cwb = root.XLSX.read(buf, { type: 'array' }), cr = root.TTAdDetail.creatives(cwb);
            if (cr && cr.length) {
              var mp = {}; (DB.naverAdCreative || []).forEach(function (e) { mp[e.ad] = e; }); // 같은 업로드의 앞 파일까지 합친 상태에서 시작
              cr.forEach(function (e) { mp[e.ad] = e; }); // 같은 소재는 새 파일 값으로, 없던 소재는 추가 (기존 소재는 지우지 않음)
              DB.naverAdCreative = Object.keys(mp).sort().map(function (k) { return mp[k]; });
              P.touched['naverAdCreative|map'] = 1;
              item.type = 'adCreative'; item.label = '네이버 소재 목록 (소재 ID → 상품번호)'; item.ok = true; item.keys = ['naverAdCreative|map'];
              item.notes = ['소재 ' + cr.length + '개를 읽었습니다' + (cr.filter(function (e) { return !e.mall; }).length ? ' (상품번호를 못 찾은 소재 ' + cr.filter(function (e) { return !e.mall; }).length + '개)' : '')];
              return;
            }
          }
          if (!type) { item.err = '어떤 파일인지 알 수 없습니다 (파일 이름을 확인해 주세요)'; return; }
          if (!root.TTParse.SUPPORTED[type]) { item.err = 'v6에서는 아직 받지 않는 파일입니다. v5 화면에서 올려 주세요'; return; }
          var before = Object.keys(P.touched).length, nb = P.notes.length, ok;
          try {
            if (/\.csv$/i.test(name)) {
              var txt = new TextDecoder('utf-8').decode(buf);
              ok = P.parseCSV(txt, type);
              if (ok && type === 'naverAd') {
                root.TTAdDetail.naver(txt, DB, P.touched); // 캠페인, 광고그룹, 소재 상세도 저장
                // 광고그룹/소재 단위 보고서는 노출수가 캠페인 단위 보고서보다 적게 잡힌다(소재에 안 붙는 노출 제외).
                // 그래서 이미 저장된 날짜의 일별 합계는 그대로 두고, 합계가 없는 날짜만 이 파일로 채운다.
                if (root.TTAdDetail.isDetailCsv(txt)) {
                  var keep = {}; (RAW.naverAd || []).forEach(function (e) { keep[e.d] = 1; });
                  var kept = 0;
                  DB.naverAd = DB.naverAd.filter(function (e) { return !keep[e.d]; }).concat((RAW.naverAd || []).filter(function (e) { return keep[e.d] && P.touched['naverAd|' + e.d]; }).map(function (e) { kept++; return JSON.parse(JSON.stringify(e)); }));
                  // 파일에 없던 날짜인데 기존에만 있던 날짜도 원래대로
                  (RAW.naverAd || []).forEach(function (e) { if (!P.touched['naverAd|' + e.d] && !DB.naverAd.some(function (x) { return x.d === e.d; })) DB.naverAd.push(JSON.parse(JSON.stringify(e))); });
                  if (kept) P.notes.push('광고그룹/소재 단위 파일이라 이미 저장된 ' + kept + '일의 일별 합계(노출수 등)는 그대로 두고 상세만 저장합니다.');
                }
              }
            } else {
              var wb = root.XLSX.read(buf, { type: 'array', cellDates: true, raw: false });
              ok = P.parseXLSX(wb, type, name);
              if (ok && type === 'coupAdProd') root.TTAdDetail.coupang(wb, DB, P.touched); // 캠페인, 광고그룹, 상품 상세도 저장
            }
          } catch (e) { ok = false; item.err = '읽는 중 오류: ' + (e && e.message); }
          item.ok = !!ok; item.notes = P.notes.slice(nb);
          if (!ok && !item.err) item.err = '양식이 달라 읽지 못했습니다';
          item.keys = Object.keys(P.touched).slice(before);
        });
      }, Promise.resolve()).then(function () { UP.plan = makePlan(DB, list, P.touched); });
    }).catch(function (e) { UP.msg = '파일을 읽지 못했습니다: ' + (e && e.message); }).then(function () { UP.busy = false; render(); });
  }
  // 바뀌는 (채널, 날짜) 정리: 새 날짜 / 값이 바뀌는 날짜 / 같은 날짜
  function makePlan(DB, list, touched) {
    var meta = RAW._meta || {}, rows = [], st = { add: 0, change: 0, same: 0 }, blocked = {};
    var byKey = {};
    Object.keys(touched).forEach(function (k) {
      var sp = k.split('|'), ch = sp[0], d = sp[1];
      var a = rowsOf(RAW, ch, d), b = rowsOf(DB, ch, d), kind = !a.length ? 'add' : canon(a) === canon(b) ? 'same' : 'change';
      if (meta[ch] && meta[ch].odd) blocked[ch] = meta[ch].odd;
      byKey[k] = { ch: ch, d: d, kind: kind, before: a.length, after: b.length };
      st[kind]++;
      if (kind !== 'same') rows.push({ channel: ch, date: d, data: b });
    });
    list.forEach(function (it) {
      var g = {};
      it.keys.forEach(function (k) { var x = byKey[k]; if (!x) return; var o = g[x.ch] || (g[x.ch] = { ch: x.ch, from: x.d, to: x.d, add: 0, change: 0, same: 0, changes: [] }); if (x.d < o.from) o.from = x.d; if (x.d > o.to) o.to = x.d; o[x.kind]++; if (x.kind === 'change') o.changes.push(x); });
      it.groups = Object.keys(g).map(function (c) { return g[c]; });
    });
    return { files: list, rows: rows, st: st, blocked: blocked };
  }
  function downloadBackup() {
    var data = { ARCHIVE: {}, RAW: {}, v6: { at: new Date().toISOString() } };
    Object.keys(RAW).forEach(function (k) { if (k.charAt(0) !== '_' && Array.isArray(RAW[k])) data.ARCHIVE[k] = RAW[k]; });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = 'archive_' + today().replace(/-/g, '') + '_' + new Date().toTimeString().slice(0, 5).replace(':', '') + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(a.href); }, 1000);
    try { localStorage.setItem(BK_KEY, today()); } catch (e) { /* 저장 못 하면 다음에도 백업을 받는다(안전한 쪽) */ }
  }
  function saveUpload() {
    var pl = UP.plan; if (!pl || !pl.rows.length || UP.saving) return;
    if (Object.keys(pl.blocked).length) { UP.msg = '저장 구조가 예상과 달라 저장을 멈췄습니다. 이 화면을 캡처해서 알려 주세요.'; render(); return; }
    var needBk = backupDay() !== today();
    if (needBk) downloadBackup();
    UP.saving = true; render();
    root.TTData.saveRows(pl.rows).then(function (n) {
      UP.msg = '저장했습니다: ' + n + '줄 (새 날짜 ' + pl.st.add + ', 바뀐 날짜 ' + pl.st.change + ')' + (needBk ? '. 저장 전에 백업 파일을 받았습니다.' : '. 오늘 백업은 이미 받아서 건너뛰었습니다.');
      UP.plan = null;
      return reloadData();
    }).catch(function (e) { UP.msg = '저장하지 못했습니다. ' + (e && e.message) + ' (일부만 저장됐을 수 있으니 다시 올려 주세요. 같은 날짜는 덮어쓰기라 다시 올려도 겹치지 않습니다)'; })
      .then(function () { UP.saving = false; render(); });
  }
  function reloadData() {
    return root.TTData.load().then(function (raw) { RAW = raw; DATA = C.normalize(raw); META = { otherOk: raw._otherOk }; PCACHE = { key: '', M: null }; ICACHE = { key: '', X: null }; IORDER = { key: '', list: null }; });
  }
  function viewData() {
    var h = '';
    // 파일 올리기
    h += '<section class="card" aria-label="파일 올리기"><div class="card-h"><h2>파일 올리기</h2><span class="hint">여러 개를 한 번에 올려도 됩니다. 저장 전에 무엇이 바뀌는지 먼저 보여줍니다</span></div>';
    h += '<label class="drop" data-drop="1"><input type="file" multiple accept=".xlsx,.csv" data-act="upfiles" hidden><b>' + (UP.busy ? '읽는 중…' : '여기로 파일을 끌어다 놓거나 눌러서 고르기') + '</b><span>받는 파일: ' + Object.keys(root.TTParse.SUPPORTED).map(function (k) { return root.TTParse.SUPPORTED[k]; }).join(', ') + '</span></label>';
    if (UP.msg) h += '<p class="note"><b>' + esc(UP.msg) + '</b></p>';
    var pl = UP.plan;
    if (pl) {
      h += '<div class="plan">';
      pl.files.forEach(function (it) {
        h += '<div class="pf"><div class="pf-h"><b>' + esc(it.name) + '</b><span>' + (it.err ? miss(esc(it.err)) : esc(it.label || root.TTParse.SUPPORTED[it.type])) + '</span></div>';
        (it.groups || []).forEach(function (g) {
          h += '<div class="pf-g"><span>' + esc(CH_LABEL[g.ch] || g.ch) + ' <small>' + dot(g.from) + (g.to !== g.from ? ' ~ ' + dot(g.to) : '') + '</small></span><span>' + (g.add ? '<b class="up">새 날짜 ' + g.add + '일</b> ' : '') + (g.change ? '<b class="warn">⚠️ 값이 바뀌는 날짜 ' + g.change + '일</b> ' : '') + (g.same ? '<span class="zero">이미 같은 값 ' + g.same + '일</span>' : '') + '</span></div>';
          if (g.change) h += '<div class="pf-c">' + g.changes.slice(0, 6).map(function (x) { return dot(x.d) + ' (' + x.before + '줄 → ' + x.after + '줄)'; }).join(', ') + (g.changes.length > 6 ? ' 외 ' + (g.changes.length - 6) + '일' : '') + '</div>';
        });
        if (it.ok && !(it.groups || []).length) h += '<div class="pf-g"><span class="zero">바뀌는 내용이 없습니다</span></div>';
        it.notes.forEach(function (n) { h += '<div class="pf-c">' + esc(n) + '</div>'; });
        h += '</div>';
      });
      var bk = backupDay() === today();
      if (Object.keys(pl.blocked).length) h += '<p class="note"><b class="down">저장 구조 점검에서 이상이 발견돼 저장할 수 없습니다: ' + esc(Object.keys(pl.blocked).join(', ')) + '</b></p>';
      h += '<div class="plan-f"><span>저장할 줄: <b>' + pl.rows.length + '</b> (새 날짜 ' + pl.st.add + ', 바뀌는 날짜 ' + pl.st.change + ', 같아서 건너뜀 ' + pl.st.same + ')</span>';
      h += pl.rows.length ? '<button type="button" class="btn" data-act="upsave"' + (UP.saving || Object.keys(pl.blocked).length ? ' disabled' : '') + '>' + (UP.saving ? '저장 중…' : bk ? '저장 (오늘 백업 받음)' : '백업 받고 저장') + '</button>' : '';
      h += ' <button type="button" class="chip" data-act="upcancel">취소</button></div>';
      if (pl.st.change) h += '<p class="note">⚠️ 값이 바뀌는 날짜는 기존 값을 새 파일 값으로 덮어씁니다. 같은 날짜를 다시 받은 파일이면 정상이고(환불 반영 등), 엉뚱한 파일이면 취소해 주세요.</p>';
      h += '</div>';
    }
    h += '</section>';

    // 데이터 상태
    var hl = C.health(DATA, today()), td = today();
    function lastOf(rows) { var m = ''; rows.forEach(function (e) { if (e.d > m) m = e.d; }); return m; }
    function missing(rows, n) { var have = {}, cnt = 0, d, end = DATA.last; rows.forEach(function (e) { have[e.d] = 1; }); for (d = C.addDays(end, -(n - 1)); d <= end; d = C.addDays(d, 1)) if (!have[d]) cnt++; return cnt; }
    function rawDays(ch) { return (RAW[ch] || []).map(function (e) { return { d: e.d }; }); }
    var lines = [['네이버 판매 (sales_)', DATA.naver, true], ['유입 (visit_)', DATA.traffic, true], ['주문조회', DATA.orders, true], ['네이버 SA', DATA.ads.sa, true], ['└ 네이버 SA 상세', rawDays('naverAdDetail'), true], ['메타', DATA.ads.meta, true], ['애드부스트', DATA.ads.boost, false], ['쿠팡애즈', DATA.ads.coupang, false], ['└ 쿠팡애즈 상세', rawDays('coupAdDetail'), false], ['쿠팡 입고', DATA.coupang, false]];
    h += '<section class="card flush" aria-label="데이터 상태"><div class="card-h pad"><h2>데이터 상태</h2><span class="hint">빠진 날짜는 데이터 기준일 ' + dot(DATA.last) + '까지 최근 30일 기준</span></div><div class="scroll"><table class="tbl"><thead><tr><th scope="col">데이터</th><th scope="col">마지막 날짜</th><th scope="col" class="r">빠진 날짜 (최근 30일)</th></tr></thead><tbody>';
    lines.forEach(function (l) { var last = lastOf(l[1]), m = l[2] ? missing(l[1], 30) : null; h += '<tr><th scope="row">' + l[0] + '</th><td class="num">' + (last ? dot(last) + ' <small class="zero">(' + C.dayDiff(last, td) + '일 전)</small>' : '-') + '</td><td class="r num">' + (m === null ? '<span class="zero">집행한 날만 있음</span>' : m ? '<b class="warn">' + m + '일</b>' : '없음') + '</td></tr>'; });
    h += '</tbody></table></div>';
    h += '<div class="li"><span>주문조회와 판매 파일 대조 불일치</span><b class="num">' + (hl.mismatch === null ? '-' : hl.mismatch ? '<span class="warn">' + hl.mismatch + '일</span>' : '없음') + '</b></div>';
    h += '<div class="li"><span>매핑표에 없는 옵션</span><b class="num">' + (hl.unmapped === null ? '-' : hl.unmapped ? '<span class="warn">' + hl.unmapped + '종</span>' : '없음') + '</b></div>';
    h += '<div class="li"><span>기타마켓 구글 시트</span><b class="num">' + (META && META.otherOk ? '연결됨 (마지막 ' + dot(lastOf(DATA.other)) + ')' : '<span class="warn">연결 안 됨</span>') + '</b></div>';
    h += '</section>';

    // 백업, 그 밖의 관리
    var bkd = backupDay();
    h += '<div class="row"><section class="card grow1" aria-label="백업"><div class="card-h"><h2>백업</h2></div><p class="note">클라우드에 저장된 전체 데이터를 JSON 파일로 받습니다. 파일 올리기로 저장할 때는 그날 첫 저장 전에 자동으로 받습니다. 백업 파일은 공개 저장소(GitHub)에 올리지 마세요.</p><p class="note">이 브라우저에서 마지막 자동/수동 백업: <b>' + (bkd ? dot(bkd) : '기록 없음') + '</b></p><div><button type="button" class="chip" data-act="backup">지금 백업 받기</button></div></section>';
    h += '<section class="card grow1" aria-label="그 밖의 관리"><div class="card-h"><h2>그 밖의 관리</h2></div><div class="li"><span>원가표 올리기</span><button type="button" class="chip" data-act="view" data-key="products">상품 메뉴로</button></div><div class="li"><span>옵션 매핑표 올리기, 상품성과, 검색어, 고객 파일</span><a class="chip" href="index.html">v5 화면에서</a></div><div class="li"><span>쿠팡 상품번호 매핑</span><span class="zero">새 쿠팡 상품이 생기면 Claude에게 알려 주세요</span></div></section></div>';
    return h;
  }

  /* ───────── 프로모션 ─────────
   * 프로모션(기획전 등)을 등록해 두면 기간 매출, 평소 대비 증분, 비용, ROI를 계산한다. 계산 규칙은 calc.js promoCalc.
   * 저장: channel=promo, date=프로모션 id 한 줄. 지우기는 del 표시만 한다(줄을 없애지 않음).
   */
  var PR = { form: null, open: '', msg: '', saving: false, q: '', delAsk: false, cache: {} };
  var PKINDS = ['기획전', '기간 할인', '쿠폰', '사은품/증정', '라이브', '체험단', '기타'];
  var PCH = [['naver', '네이버'], ['coupang', '쿠팡'], ['other', '기타몰'], ['all', '전체 채널']];
  var PBASE = [['prev', '바로 앞 같은 길이'], ['lastYear', '작년 같은 기간'], ['custom', '직접 지정'], ['none', '비교하지 않음']];
  var PADMODE = [['full', '기간 광고비 전부'], ['extra', '평소보다 더 쓴 만큼만'], ['none', '넣지 않음']];
  function pName(list, key) { var f = list.filter(function (x) { return x[0] === key; })[0]; return f ? f[1] : list[0][1]; }
  function promoGet(id) { return DATA.promos.filter(function (p) { return p.id === id; })[0] || null; }
  function promoKey(p) { return p.id + '|' + (p.updated || '') + '|' + DATA.last + '|' + (DATA.costVer ? DATA.costVer.ver : ''); }
  function promoRes(p) { var k = promoKey(p); return PR.cache[k] || (PR.cache[k] = C.promoCalc(DATA, p)); }
  function pItemLabel(code) { return (code.indexOf('CP:') === 0 ? '코드 없음' : code) + ' ' + itemName(itemModel(S.from, S.to), code); }
  function signed(v) { return (v > 0 ? '+' : '') + n0(v); }
  function roiText(v) { return v === null || v === undefined ? '-' : (v > 0 ? '+' : '') + n0(v * 100) + '%'; }
  function promoBlank() {
    var last = DATA.promos.filter(function (p) { return p.fee !== undefined && p.fee !== '' && p.ch !== 'coupang' && p.ch !== 'other'; })[0]; // 수수료율은 지난번 값을 먼저 채워 둔다
    return { id: '', name: '', kind: PKINDS[0], from: '', to: '', ch: 'naver', items: [], fee: last ? String(last.fee) : '', base: 'prev', baseFrom: '', ad: 'full', adExtra: '', coupon: '', gift: '', etc: '', memo: '' };
  }
  function promoToForm(p) {
    var c = p.costs || {};
    function t(v) { return v ? String(v) : ''; }
    return { id: p.id, name: p.name || '', kind: p.kind || PKINDS[0], from: p.from, to: p.to, ch: p.ch || 'all', items: (p.items || []).slice(), fee: p.fee === undefined ? '' : String(p.fee), base: p.base || 'prev', baseFrom: p.baseFrom || '', ad: p.ad || 'full', adExtra: t(c.adExtra), coupon: t(c.coupon), gift: t(c.gift), etc: t(c.etc), memo: p.memo || '' };
  }
  function promoSuggest() {
    var q = PR.q.trim().toLowerCase(); if (!q || !PR.form) return '';
    var words = q.split(/\s+/), have = {}; PR.form.items.forEach(function (c) { have[c] = 1; });
    var hits = itemOrder().filter(function (c) { if (have[c]) return false; var t = pItemLabel(c).toLowerCase(); return words.every(function (w) { return t.indexOf(w) >= 0; }); }).slice(0, 8);
    if (!hits.length) return '<div class="aisug-none">검색 결과가 없습니다</div>';
    return hits.map(function (c, i) { return '<button type="button" role="option" class="aisug-i' + (i === 0 ? ' first' : '') + '" data-act="ppick" data-key="' + esc(c) + '"><span>' + esc(pItemLabel(c)) + '</span><small>추가</small></button>'; }).join('');
  }
  function promoFormHtml() {
    var f = PR.form, h = '';
    function txt(label, field, ph, cls, hint) { return '<label' + (cls ? ' class="' + cls + '"' : '') + '><span>' + label + '</span><input type="text" data-pf="' + field + '" value="' + esc(f[field]) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + ' autocomplete="off">' + (hint ? '<small>' + hint + '</small>' : '') + '</label>'; }
    function won1(label, field, hint) { return '<label><span>' + label + '</span><input type="text" inputmode="numeric" data-pf="' + field + '" value="' + esc(f[field]) + '" placeholder="0" autocomplete="off">' + (hint ? '<small>' + hint + '</small>' : '') + '</label>'; }
    function date(label, field) { return '<label><span>' + label + '</span><input type="date" data-pf="' + field + '" value="' + esc(f[field]) + '"></label>'; }
    function sel(label, field, opts, hint) { return '<label><span>' + label + '</span><select data-pf="' + field + '">' + opts.map(function (o) { var v = Array.isArray(o) ? o[0] : o, n = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (f[field] === v ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select>' + (hint ? '<small>' + hint + '</small>' : '') + '</label>'; }
    h += '<section class="card" aria-label="프로모션 등록"><div class="card-h"><h2>' + (f.id ? '프로모션 수정' : '프로모션 등록') + '</h2><span class="hint">기간이 미래여도 미리 등록할 수 있습니다</span></div>';
    h += '<div class="pform">' + txt('이름', 'name', '예: 11월 위인 기획전', 'w2') + sel('종류', 'kind', PKINDS) + sel('채널', 'ch', PCH, '어느 채널 매출로 볼지') + date('시작일', 'from') + date('종료일', 'to');
    h += sel('평소 매출 (비교 기준)', 'base', PBASE, '시즌 상품은 작년 같은 기간이 더 맞습니다') + (f.base === 'custom' ? date('비교 기간 시작일', 'baseFrom') : '') + '</div>';
    h += '<div class="pitems"><b>대상 품목</b><div class="pchips">';
    if (!f.items.length) h += '<span class="zero">고르지 않으면 이 채널의 전체 매출로 계산합니다</span>';
    f.items.forEach(function (c) { h += '<span class="pchip">' + esc(pItemLabel(c)) + '<button type="button" data-act="pitemdel" data-key="' + esc(c) + '" aria-label="' + esc(c) + ' 빼기">×</button></span>'; });
    h += '</div><div class="aibox"><input id="pq" type="search" data-act="pq" value="' + esc(PR.q) + '" placeholder="품목코드나 품목명으로 검색해서 추가 (예: 위인, SOMD-0018)" autocomplete="off" aria-controls="psug"><div id="psug" class="aisug" role="listbox"' + (PR.q.trim() ? '' : ' hidden') + '>' + promoSuggest() + '</div></div></div>';
    h += '<div class="pform">' + sel('광고비 (자동으로 가져옴)', 'ad', PADMODE, '대상 품목의 네이버 SA, 쿠팡애즈 광고비') + won1('그 밖의 광고비 (원)', 'adExtra', '메타, 인플루언서처럼 품목에 연결 안 되는 광고');
    h += won1('쿠폰/할인 부담액 (원)', 'coupon', '판매가를 낮춘 할인은 넣지 않습니다 (매출에 이미 반영)') + won1('사은품/증정 (원)', 'gift') + won1('기타 비용 (원)', 'etc', '참가비, 제작비 등');
    h += (f.ch === 'coupang' || f.ch === 'other' ? '' : txt('네이버 수수료율 (%)', 'fee', '예: 5.5', '', '이 프로모션 때의 수수료율. 저장해 두면 나중에 바뀌어도 이 값으로 계산')) + txt('메모', 'memo', '', 'w2') + '</div>';
    h += '<p class="note" id="pmsg"' + (PR.msg ? '' : ' hidden') + '><b class="warn">' + esc(PR.msg) + '</b></p>';
    h += '<div class="plan-f"><span></span>';
    if (f.id) h += PR.delAsk ? '<button type="button" class="chip" data-act="pdel"' + (PR.saving ? ' disabled' : '') + '>정말 지우기</button>' : '<button type="button" class="chip" data-act="pdelask">지우기</button>';
    h += '<button type="button" class="chip" data-act="pcancel">취소</button><button type="button" class="btn" data-act="psave"' + (PR.saving ? ' disabled' : '') + '>' + (PR.saving ? '저장 중…' : '저장') + '</button></div></section>';
    return h;
  }
  function promoWrite(rec, okMsg) {
    PR.saving = true; PR.msg = ''; render();
    root.TTData.saveRows([{ channel: 'promo', date: rec.id, data: [rec] }]).then(function () {
      RAW.promo = (RAW.promo || []).filter(function (p) { return p && p.id !== rec.id; }); RAW.promo.push(rec);
      DATA.promos = C.promoList(RAW.promo); PR.form = null; PR.q = ''; PR.delAsk = false; PR.open = rec.del ? '' : rec.id; PR.msg = okMsg; S.ppage = 0;
    }).catch(function (e) { PR.msg = '저장하지 못했습니다. ' + (e && e.message); })
      .then(function () { PR.saving = false; render(); });
  }
  function promoSave() {
    var f = PR.form; if (!f || PR.saving) return;
    var name = f.name.trim(), fee = f.fee.trim() === '' ? 0 : C.num(f.fee);
    function bad(m) { PR.msg = m; render(); }
    if (!name) return bad('이름을 적어 주세요.');
    if (!f.from || !f.to) return bad('시작일과 종료일을 골라 주세요.');
    if (f.from > f.to) return bad('종료일이 시작일보다 빠릅니다.');
    if (f.base === 'custom' && !f.baseFrom) return bad('비교 기간 시작일을 골라 주세요.');
    if (f.base === 'custom' && f.baseFrom <= f.to && C.addDays(f.baseFrom, C.dayDiff(f.from, f.to)) >= f.from) return bad('비교 기간이 프로모션 기간과 겹칩니다.');
    if (!(fee >= 0 && fee < 100)) return bad('수수료율은 0 이상 100 미만의 숫자(%)로 적어 주세요.');
    var costs = {}, neg = false;
    ['adExtra', 'coupon', 'gift', 'etc'].forEach(function (k) { var v = C.num(f[k]); if (v < 0 || (f[k].trim() && isNaN(parseFloat(f[k].replace(/,/g, ''))))) neg = true; costs[k] = v || 0; });
    if (neg) return bad('비용은 0 이상의 숫자로 적어 주세요.');
    var naverSide = f.ch !== 'coupang' && f.ch !== 'other';
    promoWrite({ d: f.id || 'p' + Date.now().toString(36), id: f.id || 'p' + Date.now().toString(36), name: name, kind: f.kind, from: f.from, to: f.to, ch: f.ch, items: f.items.slice(), fee: naverSide ? fee : 0, base: f.base, baseFrom: f.base === 'custom' ? f.baseFrom : '', ad: f.ad, costs: costs, memo: f.memo.trim(), updated: new Date().toISOString() }, '저장했습니다.');
  }
  function promoDelete() {
    var p = PR.form && PR.form.id ? promoGet(PR.form.id) : null; if (!p || PR.saving) return;
    var rec = {}; Object.keys(p).forEach(function (k) { rec[k] = p[k]; }); rec.del = 1; rec.updated = new Date().toISOString();
    promoWrite(rec, '지웠습니다.');
  }
  function promoPeriod(p) { return dot(p.from) + ' ~ ' + dot(p.to) + ' <small class="zero">(' + (C.dayDiff(p.from, p.to) + 1) + '일)</small>'; }
  function promoState(R) { return R.state === 'plan' ? '<span class="chtag wait">예정</span>' : R.state === 'run' ? '<span class="chtag on">진행 중</span>' : ''; }
  function roiWhy(R) {
    if (R.state === 'plan') return '아직 데이터 없음';
    if (!R.b) return '비교 기준 없음';
    if (!R.costOk) return '원가 미입력';
    if (!(R.cost > 0)) return '비용 0원';
    return '';
  }
  function promoDetailHtml(p) {
    var R = promoRes(p), h = '', X = itemModel(S.from, S.to);
    h += '<section class="card" aria-label="프로모션 요약"><div class="card-h"><h2>' + esc(p.name) + ' ' + promoState(R) + '</h2><span class="hint">' + esc(p.kind || '') + ', ' + pName(PCH, p.ch) + ', ' + dot(p.from) + ' ~ ' + dot(p.to) + '</span><button type="button" class="chip" data-act="pedit" data-key="' + esc(p.id) + '">수정</button></div>';
    if (p.memo) h += '<p class="note">메모: ' + esc(p.memo) + '</p>';
    if (R.state === 'plan') return h + '<p class="note">아직 이 기간의 판매 데이터가 없습니다. 데이터가 올라오면 자동으로 계산됩니다 (지금 데이터 기준일 ' + dot(DATA.last) + ').</p></section>';
    if (R.state === 'run') h += '<p class="note"><b>진행 중:</b> 데이터가 있는 ' + dot(R.range.to) + '까지 ' + (C.dayDiff(R.range.from, R.range.to) + 1) + '일치로 계산했고, 비교 기간도 같은 길이로 맞췄습니다. 직접 입력한 비용은 전체 금액이라 끝나기 전에는 ROI가 낮게 보입니다.</p>';
    h += '</section>';
    var why = roiWhy(R), cur = R.cur, b = R.b;
    h += '<section class="strip" aria-label="프로모션 성과">';
    h += cell('판매 수량', n0(cur.qty) + '개', b ? '평소 ' + n0(b.qty) + '개' : '');
    h += cell('매출', n0(cur.rev), 'ROAS ' + roasText(R.roas));
    h += cell('증분 매출', R.incRev === null ? '-' : signed(R.incRev), b ? '평소 ' + n0(b.rev) + '원 (' + dot(R.base.from).slice(2) + ' ~ ' + dot(R.base.to).slice(2) + ')' : '비교 기준 없음');
    h += cell('프로모션 비용', n0(R.cost), '광고 ' + n0(R.adCost) + ' + 직접 입력 ' + n0(R.manualSum));
    h += cell('증분 이익', R.incProfit === null ? '-' : signed(R.incProfit), R.incProfit === null ? (why || '') : '증분 매출 - 원가' + (R.rate ? ' - 수수료' : '') + ' - 비용');
    h += cell('ROI', roiText(R.roi), why || '증분 이익 ÷ 비용');
    h += '</section>';
    var notes = [];
    if (R.baseShort) notes.push('⚠️ 비교 기간(' + dot(R.base.from) + ' ~ ' + dot(R.base.to) + ')이 데이터 시작일 ' + dot(DATA.first) + '보다 앞이라 평소 매출이 실제보다 작게 잡혔을 수 있습니다.');
    if (!R.costOk) { var nc = {}; cur.noCostCodes.concat(b ? b.noCostCodes : []).forEach(function (c) { nc[c] = 1; }); var ncl = Object.keys(nc); notes.push('원가가 없어 ROI를 계산하지 않았습니다' + (ncl.length ? ': ' + ncl.slice(0, 8).join(', ') + (ncl.length > 8 ? ' 외 ' + (ncl.length - 8) + '개' : '') : '') + ((cur.unknown || (b && b.unknown)) ? (ncl.length ? ', ' : ': ') + '품목 미지정 매출 ' + n0(cur.unknown) + '원' : '') + '. 원가표를 올리면 자동으로 계산됩니다.'); }
    if (cur.est) notes.push('네이버 매출은 판매 페이지 순매출을 품목 수량 비율로 나눈 값(약)입니다.');
    notes.push('증분은 "프로모션이 없었다면 평소만큼 팔렸을 것"이라는 가정의 추정값입니다. 쿠팡은 입고(발주) 기준이라 소비자 판매와 날짜가 다를 수 있습니다.');
    h += '<span class="note tight">' + notes.join(' ') + '</span>';

    // 차트: 프로모션 기간(색칠) + 앞뒤, 평소 하루 평균(점선)
    var len = C.dayDiff(R.range.from, R.range.to) + 1, pad = Math.min(14, len), wf = C.addDays(R.range.from, -pad), wt = C.addDays(p.to, pad);
    if (wf < DATA.first) wf = DATA.first; if (wt > DATA.last) wt = DATA.last;
    var days = C.dayDiff(wf, wt) + 1;
    h += '<section class="card" aria-label="프로모션 추이"><div class="card-h"><h2>날짜별 매출</h2><span class="legend"><span class="lg-line"></span>대상 매출</span>' + (b ? '<span class="legend"><span class="lg-dash"></span>평소 하루 평균</span>' : '') + '<span class="legend"><span class="lg-bar"></span>광고비</span></div>';
    if (days > 120) h += '<p class="note">기간이 120일을 넘어 차트는 생략했습니다.</p>';
    else if (days < 2) h += '<p class="note">데이터가 하루뿐이라 차트는 생략했습니다.</p>';
    else {
      var dk = 'd|' + promoKey(p) + '|' + wf + '|' + wt, rows = PR.cache[dk] || (PR.cache[dk] = C.promoDaily(DATA, p, wf, wt));
      var ser = rows.map(function (o) { return { key: o.d, label: o.d.slice(5, 7) + '.' + o.d.slice(8, 10), sales: o.rev, ad: o.ad }; }), a = -1, z = -1;
      ser.forEach(function (o, i) { if (o.key >= R.range.from && o.key <= R.range.to) { if (a < 0) a = i; z = i; } });
      var avg = b ? b.rev / len : 0, prev = b ? ser.map(function () { return { label: '평소 하루 평균', sales: avg }; }) : null;
      h += chartSvg(ser, prev, a < 0 ? null : { a: a, b: z }, { line: '대상 매출', bar: '광고비' });
      h += '<span class="note">색칠한 구간이 프로모션 기간입니다. 앞뒤 ' + pad + '일을 함께 보여줍니다.</span>';
    }
    h += '</section>';

    // 품목별
    var codes = Object.keys(cur.rows); if (b) Object.keys(b.rows).forEach(function (c) { if (!cur.rows[c]) codes.push(c); });
    codes.sort(function (x, y) { return ((cur.rows[y] || {}).rev || 0) - ((cur.rows[x] || {}).rev || 0) || (x < y ? -1 : 1); });
    var pg = pageOf(codes, 10, 'ppage');
    h += '<div class="row"><section class="card flush grow2" aria-label="품목별 성과"><div class="card-h pad"><h2>품목별</h2><span class="hint">' + (p.items && p.items.length ? '대상 품목 ' + p.items.length + '개' : '대상 품목을 고르지 않아 채널 전체') + '</span></div><div class="scroll"><table class="tbl wrap items"><thead><tr><th scope="col">품목코드</th><th scope="col">품목명</th><th scope="col" class="r">수량</th><th scope="col" class="r">매출</th>' + (b ? '<th scope="col" class="r">평소 매출</th><th scope="col" class="r">증분</th>' : '') + '<th scope="col" class="r">원가</th><th scope="col" class="r">매출 - 원가</th></tr></thead><tbody>';
    function z0() { return { qty: 0, rev: 0, cost: 0, noCost: 0 }; }
    pg.rows.forEach(function (c) {
      var o = cur.rows[c] || z0(), bo = b ? (b.rows[c] || z0()) : null, okc = o.noCost === 0 && c !== C.NONE;
      h += '<tr><th scope="row">' + codeLabel(c) + '</th><td>' + esc(c === C.NONE ? '품목 미지정' : itemName(X, c)) + '</td><td class="r num">' + n0(o.qty) + '</td><td class="r num b">' + n0(o.rev) + '</td>' + (b ? '<td class="r num">' + n0(bo.rev) + '</td><td class="r num">' + signed(o.rev - bo.rev) + '</td>' : '') + '<td class="r num">' + (okc ? n0(o.cost) : miss('미입력')) + '</td><td class="r num">' + (okc ? n0(o.rev - o.cost) : '-') + '</td></tr>';
    });
    if (!codes.length) h += '<tr><td colspan="8" class="none">이 기간에 판매가 없습니다.</td></tr>';
    h += '<tr class="sum"><th scope="row">합계</th><td></td><td class="r num">' + n0(cur.qty) + '</td><td class="r num b">' + n0(cur.rev) + '</td>' + (b ? '<td class="r num">' + n0(b.rev) + '</td><td class="r num">' + signed(R.incRev) + '</td>' : '') + '<td class="r num">' + (cur.noCost === 0 ? n0(cur.cost) : miss('일부 미입력')) + '</td><td class="r num">' + (cur.noCost === 0 ? n0(cur.rev - cur.cost) : '-') + '</td></tr>';
    h += '</tbody></table>' + pagerHtml(pg, true) + '</div></section>';

    // 비용 내역
    h += '<section class="card flush grow1" aria-label="비용 내역"><div class="card-h pad"><h2>비용 내역</h2><span class="hint">광고비: ' + pName(PADMODE, R.adMode) + '</span></div>';
    function li(n, v, sub) { return '<div class="li"><span>' + n + (sub ? ' <small>' + sub + '</small>' : '') + '</span><b class="num">' + v + '</b></div>'; }
    if (R.adMode !== 'none') {
      R.adCur.lines.slice(0, 6).forEach(function (l) { h += li(esc(l.name), n0(l.cost)); });
      if (R.adCur.lines.length > 6) h += li('그 밖의 광고 ' + (R.adCur.lines.length - 6) + '개', n0(R.adCur.lines.slice(6).reduce(function (t, l) { return t + l.cost; }, 0)));
      if (!R.adCur.lines.length) h += li('자동으로 잡힌 광고비', '0', p.ch === 'other' ? '기타몰은 광고 데이터 없음' : '이 기간 대상 품목 광고 없음');
      if (R.adMode === 'extra' && R.adBase) h += li('평소 광고비 (뺌)', '-' + n0(Math.min(R.adBase.cost, R.adCur.cost)), '비교 기간 ' + n0(R.adBase.cost) + '원');
    }
    [['adExtra', '그 밖의 광고비'], ['coupon', '쿠폰/할인 부담액'], ['gift', '사은품/증정'], ['etc', '기타 비용']].forEach(function (k) { if (R.manual[k[0]]) h += li(k[1], n0(R.manual[k[0]]), '직접 입력'); });
    h += '<div class="li sumli"><span>프로모션 비용 합계</span><b class="num">' + n0(R.cost) + '</b></div>';
    if (R.rate) h += '<div class="ref" style="margin:12px 18px 16px"><b>네이버 수수료 ' + (R.rate * 100).toFixed(2).replace(/\.?0+$/, '') + '% (비용이 아니라 이익에서 뺌)</b><span>기간 네이버 매출 ' + n0(cur.naverRev) + '원의 수수료 약 ' + n0(R.fee) + '원' + (R.incFee !== null ? ', 증분 몫 ' + signed(R.incFee) + '원' : '') + '</span></div>';
    else if (p.ch !== 'coupang' && p.ch !== 'other') h += '<p class="note pad">네이버 수수료율이 0%로 저장돼 있습니다. 수정에서 넣으면 이익 계산에 반영됩니다.</p>';
    h += '</section></div>';
    return h;
  }
  function viewPromo() {
    var h = '', list = DATA.promos;
    h += '<section class="card" aria-label="프로모션"><div class="card-h"><h2>프로모션 성과</h2><span class="hint">기획전, 할인, 쿠폰, 사은품 행사를 등록하면 평소 대비 얼마나 더 팔렸고 얼마가 남았는지 계산합니다</span>' + (PR.form ? '' : '<button type="button" class="btn" data-act="pnew">+ 프로모션 등록</button>') + '</div>';
    if (PR.msg && !PR.form) h += '<p class="note"><b>' + esc(PR.msg) + '</b></p>';
    h += '<p class="note">증분 매출 = 프로모션 기간 매출 - 평소 매출(비교 기간). ROAS = 매출 ÷ 비용. ROI = (증분 매출 - 증분 원가 - 네이버 수수료 - 비용) ÷ 비용. 원가를 모르는 품목이 섞이면 ROI는 비워 둡니다.</p></section>';
    if (PR.form) h += promoFormHtml();
    h += '<section class="card flush" aria-label="프로모션 목록"><div class="card-h pad"><h2>등록한 프로모션</h2><span class="hint">이름을 누르면 아래에 자세히 나옵니다</span></div><div class="scroll"><table class="tbl wrap"><thead><tr><th scope="col">이름</th><th scope="col">종류</th><th scope="col">기간</th><th scope="col">채널</th><th scope="col" class="r">매출</th><th scope="col" class="r">증분 매출</th><th scope="col" class="r">비용</th><th scope="col" class="r">ROAS</th><th scope="col" class="r">ROI</th></tr></thead><tbody>';
    if (!list.length) h += '<tr><td colspan="9" class="none">아직 등록한 프로모션이 없습니다. 위의 [+ 프로모션 등록]으로 시작해 주세요.</td></tr>';
    list.forEach(function (p) {
      var R = promoRes(p), open = PR.open === p.id, plan = R.state === 'plan', why = roiWhy(R);
      h += '<tr' + (open ? ' class="on"' : '') + '><th scope="row"><button type="button" class="exp" data-act="popen" data-key="' + esc(p.id) + '" aria-expanded="' + open + '">' + (open ? '▾ ' : '▸ ') + esc(p.name) + '</button> ' + promoState(R) + '</th><td>' + esc(p.kind || '') + '</td><td class="num">' + promoPeriod(p) + '</td><td>' + pName(PCH, p.ch) + '</td>';
      h += '<td class="r num b">' + (plan ? '-' : n0(R.cur.rev)) + '</td><td class="r num">' + (plan || R.incRev === null ? '-' : signed(R.incRev)) + '</td><td class="r num">' + n0(R.cost) + '</td><td class="r num">' + (plan ? '-' : roasText(R.roas)) + '</td><td class="r num b">' + (R.roi === null || R.roi === undefined ? '<small class="zero">' + why + '</small>' : roiText(R.roi)) + '</td></tr>';
    });
    h += '</tbody></table></div></section>';
    var op = PR.open ? promoGet(PR.open) : null;
    if (op) h += promoDetailHtml(op);
    return h;
  }

  /* ───────── 슬랙 리포트 ─────────
   * 데일리는 위의 조회 기간과 비교 기간을 쓰고, 위클리와 먼슬리는 데이터 기준일까지 끝난 한 주, 한 달을 쓴다.
   * 문구는 보내기 전에 고칠 수 있고, 맨 아래에 대시보드 주소가 붙는다.
   */
  var SL = { kind: 'daily', text: '', key: '', online: null, onlineLoading: false, msg: '', sending: false, edited: false };
  function slackKey() { var cr = cmpRange(); return SL.kind + '|' + S.from + '|' + S.to + '|' + (cr ? cr.from + cr.to : '') + '|' + DATA.last + '|' + (SL.online ? 1 : 0); }
  function slackText() {
    var R = root.TTReport, cr = cmpRange();
    if (SL.kind === 'weekly') return R.weekly(DATA, SL.online);
    if (SL.kind === 'monthly') return R.monthly(DATA, SL.online);
    if (SL.kind === 'competitor') return R.competitor(SL.online);
    return R.daily(DATA, S.from, S.to, cr, SL.online);
  }
  function viewSlack() {
    if (!SL.online && !SL.onlineLoading) {
      SL.onlineLoading = true;
      root.TTData.loadOnline().then(function (o) { SL.online = o; }).catch(function () { SL.online = { crm: null, competitor: null }; }).then(function () { SL.onlineLoading = false; if (S.view === 'slack' && !SL.edited) render(); });
    }
    var k = slackKey(); if (k !== SL.key && !SL.edited) { SL.text = slackText(); SL.key = k; }
    var R = root.TTReport, w = R.lastWeek(DATA.last), m = R.lastMonth(DATA.last), h = '';
    var desc = { daily: '위의 조회 기간 (' + dot(S.from) + (S.to !== S.from ? ' ~ ' + dot(S.to) : '') + ')과 비교 기간 기준', weekly: '데이터 기준일까지 끝난 한 주 ' + dot(w.from) + ' ~ ' + dot(w.to) + ', 전주 대비', monthly: m.y + '년 ' + m.m + '월, 전월 대비 (경쟁사 동향 포함)', competitor: '온라인 대시보드 구글 시트의 경쟁사 검색량, 전월 대비' }[SL.kind];
    h += '<section class="card" aria-label="슬랙 리포트"><div class="card-h"><h2>슬랙 리포트</h2><div class="units">';
    [['daily', '데일리'], ['weekly', '위클리'], ['monthly', '먼슬리'], ['competitor', '경쟁사']].forEach(function (x) { h += '<button type="button" class="chip" data-act="slkind" data-key="' + x[0] + '" aria-pressed="' + (SL.kind === x[0]) + '">' + x[1] + '</button>'; });
    h += '</div></div><p class="note">' + esc(desc) + '. 문구는 보내기 전에 자유롭게 고칠 수 있고, 맨 아래에 대시보드 주소가 들어갑니다.' + (SL.onlineLoading ? ' (SNS 팔로워, 경쟁사 데이터 불러오는 중…)' : SL.online && !SL.online.crm ? ' SNS 팔로워 시트를 읽지 못해 그 줄은 빠졌습니다.' : '') + '</p>';
    h += '<textarea class="sl-text" data-act="sltext" rows="22" aria-label="리포트 문구">' + esc(SL.text) + '</textarea>';
    h += '<div class="plan-f"><span>' + (SL.edited ? '직접 고친 문구입니다. <button type="button" class="chip" data-act="slreset">처음 문구로 되돌리기</button>' : '') + '</span>';
    h += '<button type="button" class="chip" data-act="slcopy">복사하기</button> <button type="button" class="btn" data-act="slsend"' + (SL.sending ? ' disabled' : '') + '>' + (SL.sending ? '보내는 중…' : '슬랙으로 보내기') + '</button></div>';
    if (SL.msg) h += '<p class="note"><b>' + esc(SL.msg) + '</b></p>';
    h += '</section>';
    return h;
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return false; });
    try { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); ta.remove(); return Promise.resolve(ok); } catch (e) { return Promise.resolve(false); }
  }
  function sendSlack() {
    var el = document.querySelector('textarea[data-act="sltext"]'); if (el) SL.text = el.value;
    if (!SL.text.trim()) { SL.msg = '보낼 문구가 없습니다.'; render(); return; }
    SL.sending = true; SL.msg = ''; render();
    root.TTData.loadWebhook().then(function (url) {
      if (!url) throw new Error('슬랙 웹훅 주소가 설정되어 있지 않습니다 (v5 화면의 관리자 설정에서 등록)');
      return root.TTData.sendSlack(url, SL.text);
    }).then(function () { SL.msg = '슬랙으로 보냈습니다.'; }, function (e) {
      return copyText(SL.text).then(function (ok) { SL.msg = '보내지 못했습니다: ' + (e && e.message) + (ok ? '. 문구는 클립보드에 복사해 두었으니 슬랙에 붙여넣어 주세요.' : ''); });
    }).then(function () { SL.sending = false; render(); });
  }

  function viewSoon(label) {
    return '<div class="empty"><b>' + esc(label) + ' 메뉴는 준비 중입니다</b><span>v6는 홈부터 순서대로 옮기고 있습니다. 그동안은 기존 화면에서 볼 수 있습니다.</span><a class="more" href="index.html">기존 화면(v5) 열기</a></div>';
  }

  /* ───────── 그리기 ───────── */
  function render() {
    var app = document.getElementById('app');
    var cur = VIEWS.filter(function (v) { return v.id === S.view; })[0] || VIEWS[0];
    var hl = C.health(DATA, today());
    var ok = (hl.mismatch === 0 || hl.mismatch === null) && (hl.unmapped === 0 || hl.unmapped === null);
    var h = '<div class="app"><nav class="side" aria-label="주 메뉴"><div class="brand"><b>톰토미</b><span>마케팅 대시보드 v6</span></div>';
    h += '<div class="nav"><span class="nav-h">보기</span>';
    function navBtn(v) { return '<button type="button" data-act="view" data-key="' + v.id + '"' + (v.id === cur.id ? ' aria-current="page"' : '') + '>' + v.label + (READY[v.id] ? '' : '<small>준비 중</small>') + '</button>'; }
    VIEWS.filter(function (v) { return v.group === 'view'; }).forEach(function (v) { h += navBtn(v); });
    h += '</div><div class="nav"><span class="nav-h">관리</span>';
    VIEWS.filter(function (v) { return v.group === 'manage'; }).forEach(function (v) { h += navBtn(v); });
    h += '<a href="index.html">v5 화면<small>매핑표 등</small></a>';
    h += '</div><div class="nav"><span class="nav-h">바로가기</span><a href="' + SNS_URL + '" target="_blank" rel="noopener">SNS 라이브러리<small>새 탭 ↗</small></a>';
    h += '</div><div class="side-status"><b class="' + (ok ? 'ok' : 'chk') + '">' + (ok ? '데이터 정상' : '확인 필요') + '</b><span>네이버 판매 ' + mdot(hl.lastNaver) + '까지</span><span>주문 ' + mdot(hl.lastOrders) + '까지</span></div></nav>';
    h += '<main class="main"><header class="head"><h1>' + cur.label + '</h1><span>데이터 기준일 ' + dot(DATA.last) + '</span></header>';
    if (cur.id !== 'data' && cur.id !== 'promo') h += periodBar(); // 데이터 관리, 프로모션은 위의 조회 기간과 상관없음
    h += cur.id === 'home' ? viewHome() : cur.id === 'sales' ? viewSales() : cur.id === 'ads' ? viewAds() : cur.id === 'products' ? viewProducts() : cur.id === 'customers' ? viewCustomers() : cur.id === 'promo' ? viewPromo() : cur.id === 'data' ? viewData() : cur.id === 'slack' ? viewSlack() : viewSoon(cur.label);
    h += '</main></div>';
    app.innerHTML = h;
  }

  function onClick(ev) {
    var el = ev.target.closest('[data-act]'); if (!el || el.tagName === 'INPUT') return;
    var act = el.getAttribute('data-act'), key = el.getAttribute('data-key');
    if (act === 'page') { var pf = el.getAttribute('data-field') || 'page'; S[pf] = (S[pf] || 0) + (key === 'older' ? 1 : -1); render(); return; }
    if (act === 'adview') { S.adView = key; render(); return; }
    if (act === 'aipick') { S.aitem = key; S.aiq = ''; S.apage = 0; S.aopen = {}; save(); render(); return; }
    if (act === 'amd') { S.amd = key; S.apage = 0; S.aopen = {}; render(); return; }
    if (act === 'aopen') { if (S.aopen[key]) delete S.aopen[key]; else S.aopen[key] = 1; render(); return; }
    if (act === 'acopen') { if (S.acOpen[key]) delete S.acOpen[key]; else S.acOpen[key] = 1; render(); return; }
    if (act === 'acsel') { S.acSel = key ? JSON.parse(key) : null; render(); return; }
    if (act === 'acbasis') { S.acBasis = key; S.acSel = null; render(); return; }
    if (act === 'accsv') { downloadAdTreeCsv(); return; }
    if (act === 'pnew') { PR.form = promoBlank(); PR.q = ''; PR.msg = ''; PR.delAsk = false; render(); return; }
    if (act === 'pedit') { var pe = promoGet(key); if (pe) { PR.form = promoToForm(pe); PR.q = ''; PR.msg = ''; PR.delAsk = false; render(); window.scrollTo(0, 0); } return; }
    if (act === 'pcancel') { PR.form = null; PR.q = ''; PR.msg = ''; PR.delAsk = false; render(); return; }
    if (act === 'psave') { promoSave(); return; }
    if (act === 'pdelask') { PR.delAsk = true; render(); return; }
    if (act === 'pdel') { promoDelete(); return; }
    if (act === 'popen') { PR.open = PR.open === key ? '' : key; S.ppage = 0; if (!PR.form) PR.msg = ''; render(); return; }
    if (act === 'ppick') { if (PR.form && PR.form.items.indexOf(key) < 0) PR.form.items.push(key); PR.q = ''; render(); var pq = document.getElementById('pq'); if (pq) pq.focus(); return; }
    if (act === 'pitemdel') { if (PR.form) PR.form.items = PR.form.items.filter(function (c) { return c !== key; }); render(); return; }
    if (act === 'slkind') { SL.kind = key; SL.edited = false; SL.msg = ''; SL.key = ''; render(); return; }
    if (act === 'slreset') { SL.edited = false; SL.key = ''; SL.msg = ''; render(); return; }
    if (act === 'slcopy') { var te = document.querySelector('textarea[data-act="sltext"]'); if (te) SL.text = te.value; copyText(SL.text).then(function (ok) { SL.msg = ok ? '복사했습니다. 슬랙에 붙여넣으면 됩니다.' : '복사하지 못했습니다. 문구를 직접 선택해서 복사해 주세요.'; render(); }); return; }
    if (act === 'slsend') { sendSlack(); return; }
    if (act === 'upsave') { saveUpload(); return; }
    if (act === 'upcancel') { UP.plan = null; UP.msg = ''; render(); return; }
    if (act === 'backup') { downloadBackup(); UP.msg = '백업 파일을 받았습니다.'; render(); return; }
    if (act === 'topen') { S.topen = S.topen === key ? '' : key; render(); return; }
    if (act === 'tcsv') { downloadTrafficCsv(); return; }
    if (act === 'open') { S.open = S.open === key ? '' : key; refreshProdBody(); return; }
    if (act === 'selclear') { S.sel = []; S.selMsg = ''; render(); return; }
    if (act === 'pcsv') { downloadProductsCsv(); return; }
    if (act === 'costsave') { saveCost(); return; }
    if (act === 'costcancel') { S.draft = null; S.costMsg = ''; render(); return; }
    if (act === 'pch' || act === 'pmode') { if (act === 'pch') S.pch = key; else S.pmode = key; S.open = ''; S.page = 0; save(); render(); return; }
    if (act === 'view') S.open = '';
    if (act !== 'csv' && act !== 'adcsv') { S.page = 0; S.tpage = 0; S.apage = 0; } // 기간, 메뉴, 채널이 바뀌면 첫 쪽으로
    if (act === 'view') S.view = key;
    else if (act === 'preset') applyPreset(key);
    else if (act === 'cmp') {
      if (key === 'custom') { var r = cmpRange() || C.prevPeriod(S.from, S.to); S.cmpFrom = r.from; S.cmpTo = r.to; }
      S.cmp = key;
    } else if (act === 'ch') S.ch = key;
    else if (act === 'ad') S.ad = key;
    else if (act === 'adcsv') { downloadAdsCsv(); return; }
    else if (act === 'unit') S.unit = key;
    else if (act === 'csv') { downloadCsv(); return; }
    else return;
    save(); render();
  }
  function onChange(ev) {
    var el = ev.target; if (!el.matches) return;
    if (el.matches('[data-pf]')) { if (PR.form) { PR.form[el.getAttribute('data-pf')] = el.value; if (el.tagName === 'SELECT') render(); } return; } // 글자 칸은 다시 그리지 않는다 (누르던 버튼이 사라지지 않게)
    if (!el.matches('input[data-act], select[data-act]')) return;
    var act = el.getAttribute('data-act'), v = el.value;
    if (act === 'aiq' || act === 'pq') return; // 검색칸에서 포커스가 빠질 때 목록을 다시 그리면 누르던 결과가 사라져 클릭이 무시된다
    if (act === 'q') { onSearch(ev); return; }
    if (act === 'upfiles') { onUpload(el.files); el.value = ''; return; }
    if (act === 'sel') {
      var id = el.getAttribute('data-key'), at = S.sel.indexOf(id); S.selMsg = '';
      if (at >= 0) S.sel.splice(at, 1);
      else if (S.sel.length >= SEL_MAX) { S.selMsg = '비교는 최대 ' + SEL_MAX + '개까지입니다. 다른 상품의 체크를 하나 풀고 다시 골라 주세요.'; el.checked = false; }
      else S.sel.push(id);
      var pc = document.getElementById('pcompare'); if (pc) pc.innerHTML = compareHtml();
      return;
    }
    if (!v) return;
    if (act === 'costfile') { readCostFile(el.files && el.files[0]); return; }
    if (act === 'from') { S.from = v; if (S.from > S.to) S.to = S.from; S.preset = ''; }
    else if (act === 'to') { S.to = v; if (S.to < S.from) S.from = S.to; S.preset = ''; }
    else if (act === 'cmpFrom') { S.cmpFrom = v; if (S.cmpTo && S.cmpFrom > S.cmpTo) S.cmpTo = S.cmpFrom; }
    else if (act === 'cmpTo') { S.cmpTo = v; if (S.cmpFrom && S.cmpTo < S.cmpFrom) S.cmpFrom = S.cmpTo; }
    S.page = 0; S.tpage = 0; S.apage = 0; clampDates(); save(); render();
  }

  // 검색어 입력: 입력칸은 그대로 두고 표만 다시 그린다 (한글 입력 중에 글자가 끊기지 않게)
  function onSearch(ev) {
    var el = ev.target; if (!el.matches) return;
    if (el.matches('textarea[data-act="sltext"]')) { SL.text = el.value; SL.edited = true; return; }
    if (el.matches('[data-pf]')) { if (PR.form) { PR.form[el.getAttribute('data-pf')] = el.value; PR.msg = ''; var pm = document.getElementById('pmsg'); if (pm) pm.hidden = true; } return; }
    if (el.matches('input[data-act="pq"]')) { PR.q = el.value; var ps = document.getElementById('psug'); if (ps) { ps.innerHTML = promoSuggest(); ps.hidden = !PR.q.trim(); } return; }
    if (el.matches('input[data-act="aiq"]')) { S.aiq = el.value; var sg = document.getElementById('aisug'); if (sg) { sg.innerHTML = aiSuggest(AILIST); sg.hidden = !S.aiq.trim(); } return; }
    if (!el.matches('input[data-act="q"]')) return;
    if (S.q === el.value) return;
    S.q = el.value; S.page = 0; S.open = ''; refreshProdBody();
  }

  // 차트 툴팁: 화면에 하나만 두고 마우스를 따라다닌다
  function onTip(ev) {
    var tip = document.getElementById('tip'); if (!tip) return;
    var el = ev.target && ev.target.closest ? ev.target.closest('.hit') : null;
    if (!el) { tip.hidden = true; return; }
    var parts = el.getAttribute('data-tip').split('|');
    tip.innerHTML = '<b>' + esc(parts[0]) + '</b>' + parts.slice(1).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('');
    tip.hidden = false;
    var w = tip.offsetWidth, hgt = tip.offsetHeight, px = ev.clientX + 14, py = ev.clientY + 14;
    if (px + w > window.innerWidth - 8) px = ev.clientX - w - 14;
    if (py + hgt > window.innerHeight - 8) py = ev.clientY - hgt - 14;
    tip.style.left = Math.max(8, px) + 'px'; tip.style.top = Math.max(8, py) + 'px';
  }

  function start(raw) {
    RAW = raw; DATA = C.normalize(raw);
    META = { otherOk: raw._otherOk };
    if (!DATA.last) { document.getElementById('app').innerHTML = '<div class="main"><div class="error">불러온 데이터가 없습니다.</div></div>'; return; }
    restore();
    if (S.preset) applyPreset(S.preset); else clampDates();
    if (!S.from || !S.to) applyPreset('1');
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onSearch);
    document.addEventListener('keydown', function (ev) {
      var el = ev.target; if (!el.matches || !el.matches('input[data-act="aiq"], input[data-act="pq"]')) return;
      if (ev.isComposing) return; // 한글 조합 중의 Enter는 글자 확정용
      var box = el.getAttribute('data-act') === 'pq' ? '#psug' : '#aisug';
      if (ev.key === 'Enter') { ev.preventDefault(); var f = document.querySelector(box + ' .aisug-i'); if (f) f.click(); }
      else if (ev.key === 'Escape') { if (box === '#psug') PR.q = ''; else S.aiq = ''; el.value = ''; var sg = document.querySelector(box); if (sg) sg.hidden = true; }
      else if (ev.key === 'ArrowDown') { var b = document.querySelector(box + ' .aisug-i'); if (b) { ev.preventDefault(); b.focus(); } }
    });
    // 파일 끌어다 놓기 (데이터 관리)
    document.addEventListener('dragover', function (ev) { var z = ev.target.closest && ev.target.closest('[data-drop]'); if (z) { ev.preventDefault(); z.classList.add('over'); } });
    document.addEventListener('dragleave', function (ev) { var z = ev.target.closest && ev.target.closest('[data-drop]'); if (z) z.classList.remove('over'); });
    document.addEventListener('drop', function (ev) { var z = ev.target.closest && ev.target.closest('[data-drop]'); if (!z) return; ev.preventDefault(); z.classList.remove('over'); onUpload(ev.dataTransfer.files); });
    document.addEventListener('mousemove', onTip);
    document.addEventListener('click', onTip); // 터치 화면에서는 눌러서 본다
    render();
  }
  function boot() {
    var app = document.getElementById('app');
    app.innerHTML = '<div class="loading">데이터를 불러오는 중입니다…</div>';
    root.TTData.load().then(start).catch(function (e) {
      app.innerHTML = '<div class="main"><div class="error">데이터를 불러오지 못했습니다. 네트워크를 확인한 뒤 새로고침해 주세요.<br>' + esc(e && e.message) + '</div></div>';
    });
  }
  root.TTApp = { boot: boot, start: start };
})(window);
