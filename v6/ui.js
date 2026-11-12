/* 톰토미 대시보드 v6 — 화면
 *
 * 계산은 calc.js, 데이터 읽기는 data.js가 맡고, 여기는 그리는 일만 한다.
 * 기간(조회/비교)은 모든 메뉴가 함께 쓰는 하나의 상태다.
 */
(function (root) {
  'use strict';
  var C = root.TTCalc;
  var DATA = null;      // 정리된 데이터
  var META = {};        // 불러오기 결과(기타마켓 연결 여부 등)
  var S = { view: 'home', from: '', to: '', preset: '1', cmp: 'prev', cmpFrom: '', cmpTo: '', ch: 'all', unit: 'auto', ad: 'store', page: 0, pch: 'naver', pmode: 'prod', open: '', draft: null, costMsg: '', saving: false, q: '', sel: [], selMsg: '' };
  var READY = { home: 1, sales: 1, ads: 1, products: 1 }; // 옮겨온 메뉴
  var STORE_KEY = 'tt6_state';

  var VIEWS = [
    { id: 'home', label: '홈', group: 'view' },
    { id: 'sales', label: '매출', group: 'view' },
    { id: 'ads', label: '광고', group: 'view' },
    { id: 'products', label: '상품', group: 'view' },
    { id: 'customers', label: '고객/유입', group: 'view' }
  ];

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
  var KEEP = ['view', 'ch', 'unit', 'ad', 'pch', 'pmode'];
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
      if (opt.bar !== '') lines.push(barName + ' ' + won(o.ad) + '원');
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
  var PAGE_SIZE = 10;
  function pageOf(list) {
    var pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (S.page >= pages) S.page = pages - 1;
    if (S.page < 0) S.page = 0;
    return { rows: list.slice(S.page * PAGE_SIZE, (S.page + 1) * PAGE_SIZE), pages: pages, total: list.length };
  }
  function pagerHtml(pg) {
    if (pg.pages <= 1) return '';
    return '<div class="pager"><button type="button" class="chip" data-act="page" data-key="newer"' + (S.page === 0 ? ' disabled' : '') + '>‹ 더 최근</button>' +
      '<span class="num">' + (S.page + 1) + ' / ' + pg.pages + ' <small>(전체 ' + pg.total + '줄)</small></span>' +
      '<button type="button" class="chip" data-act="page" data-key="older"' + (S.page >= pg.pages - 1 ? ' disabled' : '') + '>더 과거 ›</button></div>';
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
  function viewAds() {
    var M = adsModel(), md = S.ad, t = M.t, pt = M.pt, has = M.has, R = C.ratio, h = '';
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
    return h;
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
  // 표 부분만 따로 그린다 (검색어를 치는 동안 입력칸은 건드리지 않기 위해)
  function prodBody() {
    var h = '', pch = S.pch === 'coupang' ? 'coupang' : 'naver', sumName = S.q.trim() ? '검색 결과 합계' : '합계';
    if (pch === 'coupang') {
      var rows = C.coupangTop(DATA, S.from, S.to).filter(function (o) { return qmatch([o.name, o.skuNo]); }), q = 0, a = 0;
      rows.forEach(function (o) { q += o.qty; a += o.amount; });
      PCOUNT = rows.length;
      h += '<table class="tbl wrap"><thead><tr><th scope="col">품목</th><th scope="col">쿠팡 상품번호</th><th scope="col" class="r">수량</th><th scope="col" class="r">입고 금액</th></tr></thead><tbody>';
      if (!rows.length) h += '<tr><td colspan="4" class="none">' + (S.q.trim() ? '검색 결과가 없습니다.' : '이 기간에 쿠팡 입고가 없습니다.') + '</td></tr>';
      var cpg = pageOf(rows);
      cpg.rows.forEach(function (o) { h += '<tr><th scope="row">' + esc(o.name) + '</th><td class="num">' + esc(o.skuNo) + '</td><td class="r num">' + n0(o.qty) + '</td><td class="r num b">' + n0(o.amount) + '</td></tr>'; });
      if (rows.length) h += '<tr class="sum"><th scope="row">' + sumName + '</th><td></td><td class="r num">' + n0(q) + '</td><td class="r num b">' + n0(a) + '</td></tr>';
      return h + '</tbody></table>' + pagerHtml(cpg);
    }
    var M = prodModel(S.from, S.to), cr = cmpRange(), PM = cr ? prodModel(cr.from, cr.to) : null;
    if (S.pmode !== 'sku') {
      var prev = {}; if (PM) PM.prods.forEach(function (o) { prev[o.prodId] = o; });
      var list = M.prods.filter(function (o) { return qmatch([o.name, o.prodId].concat(o.skuList.map(function (x) { return x.code + ' ' + x.name; }))); });
      var t = prodTotals(list), nc = cr ? 7 : 6, pn = 0;
      PCOUNT = list.length;
      h += '<table class="tbl wrap"><thead><tr><th scope="col">상품 (체크하면 비교, 이름을 누르면 SKU 펼침)</th><th scope="col" class="r">수량</th><th scope="col" class="r">순매출</th>' + (cr ? '<th scope="col" class="r">비교 기간 대비</th>' : '') + '<th scope="col" class="r">원가</th><th scope="col" class="r">마진</th><th scope="col" class="r">마진율</th></tr></thead><tbody>';
      if (!list.length) h += '<tr><td colspan="' + nc + '" class="none">' + (S.q.trim() ? '검색 결과가 없습니다.' : '이 기간에 판매된 상품이 없습니다.') + '</td></tr>';
      var pg = pageOf(list);
      pg.rows.forEach(function (o) {
        var open = S.open === o.prodId, pv = prev[o.prodId];
        h += '<tr><th scope="row"><span class="pick"><input type="checkbox" data-act="sel" data-key="' + esc(o.prodId) + '"' + (S.sel.indexOf(o.prodId) >= 0 ? ' checked' : '') + ' aria-label="비교에 넣기: ' + esc(o.name || o.prodId) + '">';
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
    var skus = M.skus.filter(function (x) { return qmatch([x.code, x.name]); }), sq = 0, sc = 0, sr = 0;
    PCOUNT = skus.length;
    h += '<table class="tbl wrap"><thead><tr><th scope="col">SKU코드</th><th scope="col">품명</th><th scope="col" class="r">주문 수량</th><th scope="col" class="r">취소/반품</th><th scope="col" class="r">매출 (배분)</th><th scope="col" class="r">개당 원가</th><th scope="col" class="r">원가 합계</th></tr></thead><tbody>';
    if (!skus.length) h += '<tr><td colspan="7" class="none">' + (S.q.trim() ? '검색 결과가 없습니다.' : '이 기간에 주문조회 기록이 없습니다.') + '</td></tr>';
    var sg = pageOf(skus);
    skus.forEach(function (x) { sq += x.qty; sc += x.cancel; sr += x.rev; });
    sg.rows.forEach(function (x) {
      h += '<tr><th scope="row" class="num">' + esc(x.code) + '</th><td>' + esc(x.name) + '</td><td class="r num b">' + n0(x.qty) + '</td><td class="r num">' + (x.cancel ? n0(x.cancel) : '<span class="zero">0</span>') + '</td>';
      h += '<td class="r num">' + (x.est ? '약 ' : '') + n0(x.rev) + '</td>';
      h += '<td class="r num">' + (x.unit === null ? (x.qty > 0 ? miss('미입력') : '-') : n0(x.unit)) + '</td><td class="r num">' + (x.noCost > 0 ? (x.unit === null ? '-' : miss('일부 미입력')) : n0(x.cost)) + '</td></tr>';
    });
    if (skus.length) h += '<tr class="sum"><th scope="row">' + sumName + '</th><td></td><td class="r num b">' + n0(sq) + '</td><td class="r num">' + n0(sc) + '</td><td class="r num">' + n0(sr) + '</td><td></td><td></td></tr>';
    h += '</tbody></table>' + pagerHtml(sg);
    h += '<p class="note pad">매출 (배분): 상품 순매출을 그 상품에서 팔린 SKU 수량 비율로 나눈 값입니다. SKU가 하나뿐인 상품은 정확하고, 세트나 추가구성처럼 여러 SKU가 섞인 상품에서 온 금액이 있으면 "약"을 붙였습니다.' + (Math.abs(M.total.unalloc) >= 1 && !S.q.trim() ? ' 이 기간에 주문조회 기록이 없어 나누지 못한 매출 ' + n0(M.total.unalloc) + '원이 따로 있습니다.' : '') + '</p>';
    return h;
  }
  function searchBar() {
    return '<div class="search pad"><input type="search" data-act="q" value="' + esc(S.q) + '" placeholder="' + (S.pch === 'coupang' ? '품목명, 쿠팡 상품번호로 검색' : '상품명, 상품번호, SKU코드로 검색') + '" aria-label="상품 검색" autocomplete="off">' +
      '<span class="hint">결과 <b id="pcount" class="num">' + PCOUNT + '</b>개</span></div>';
  }
  // 고른 상품 비교 (최대 5개)
  function compareHtml() {
    if (S.pch === 'coupang' || S.pmode === 'sku' || !S.sel.length) return '';
    var M = prodModel(S.from, S.to), cr = cmpRange(), PM = cr ? prodModel(cr.from, cr.to) : null, by = {}, pby = {};
    M.prods.forEach(function (o) { by[o.prodId] = o; }); if (PM) PM.prods.forEach(function (o) { pby[o.prodId] = o; });
    var items = S.sel.map(function (id) { var o = by[id], pv = pby[id]; return { id: id, o: o || null, pv: pv || null, name: (o && o.name) || (pv && pv.name) || id }; });
    var h = '<section class="card flush" aria-label="상품 비교"><div class="card-h pad"><h2>상품 비교</h2><span class="hint">' + dot(S.from) + ' ~ ' + dot(S.to) + ', ' + items.length + '개 선택 (최대 ' + SEL_MAX + '개)</span><button type="button" class="chip" data-act="selclear">선택 모두 해제</button></div>';
    if (S.selMsg) h += '<p class="note pad"><b>' + esc(S.selMsg) + '</b></p>';
    if (items.length < 2) return h + '<p class="note pad">하나 더 체크하면 나란히 비교합니다. 검색어를 바꿔도 체크한 상품은 유지됩니다.</p></section>';
    function row(label, f) { var r = '<tr><th scope="row">' + label + '</th>'; items.forEach(function (it) { r += '<td class="r num">' + f(it) + '</td>'; }); return r + '</tr>'; }
    h += '<div class="scroll"><table class="tbl wrap cmp"><thead><tr><th scope="col">항목</th>';
    items.forEach(function (it, i) { h += '<th scope="col" class="r"><span class="dotc" style="background:' + CMP_COLORS[i] + '"></span>' + esc(it.name) + '</th>'; });
    h += '</tr></thead><tbody>';
    h += row('수량', function (it) { return it.o ? n0(it.o.qty) : '<span class="zero">0</span>'; });
    h += row('순매출', function (it) { return '<b>' + (it.o ? n0(it.o.net) : '0') + '</b>'; });
    if (cr) {
      h += row('비교 기간 순매출 <small>(' + mdot(cr.from) + ' ~ ' + mdot(cr.to) + ')</small>', function (it) { return it.pv ? n0(it.pv.net) : '<span class="zero">0</span>'; });
      h += row('순매출 증감', function (it) { return grow(it.o ? it.o.net : 0, it.pv ? it.pv.net : 0); });
      h += row('수량 증감', function (it) { return grow(it.o ? it.o.qty : 0, it.pv ? it.pv.qty : 0); });
    }
    h += row('개당 평균 매출', function (it) { return it.o && it.o.qty > 0 ? n0(it.o.net / it.o.qty) : '-'; });
    h += row('원가', function (it) { return !it.o || it.o.oqty === 0 ? '-' : it.o.noCost > 0 ? miss('미입력') : n0(it.o.cost); });
    h += row('마진', function (it) { return it.o && it.o.margin !== null ? n0(it.o.margin) : '-'; });
    h += row('마진율', function (it) { return it.o && it.o.margin !== null ? rate(it.o.margin, it.o.net) : '-'; });
    h += '</tbody></table></div>';
    var ps = C.productSeries(DATA, S.sel, S.from, S.to);
    if (ps.labels.length >= 2) h += '<div class="pad cmpchart">' + multiLine(ps, items) + '<span class="note">' + (ps.unit === 'day' ? '날짜별' : '월별') + ' 순매출. 선 위에 마우스를 올리면 값이 보입니다.</span></div>';
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
    var pch = S.pch === 'coupang' ? 'coupang' : 'naver', h = '', body = prodBody();
    h += '<div class="tabs" role="tablist" aria-label="채널">';
    [['naver', '네이버'], ['coupang', '쿠팡 입고']].forEach(function (c) { h += '<button type="button" role="tab" class="tab" data-act="pch" data-key="' + c[0] + '" aria-selected="' + (c[0] === pch) + '">' + c[1] + '</button>'; });
    h += '</div>';
    if (pch === 'coupang') {
      var all = C.coupangTop(DATA, S.from, S.to), q = 0, a = 0;
      all.forEach(function (o) { q += o.qty; a += o.amount; });
      h += '<section class="strip" aria-label="쿠팡 입고 요약">' + cell('입고 품목 수', n0(all.length) + '개', '') + cell('입고 수량', n0(q), '') + cell('입고 금액', n0(a), '') + '</section>';
      h += '<span class="note tight">쿠팡 품목은 아직 ERP 코드, 원가와 연결되어 있지 않아 수량과 입고 금액만 보여줍니다.</span>';
      h += '<section class="card flush" aria-label="쿠팡 품목별 입고"><div class="card-h pad"><h2>품목별 입고</h2><span class="hint">요약 칸은 조회 기간 전체</span><button type="button" class="chip" data-act="pcsv">엑셀로 받기 (CSV)</button></div>' + searchBar() + '<div class="scroll" id="pbody">' + body + '</div></section>';
      return h;
    }
    var M = prodModel(S.from, S.to), t = M.total, mode = S.pmode === 'sku' ? 'sku' : 'prod';
    h += '<section class="strip" aria-label="상품 요약">';
    h += cell('판매 상품 수', n0(t.count) + '개', '');
    h += cell('판매 수량', n0(t.qty), '');
    h += cell('순매출', n0(t.net), '');
    h += cell('마진 (원가 입력분)', M.hasCost && t.netCosted > 0 ? n0(t.margin) : '-', !M.hasCost ? '원가표를 올리면 계산됩니다' : t.netCosted > 0 ? '마진율 ' + rate(t.margin, t.netCosted) + ', 매출의 ' + rate(t.netCosted, t.net) + '에 원가 입력됨' : '이 기간 판매 상품에 입력된 원가가 없습니다');
    h += '</section>';
    h += '<span class="note tight">마진 = 순매출 - 원가 (부가세 포함 기준). 수수료, 배송비, 광고비는 빼지 않은 값입니다. 수량과 순매출은 결제일 기준, SKU 수량과 원가는 주문일 기준이라 기간 경계에서 조금 다를 수 있습니다.</span>';
    h += '<div class="row"><section class="card grow3 flush" aria-label="상품별 성과"><div class="card-h pad"><h2>' + (mode === 'prod' ? '상품별 성과' : 'SKU별 성과') + '</h2><span class="hint">요약 칸은 조회 기간 전체</span>';
    [['prod', '상품 기준'], ['sku', 'SKU 기준']].forEach(function (m) { h += '<button type="button" class="chip" data-act="pmode" data-key="' + m[0] + '" aria-pressed="' + (mode === m[0]) + '">' + m[1] + '</button>'; });
    h += '<button type="button" class="chip" data-act="pcsv">엑셀로 받기 (CSV)</button></div>' + searchBar() + '<div class="scroll" id="pbody">' + body + '</div></section>';
    h += costSide(M) + '</div>';
    h += '<div id="pcompare">' + compareHtml() + '</div>';
    return h;
  }
  function refreshProdBody() {
    var el = document.getElementById('pbody'), c = document.getElementById('pcount'); if (!el) return;
    el.innerHTML = prodBody(); if (c) c.textContent = PCOUNT;
  }
  function costSide(M) {
    var h = '';
    var cv = DATA.costVer, unm = M.skus.filter(function (s) { return s.code === '(매핑 없음)'; })[0];
    h += '<section class="card grow1 flush" aria-label="원가표와 확인할 것"><div class="card-h pad"><h2>원가표</h2><label class="chip filebtn">원가표 올리기<input type="file" accept=".xlsx" data-act="costfile" hidden></label></div>';
    h += '<p class="note pad">' + (cv ? '저장된 원가표: ' + esc(cv.ver) + ' 저장, ' + n0(cv.rows.length) + '줄' : '아직 저장된 원가표가 없습니다.') + '</p>';
    if (S.costMsg) h += '<p class="note pad"><b>' + esc(S.costMsg) + '</b></p>';
    var d = S.draft;
    if (d) {
      h += '<div class="draft"><b>저장하기 전에 확인</b><span>읽은 원가 ' + d.rows.length + '줄 (기준: ' + (d.vat === 'excl' ? 'VAT 제외, 1.1을 곱해 저장' : 'VAT 포함') + ')</span>';
      h += '<span>새로 추가 ' + d.merged.stat.added + ', 값 변경 ' + d.merged.stat.changed + ', 그대로 ' + d.merged.stat.same + ', 이전 값 유지 ' + d.merged.stat.kept + '</span>';
      if (d.blank) h += '<span>원가 빈 줄 ' + d.blank + '개는 건너뜀</span>';
      if (d.bad.length) h += '<span class="miss">읽지 못한 줄 ' + d.bad.length + '개: ' + esc(d.bad.slice(0, 5).join(', ')) + (d.bad.length > 5 ? ' 외' : '') + '</span>';
      h += '<div><button type="button" class="chip" data-act="costsave" aria-pressed="true"' + (S.saving ? ' disabled' : '') + '>' + (S.saving ? '저장 중…' : '저장') + '</button> <button type="button" class="chip" data-act="costcancel">취소</button></div></div>';
    }
    h += '<div class="card-h pad"><h2>확인이 필요한 것</h2></div>';
    if (unm && unm.qty) h += '<div class="li"><span>매핑표에 없는 옵션</span><b class="num">' + n0(unm.qty) + '개</b></div>';
    if (!M.noCost.length) h += '<p class="note pad">' + (M.skus.length ? '이 기간에 팔린 SKU는 모두 원가가 입력되어 있습니다.' : '이 기간에 주문 기록이 없습니다.') + '</p>';
    else {
      h += '<p class="note pad">원가 미입력 SKU ' + M.noCost.length + '개 (이 기간 주문 수량 순)</p>';
      M.noCost.slice(0, 8).forEach(function (s) { h += '<div class="li"><span><span class="num">' + esc(s.code) + '</span> ' + esc(s.name) + '</span><b class="num">' + n0(s.noCost) + '개</b></div>'; });
      if (M.noCost.length > 8) h += '<p class="note pad">외 ' + (M.noCost.length - 8) + '개는 [SKU 기준] 표에서 볼 수 있습니다.</p>';
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
    if (S.pch === 'coupang') {
      lines.push(['품목', '쿠팡 상품번호', '수량', '입고 금액']);
      C.coupangTop(DATA, S.from, S.to).forEach(function (o) { lines.push([o.name, o.skuNo, o.qty, Math.round(o.amount)]); });
      return saveCsv(lines, 'tomtomi_products_coupang_' + tag + '.csv');
    }
    var M = C.products(DATA, S.from, S.to);
    if (S.pmode === 'sku') {
      lines.push(['SKU코드', '품명', '주문 수량', '취소/반품', '매출 (배분)', '배분 추정 여부', '개당 원가', '원가 합계', '원가 미입력 수량']);
      M.skus.forEach(function (s) { lines.push([s.code, s.name, s.qty, s.cancel, Math.round(s.rev), s.est ? '추정' : '정확', s.unit === null ? '' : s.unit, Math.round(s.cost), s.noCost]); });
      return saveCsv(lines, 'tomtomi_products_sku_' + tag + '.csv');
    }
    lines.push(['상품번호', '상품명', 'SKU코드', 'SKU 품명', '수량', '순매출', '원가', '마진', '마진율(%)']);
    M.prods.forEach(function (o) {
      lines.push([o.prodId, o.name, '', '', o.qty, Math.round(o.net), o.margin === null ? '' : Math.round(o.cost), o.margin === null ? '' : Math.round(o.margin), o.margin === null || !(o.net > 0) ? '' : (o.margin / o.net * 100).toFixed(1)]);
      o.skuList.forEach(function (s) { lines.push([o.prodId, o.name, s.code, s.name, s.qty, '', s.noCost > 0 ? '' : Math.round(s.cost), '', '']); });
    });
    saveCsv(lines, 'tomtomi_products_' + tag + '.csv');
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
      var raw = r[cCost]; if (raw === '' || raw === null || raw === undefined) { blank++; continue; }
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
    VIEWS.forEach(function (v) { h += '<button type="button" data-act="view" data-key="' + v.id + '"' + (v.id === cur.id ? ' aria-current="page"' : '') + '>' + v.label + (READY[v.id] ? '' : '<small>준비 중</small>') + '</button>'; });
    h += '</div><div class="nav"><span class="nav-h">관리</span>';
    ['파일 올리기', '데이터 검사', '매핑표 / 원가', '백업'].forEach(function (t) { h += '<a href="index.html">' + t + '<small>v5</small></a>'; });
    h += '</div><div class="side-status"><b class="' + (ok ? 'ok' : 'chk') + '">' + (ok ? '데이터 정상' : '확인 필요') + '</b><span>네이버 판매 ' + mdot(hl.lastNaver) + '까지</span><span>주문 ' + mdot(hl.lastOrders) + '까지</span></div></nav>';
    h += '<main class="main"><header class="head"><h1>' + cur.label + '</h1><span>데이터 기준일 ' + dot(DATA.last) + '</span></header>';
    h += periodBar();
    h += cur.id === 'home' ? viewHome() : cur.id === 'sales' ? viewSales() : cur.id === 'ads' ? viewAds() : cur.id === 'products' ? viewProducts() : viewSoon(cur.label);
    h += '</main></div>';
    app.innerHTML = h;
  }

  function onClick(ev) {
    var el = ev.target.closest('[data-act]'); if (!el || el.tagName === 'INPUT') return;
    var act = el.getAttribute('data-act'), key = el.getAttribute('data-key');
    if (act === 'page') { S.page += key === 'older' ? 1 : -1; render(); return; }
    if (act === 'open') { S.open = S.open === key ? '' : key; refreshProdBody(); return; }
    if (act === 'selclear') { S.sel = []; S.selMsg = ''; render(); return; }
    if (act === 'pcsv') { downloadProductsCsv(); return; }
    if (act === 'costsave') { saveCost(); return; }
    if (act === 'costcancel') { S.draft = null; S.costMsg = ''; render(); return; }
    if (act === 'pch' || act === 'pmode') { if (act === 'pch') S.pch = key; else S.pmode = key; S.open = ''; S.page = 0; save(); render(); return; }
    if (act === 'view') S.open = '';
    if (act !== 'csv' && act !== 'adcsv') S.page = 0; // 기간, 메뉴, 채널이 바뀌면 첫 쪽(최근)으로
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
    var el = ev.target; if (!el.matches || !el.matches('input[data-act]')) return;
    var act = el.getAttribute('data-act'), v = el.value;
    if (act === 'q') { onSearch(ev); return; }
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
    S.page = 0; clampDates(); save(); render();
  }

  // 검색어 입력: 입력칸은 그대로 두고 표만 다시 그린다 (한글 입력 중에 글자가 끊기지 않게)
  function onSearch(ev) {
    var el = ev.target; if (!el.matches || !el.matches('input[data-act="q"]')) return;
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
    DATA = C.normalize(raw);
    META = { otherOk: raw._otherOk };
    if (!DATA.last) { document.getElementById('app').innerHTML = '<div class="main"><div class="error">불러온 데이터가 없습니다.</div></div>'; return; }
    restore();
    if (S.preset) applyPreset(S.preset); else clampDates();
    if (!S.from || !S.to) applyPreset('1');
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onSearch);
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
