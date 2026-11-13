/* 톰토미 대시보드 v6 — 슬랙 리포트 문구 만들기
 *
 * v5의 데일리, 위클리, 먼슬리, 경쟁사 리포트 구성을 그대로 두고 숫자는 v6 정의(calc.js)를 쓴다.
 * 모든 리포트 맨 아래에 대시보드 주소를 붙인다.
 */
(function (root) {
  'use strict';
  var C = root.TTCalc || (typeof require !== 'undefined' ? require('./calc.js') : null);
  var DASHBOARD_URL = 'https://marketeryea-hub.github.io/tomtomi-market/v6.html';
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];

  function won(n) { return Math.round(n || 0).toLocaleString('ko-KR') + '원'; }
  function cnt(n) { return Math.round(n || 0).toLocaleString('ko-KR'); }
  function dot(d) { return d.slice(0, 4) + '.' + d.slice(5, 7) + '.' + d.slice(8, 10); }
  function md(d) { return +d.slice(5, 7) + '/' + +d.slice(8, 10); }
  function dow(d) { var p = d.split('-'); return DOW[new Date(+p[0], +p[1] - 1, +p[2]).getDay()]; }
  function chg(c, p) { // 이전 대비 증감
    if (!p) return c ? '이전 없음' : '변동 없음';
    var r = (c - p) / Math.abs(p) * 100;
    return (r > 0 ? '▲' : r < 0 ? '▼' : '') + Math.abs(r).toFixed(1) + '%';
  }
  function roas(cost, rev) { return cost > 0 ? Math.round(rev / cost * 100).toLocaleString('ko-KR') + '%' : '—'; }
  function pct1(a, b) { return b > 0 ? (a / b * 100).toFixed(1) + '%' : '—'; }
  function footer(lines, last) {
    lines.push('');
    lines.push('※ ' + dot(last) + '까지 올린 데이터 기준');
    lines.push('📎 대시보드: ' + DASHBOARD_URL);
    return lines.join('\n');
  }
  // 품목 TOP: 모든 채널 합 매출 (네이버 순매출 배분 + 쿠팡 입고 + 기타마켓)
  function topItems(data, from, to, n) {
    var X = C.items(data, from, to), list = [];
    Object.keys(X.rows).forEach(function (c) {
      if (c === C.NONE) return;
      var r = X.rows[c], rev = 0, qty = 0, chs = [];
      ['naver', 'coupang', 'other'].forEach(function (k) { var x = r.ch[k]; rev += x.rev; qty += x.qty; if (x.n && x.rev) chs.push({ naver: '네이버', coupang: '쿠팡', other: '기타' }[k]); });
      var name = X.master[c] && X.master[c].name ? X.master[c].name : '';
      if (rev > 0) list.push({ code: c.indexOf('CP:') === 0 ? '코드 없음' : c, name: name, rev: rev, qty: qty, chs: chs });
    });
    return list.sort(function (a, b) { return b.rev - a.rev; }).slice(0, n);
  }
  function topPaths(data, from, to, n) {
    var out = [];
    C.trafficPaths(data, from, to).forEach(function (g) { g.subList.forEach(function (x) { out.push({ name: g.name + (x.name && x.name !== '-' ? ' > ' + x.name : ''), visits: x.visits, orders: x.orders, rev: x.rev }); }); });
    return out.sort(function (a, b) { return b.visits - a.visits; }).slice(0, n);
  }
  function snsLines(online) {
    var crm = online && online.crm; if (!crm) return [];
    var out = [];
    [['naver', '스마트스토어 알림받기'], ['insta', '인스타그램'], ['tiktok', '틱톡'], ['threads', '스레드']].forEach(function (m) {
      var arr = crm[m[0]] || []; if (!arr.length) return;
      var a = arr[arr.length - 1], b = arr.length > 1 ? arr[arr.length - 2] : null, line = '▸ ' + m[1] + ': ' + cnt(a.val) + '명';
      if (b) { var df = a.val - b.val; line += df > 0 ? ' ▲' + cnt(df) : df < 0 ? ' ▼' + cnt(-df) : ' (변동 없음)'; }
      out.push(line + ' (' + md(a.date) + ' 기준)');
    });
    return out;
  }

  // 데일리 (조회 기간 기준, 비교 기간 대비)
  function daily(data, from, to, cmp, online) {
    var s = C.summary(data, from, to), p = cmp ? C.summary(data, cmp.from, cmp.to) : null, days = C.dayDiff(from, to) + 1, L = [];
    L.push(days === 1 ? '📊 *톰토미 커머스 데일리리포트 (' + dot(from) + ' ' + dow(from) + ')*' : '📊 *톰토미 커머스 리포트 (' + dot(from) + ' ~ ' + dot(to) + ', ' + days + '일)*');
    if (cmp) L.push('비교: ' + dot(cmp.from) + (cmp.to !== cmp.from ? ' ~ ' + dot(cmp.to) : ''));
    L.push('');
    if (p) {
      var sig = C.signals(data, { from: from, to: to }, cmp, s, p);
      if (sig.length) { L.push('*🚨 특이사항 (자동 감지)*'); sig.forEach(function (g) { L.push('▸ ' + g.title + ' (' + g.desc + ')'); }); L.push(''); }
    }
    L.push('*💰 매출*');
    L.push('▸ 실매출 ' + won(s.total) + (p ? ' (' + chg(s.total, p.total) + ')' : ''));
    L.push('  ↳ 네이버 순매출 ' + won(s.naverNet) + (p ? ' (' + chg(s.naverNet, p.naverNet) + ')' : '') + ' / 쿠팡 입고 ' + won(s.coupang) + ' / 기타마켓 ' + won(s.other));
    L.push('▸ 네이버 주문 ' + cnt(s.naverOrders) + '건' + (p ? ' (' + chg(s.naverOrders, p.naverOrders) + ')' : ''));
    if (days > 1) L.push('▸ 일평균 실매출 ' + won(s.total / days));
    L.push('');
    L.push('*📣 광고*');
    L.push('▸ 스토어 광고비 ' + won(s.adStore) + (p ? ' (' + chg(s.adStore, p.adStore) + ')' : '') + ' — SA ' + won(s.adSa) + ' / 메타 ' + won(s.adMeta) + ' / 애드부스트 ' + won(s.adBoost));
    L.push('▸ 톰토미스토어 ROAS ' + roas(s.adStore, s.naverNet) + (p ? ' (이전 ' + roas(p.adStore, p.naverNet) + ')' : ''));
    L.push('▸ 쿠팡애즈 ROAS ' + roas(s.coupAdCost, s.coupAdRev) + ' (광고비 ' + won(s.coupAdCost) + ', 참고용)');
    var top = topItems(data, from, to, 3);
    if (top.length) {
      L.push('');
      L.push('*[고매출 품목 TOP3]*');
      top.forEach(function (o, i) { L.push((i + 1) + '. ' + o.code + ' ' + o.name + ' — ' + won(o.rev) + ' (' + cnt(o.qty) + '개, ' + o.chs.join('/') + ')'); });
    }
    var tt = C.trafficTotal(C.trafficDaily(data, from, to));
    if (tt.visits) {
      L.push('');
      L.push('*🔀 유입*');
      L.push('▸ 방문 ' + cnt(tt.visits) + ' / 주문 ' + cnt(tt.orders) + ' / 전환율 ' + pct1(tt.orders, tt.visits));
      topPaths(data, from, to, 3).forEach(function (x, i) { L.push((i + 1) + '. ' + x.name + ' — ' + cnt(x.visits) + '방문, 전환율 ' + pct1(x.orders, x.visits)); });
    }
    var sns = snsLines(online);
    if (sns.length) { L.push(''); L.push('*📱 SNS 팔로워*'); sns.forEach(function (x) { L.push(x); }); }
    return footer(L, data.last);
  }

  // 위클리: 데이터 기준일까지 끝난 마지막 한 주(월~일), 전주 대비
  function lastWeek(last) {
    var p = last.split('-'), dt = new Date(+p[0], +p[1] - 1, +p[2]), back = dt.getDay() === 0 ? 0 : dt.getDay(); // 일요일까지
    var to = C.addDays(last, -back), from = C.addDays(to, -6);
    return { from: from, to: to, prev: { from: C.addDays(from, -7), to: C.addDays(from, -1) } };
  }
  function weekly(data, online) {
    var w = lastWeek(data.last), s = C.summary(data, w.from, w.to), p = C.summary(data, w.prev.from, w.prev.to), L = [];
    L.push('📈 *톰토미 주간 인사이트 (' + dot(w.from) + ' ~ ' + dot(w.to) + ')*');
    L.push('비교: 전주 ' + dot(w.prev.from) + ' ~ ' + dot(w.prev.to));
    L.push('');
    L.push('*💰 매출*');
    L.push('▸ 실매출 ' + won(s.total) + ' (' + chg(s.total, p.total) + ')');
    L.push('  ↳ 네이버 순매출 ' + won(s.naverNet) + ' (' + chg(s.naverNet, p.naverNet) + ') / 쿠팡 입고 ' + won(s.coupang) + ' (' + chg(s.coupang, p.coupang) + ') / 기타마켓 ' + won(s.other));
    L.push('▸ 일평균 실매출 ' + won(s.total / 7));
    L.push('');
    L.push('*📣 광고*');
    L.push('▸ 스토어 광고비 ' + won(s.adStore) + ' (' + chg(s.adStore, p.adStore) + '), ROAS ' + roas(s.adStore, s.naverNet) + ' (전주 ' + roas(p.adStore, p.naverNet) + ')');
    L.push('');
    var top = topItems(data, w.from, w.to, 5);
    if (top.length) {
      L.push('*🏆 주간 품목 TOP5*');
      top.forEach(function (o, i) { L.push((i + 1) + '. ' + o.code + ' ' + o.name + ' — ' + won(o.rev) + ' (' + cnt(o.qty) + '개)'); });
      L.push('');
    }
    var tt = C.trafficTotal(C.trafficDaily(data, w.from, w.to)), tp = C.trafficTotal(C.trafficDaily(data, w.prev.from, w.prev.to));
    if (tt.visits) {
      L.push('*🔀 주간 유입*');
      L.push('▸ 방문 ' + cnt(tt.visits) + ' (' + chg(tt.visits, tp.visits) + '), 전환율 ' + pct1(tt.orders, tt.visits) + ' (전주 ' + pct1(tp.orders, tp.visits) + ')');
      topPaths(data, w.from, w.to, 5).forEach(function (x, i) { L.push((i + 1) + '. ' + x.name + ' — ' + cnt(x.visits) + '방문, 전환율 ' + pct1(x.orders, x.visits) + (x.rev > 0 ? ', ' + won(x.rev) : '')); });
    }
    var sns = snsLines(online);
    if (sns.length) { L.push(''); L.push('*📱 SNS 팔로워*'); sns.forEach(function (x) { L.push(x); }); }
    return footer(L, data.last);
  }

  // 먼슬리: 데이터 기준일이 그 달 말일이면 그 달, 아니면 지난달. 전월 대비
  function lastMonth(last) {
    var nx = C.addDays(last, 1), ym = nx.slice(8, 10) === '01' ? last.slice(0, 7) : null;
    if (!ym) { var p = last.split('-'), d = new Date(+p[0], +p[1] - 2, 1); ym = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7), from = ym + '-01', to = C.addDays((m === 12 ? (y + 1) + '-01' : y + '-' + ('0' + (m + 1)).slice(-2)) + '-01', -1);
    var pd = new Date(y, m - 2, 1), pym = pd.getFullYear() + '-' + ('0' + (pd.getMonth() + 1)).slice(-2);
    return { y: y, m: m, from: from, to: to, prev: { from: pym + '-01', to: C.addDays(from, -1) } };
  }
  function monthly(data, online) {
    var M = lastMonth(data.last), s = C.summary(data, M.from, M.to), p = C.summary(data, M.prev.from, M.prev.to), L = [];
    var cad = C.adsTotal(C.adsDaily(data, M.from, M.to)), pad = C.adsTotal(C.adsDaily(data, M.prev.from, M.prev.to));
    L.push('🗓️ *톰토미 먼슬리 리포트 — ' + M.y + '년 ' + M.m + '월*');
    L.push('(전월: ' + M.prev.from.slice(0, 4) + '년 ' + +M.prev.from.slice(5, 7) + '월)');
    L.push('');
    L.push('*💰 매출*');
    L.push('▸ 실매출 ' + won(s.total) + ' (' + chg(s.total, p.total) + ')');
    L.push('  ↳ 네이버 순매출 ' + won(s.naverNet) + ' (' + chg(s.naverNet, p.naverNet) + ') / 기타마켓 ' + won(s.other) + ' (' + chg(s.other, p.other) + ')');
    L.push('  ↳ 쿠팡 입고 (B2B) ' + won(s.coupang) + ' (' + chg(s.coupang, p.coupang) + ')');
    L.push('▸ 네이버 주문 ' + cnt(s.naverOrders) + '건 (' + chg(s.naverOrders, p.naverOrders) + ')');
    L.push('');
    L.push('*📣 광고비*');
    var ca = s.adStore + s.coupAdCost, pa = p.adStore + p.coupAdCost;
    L.push('▸ 총 광고비 ' + won(ca) + ' (' + chg(ca, pa) + ')');
    L.push('  ↳ 네이버 SA ' + won(s.adSa) + ' / 애드부스트 ' + won(s.adBoost) + ' / 메타 ' + won(s.adMeta) + ' / 쿠팡애즈 ' + won(s.coupAdCost));
    L.push('');
    L.push('*📊 마케팅 지표*');
    L.push('▸ 네이버 SA ROAS ' + roas(cad.saCost, cad.saRev) + ' (전월 ' + roas(pad.saCost, pad.saRev) + ')');
    L.push('▸ 톰토미스토어 ROAS ' + roas(s.adStore, s.naverNet) + ' (전월 ' + roas(p.adStore, p.naverNet) + ')');
    L.push('▸ 쿠팡애즈 ROAS ' + roas(s.coupAdCost, s.coupAdRev) + ' (전월 ' + roas(p.coupAdCost, p.coupAdRev) + ', 참고용)');
    L.push('▸ 메타 CTR ' + (s.metaCtr === null ? '—' : (s.metaCtr * 100).toFixed(2) + '%') + ' (전월 ' + (p.metaCtr === null ? '—' : (p.metaCtr * 100).toFixed(2) + '%') + ')');
    var top = topItems(data, M.from, M.to, 5);
    if (top.length) {
      L.push('');
      L.push('*🏆 월간 품목 TOP5*');
      top.forEach(function (o, i) { L.push((i + 1) + '. ' + o.code + ' ' + o.name + ' — ' + won(o.rev) + ' (' + cnt(o.qty) + '개)'); });
    }
    L.push('');
    L.push(competitor(online, true));
    return footer(L, data.last);
  }

  // 경쟁사 키워드 검색량 (온라인 대시보드 구글 시트)
  function competitor(online, inner) {
    var comp = online && online.competitor;
    if (!comp || !Object.keys(comp).length) return inner ? '*⚔️ 경쟁사 동향*\n⚠️ 경쟁사 데이터를 불러오지 못했습니다 (구글 시트 competitor 탭 확인)' : '⚠️ 경쟁사 데이터를 불러오지 못했습니다.\n온라인 대시보드 구글 시트의 competitor 탭을 확인해 주세요.\n\n📎 대시보드: ' + DASHBOARD_URL;
    var months = {};
    Object.keys(comp).forEach(function (b) { comp[b].dates.forEach(function (m) { months[m] = 1; }); });
    var ms = Object.keys(months).sort(), lm = ms[ms.length - 1], pm = ms.length > 1 ? ms[ms.length - 2] : null, rows = [], L = [];
    Object.keys(comp).forEach(function (b) {
      var d = comp[b], i = d.dates.indexOf(lm); if (i < 0) return;
      var j = pm ? d.dates.indexOf(pm) : -1;
      rows.push({ b: b, v: d.vals[i], p: j >= 0 ? d.vals[j] : null });
    });
    rows.sort(function (a, b) { return b.v - a.v; });
    L.push(inner ? '*⚔️ 경쟁사 키워드 검색량 (' + lm + ')*' : '⚔️ *톰토미 경쟁사 키워드 검색량 (' + lm + ')*');
    if (!inner) L.push('');
    rows.forEach(function (r, i) {
      var line = (i + 1) + '. ' + r.b + ': ' + cnt(r.v);
      if (r.p) { var df = r.v - r.p; line += df > 0 ? ' ▲' + cnt(df) + ' (+' + (df / r.p * 100).toFixed(1) + '%)' : df < 0 ? ' ▼' + cnt(-df) + ' (' + (df / r.p * 100).toFixed(1) + '%)' : ' (동일)'; }
      if (r.b.indexOf('톰토미') >= 0) line = '👑 ' + line;
      L.push(line);
    });
    if (pm) L.push('※ ' + pm + ' 대비 증감');
    if (!inner) { L.push(''); L.push('📎 대시보드: ' + DASHBOARD_URL); }
    return L.join('\n');
  }

  var api = { daily: daily, weekly: weekly, monthly: monthly, competitor: function (online) { return competitor(online, false); }, lastWeek: lastWeek, lastMonth: lastMonth, DASHBOARD_URL: DASHBOARD_URL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TTReport = api;
})(typeof window !== 'undefined' ? window : globalThis);
