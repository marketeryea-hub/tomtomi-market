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
  var S = { view: 'home', from: '', to: '', preset: '30', cmp: 'prev', cmpFrom: '', cmpTo: '', ch: 'all', unit: 'auto' };
  var READY = { home: 1, sales: 1 }; // 옮겨온 메뉴
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
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* 저장 못 해도 화면은 동작 */ } }
  function restore() { try { var v = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); if (v && typeof v === 'object') Object.keys(S).forEach(function (k) { if (v[k] !== undefined) S[k] = v[k]; }); } catch (e) { /* 무시 */ } }

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
    var presets = [['7', '7일'], ['30', '30일'], ['90', '90일'], ['thisMonth', '이번 달'], ['lastMonth', '지난달'], ['thisYear', '올해'], ['all', '전체 기간']];
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
  function chartSvg(cur, prev) {
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
    var s = '<svg class="chart" role="img" aria-label="실매출 선과 광고비 막대 차트" viewBox="0 0 ' + W + ' ' + H + '">';
    for (var g = 0; g <= 4; g++) {
      var gy = T + ph - ph * g / 4;
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '" stroke="var(--line)" stroke-width="1"></line>';
      s += '<text x="' + (L - 6) + '" y="' + (gy + 4) + '" text-anchor="end">' + shortWon(maxS * g / 4) + '</text>';
    }
    if (maxA > 1) {
      s += '<text x="' + (W - R + 6) + '" y="' + (yA(maxA) + 4) + '">' + shortWon(maxA) + '</text>';
      s += '<text x="' + (W - R + 6) + '" y="' + (T + ph + 4) + '">0</text>';
    }
    var bw = Math.max(2, Math.min(28, step * 0.6));
    cur.forEach(function (o, i) {
      if (o.ad <= 0) return;
      var y = yA(o.ad);
      s += '<rect x="' + (x(i) - bw / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (T + ph - y).toFixed(1) + '" fill="var(--ad)" rx="2"><title>' + esc(o.label) + ' 광고비 ' + won(o.ad) + '원</title></rect>';
    });
    function path(arr) { return arr.map(function (o, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + yS(o.sales).toFixed(1); }).join(' '); }
    if (prev && prev.length) s += '<path d="' + path(prev.slice(0, n)) + '" fill="none" stroke="var(--prev)" stroke-width="2" stroke-dasharray="6 6"></path>';
    s += '<path d="' + path(cur) + '" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"></path>';
    var every = Math.max(1, Math.ceil(n / 8));
    cur.forEach(function (o, i) {
      s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + yS(o.sales).toFixed(1) + '" r="' + (n <= 45 ? 3 : 1.5) + '" fill="var(--accent)"><title>' + esc(o.label) + ' 실매출 ' + won(o.sales) + '원' + (prev && prev[i] ? ' (비교 ' + won(prev[i].sales) + '원)' : '') + '</title></circle>';
      if (i % every === 0) s += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(o.label) + '</text>';
    });
    return s + '</svg>';
  }

  /* ───────── 홈 ───────── */
  function viewHome() {
    var cr = cmpRange(), has = !!cr;
    var sc = C.summary(DATA, S.from, S.to), sp = has ? C.summary(DATA, cr.from, cr.to) : null;
    var unit = C.autoUnit(S.from, S.to);
    var cur = C.bucket(C.daily(DATA, S.from, S.to), unit);
    var prev = has ? C.bucket(C.daily(DATA, cr.from, cr.to), unit) : null;
    var unitName = unit === 'day' ? '일별' : unit === 'week' ? '주별' : '월별';
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
    if (has) h += '<span class="legend"><span class="lg-dash"></span>비교 기간</span>';
    h += '<span class="legend"><span class="lg-bar"></span>광고비 (오른쪽 눈금)</span></div>';
    h += chartSvg(cur, prev);
    h += '<span class="note">선은 실매출(왼쪽 눈금), 막대는 스토어 광고비(네이버SA + 메타 + 애드부스트)입니다. 점에 마우스를 올리면 값이 보입니다.</span></section>';

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
    if (has) h += '<span class="legend"><span class="lg-dash"></span>비교 기간</span>';
    if (aKey) h += '<span class="legend"><span class="lg-bar"></span>' + (ch === 'coupang' ? '쿠팡애즈 광고비 (참고)' : '광고비') + '</span>';
    h += '</div>' + chartSvg(series(M.rows), has ? series(M.prows) : null);
    h += '<span class="note">' + UNIT_NAME[M.unit] + ' 단위' + (S.unit === 'auto' ? ' (기간 길이에 맞춰 자동 선택)' : '') + '. 점에 마우스를 올리면 값이 보입니다.</span></section>';

    // 표 + 옆 목록
    h += '<div class="row">';
    h += '<section class="card grow3 flush" aria-label="기간별 실적"><div class="card-h pad"><h2>' + (ch === 'other' ? '주문 목록' : UNIT_NAME[M.unit] + '별 실적') + '</h2><button type="button" class="chip" data-act="csv">엑셀로 받기 (CSV)</button></div><div class="scroll">';
    if (ch === 'other') {
      var orows = C.otherRows(DATA, S.from, S.to);
      h += '<table class="tbl"><thead><tr><th scope="col">날짜</th><th scope="col">마켓</th><th scope="col">상품</th><th scope="col" class="r">수량</th><th scope="col" class="r">매출</th></tr></thead><tbody>';
      if (!orows.length) h += '<tr><td colspan="5" class="none">이 기간에 기타마켓 주문이 없습니다.</td></tr>';
      orows.slice(0, 100).forEach(function (e) { h += '<tr><th scope="row">' + dot(e.d) + '</th><td>' + esc(e.market) + '</td><td>' + esc(e.product) + '</td><td class="r num">' + n0(e.qty) + '</td><td class="r num b">' + n0(e.amount) + '</td></tr>'; });
      if (orows.length) h += '<tr class="sum"><th scope="row">합계</th><td></td><td></td><td class="r num">' + n0(t.otherQty) + '</td><td class="r num b">' + n0(t.other) + '</td></tr>';
      h += '</tbody></table>';
    } else {
      var cols = salesColumns(ch), list = M.rows.slice().reverse(), LIMIT = 100;
      h += '<table class="tbl"><thead><tr><th scope="col">' + (M.unit === 'day' ? '날짜' : '기간') + '</th>';
      cols.forEach(function (c) { h += '<th scope="col" class="r">' + c[0] + '</th>'; });
      h += '</tr></thead><tbody>';
      list.slice(0, LIMIT).forEach(function (o) {
        h += '<tr><th scope="row">' + (M.unit === 'day' ? dot(o.key) : esc(o.label)) + '</th>';
        cols.forEach(function (c) { var v = o[c[1]]; h += '<td class="r num' + (c[2] ? ' b' : '') + '">' + (v ? n0(v) : '<span class="zero">0</span>') + '</td>'; });
        h += '</tr>';
      });
      h += '<tr class="sum"><th scope="row">합계</th>';
      cols.forEach(function (c) { h += '<td class="r num' + (c[2] ? ' b' : '') + '">' + n0(t[c[1]]) + '</td>'; });
      h += '</tr></tbody></table>';
      if (list.length > LIMIT) h += '<p class="note pad">최근 ' + LIMIT + '줄만 보여줍니다. 전체 ' + list.length + '줄은 [엑셀로 받기]로 받을 수 있습니다.</p>';
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
    h += cur.id === 'home' ? viewHome() : cur.id === 'sales' ? viewSales() : viewSoon(cur.label);
    h += '</main></div>';
    app.innerHTML = h;
  }

  function onClick(ev) {
    var el = ev.target.closest('[data-act]'); if (!el || el.tagName === 'INPUT') return;
    var act = el.getAttribute('data-act'), key = el.getAttribute('data-key');
    if (act === 'view') S.view = key;
    else if (act === 'preset') applyPreset(key);
    else if (act === 'cmp') {
      if (key === 'custom') { var r = cmpRange() || C.prevPeriod(S.from, S.to); S.cmpFrom = r.from; S.cmpTo = r.to; }
      S.cmp = key;
    } else if (act === 'ch') S.ch = key;
    else if (act === 'unit') S.unit = key;
    else if (act === 'csv') { downloadCsv(); return; }
    else return;
    save(); render();
  }
  function onChange(ev) {
    var el = ev.target; if (!el.matches || !el.matches('input[data-act]')) return;
    var act = el.getAttribute('data-act'), v = el.value; if (!v) return;
    if (act === 'from') { S.from = v; if (S.from > S.to) S.to = S.from; S.preset = ''; }
    else if (act === 'to') { S.to = v; if (S.to < S.from) S.from = S.to; S.preset = ''; }
    else if (act === 'cmpFrom') { S.cmpFrom = v; if (S.cmpTo && S.cmpFrom > S.cmpTo) S.cmpTo = S.cmpFrom; }
    else if (act === 'cmpTo') { S.cmpTo = v; if (S.cmpFrom && S.cmpTo < S.cmpFrom) S.cmpFrom = S.cmpTo; }
    clampDates(); save(); render();
  }

  function start(raw) {
    DATA = C.normalize(raw);
    META = { otherOk: raw._otherOk };
    if (!DATA.last) { document.getElementById('app').innerHTML = '<div class="main"><div class="error">불러온 데이터가 없습니다.</div></div>'; return; }
    restore();
    if (S.preset) applyPreset(S.preset); else clampDates();
    if (!S.from || !S.to) applyPreset('30');
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
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
