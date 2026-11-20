/* v6 계산 규칙 점검 — 실행: node v6/tests/calc.test.js
 * 실제 매출 데이터는 저장소에 올리지 않는다. 여기서는 규칙마다 작은 예시로 확인한다.
 */
const C = require('../calc.js');
let fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.log('실패:', name, '\n  결과', JSON.stringify(got), '\n  기대', JSON.stringify(want)); }
}

const raw = {
  naver: [
    { d: '2026-01-01', r: 10000, refund: 3000 },                                  // 옛 양식: r은 총액 → 순 7,000
    { d: '2026-01-01', r: 5000, refund: 0 },                                      // 같은 날 시간대별 행
    { d: '2026-01-02', r: 8000, rev_gross: 9000, refund: 1000, src: 'newSales' }  // 새 양식: r이 순매출
  ],
  coupStock: [
    { d: '2026-01-01', div: '발주', a: '1,000', qty: 1 },
    { d: '2026-01-02', type: '발주', a: 2000, qty: 2 },   // 옛 이전분: div 대신 type
    { d: '2026-01-02', div: '반출', a: 500 }               // 발주가 아니면 제외
  ],
  other: [{ d: '2026-1-2', a: 300, m: '이베이' }],          // 0이 빠진 날짜
  naverAd: [
    { d: '2026-01-01', campaign: 'A', cost: 100, rev: 0 },
    { d: '2026-01-01', cost: 100, rev: 0 },                 // 캠페인 행이 있는 날의 합계 행 → 버림
    { d: '2026-01-02', cost: 50 }
  ],
  metaAd: [{ d: '2026-01-02', cost: 40, clicks: 5, imp: 100 }],
  naverAdBoost: [{ d: '2026-01-02', cost: 10 }],
  coupAd: [{ d: '2026-01-02', cost: 200, rev: 600 }],
  naverOrder: [
    { d: '2026-01-01', prodId: '111', opt: '', qty: 2, st: '구매확정' },
    { d: '2026-01-01', prodId: '222', opt: '선택1: 공룡 / 선택2: 동물 / 선택3: 공룡', qty: 1, st: '취소' },
    { d: '2026-01-01', prodId: '111', opt: '', qty: 1, st: '미결제취소' },
    { d: '2026-01-02', prodId: '333', opt: '추가 구성: 학산키즈:빅롤스티커 공룡', qty: 1, st: '배송완료' }
  ],
  skuMap: [
    { k: '111|(없음)', prodId: '111', codes: [{ c: 'A', q: 1 }, { c: 'B', q: 2 }], names: ['에이', '비'] },
    { k: '222|공룡', prodId: '222', codes: [{ c: 'D', q: 1 }], names: ['공룡'] },
    { k: '222|동물', prodId: '222', codes: [{ c: 'E', q: 1 }], names: ['동물'] }
  ],
  naverProd: [{ d: '2026-01-01', prodId: '111', qty: 2, rev: 100 }, { d: '2026-01-01', prodId: '222', qty: 1, rev: 0 }]
};
const D = C.normalize(raw);
const s = C.summary(D, '2026-01-01', '2026-01-02');

eq('네이버 순매출(옛 양식은 환불 차감)', s.naverNet, 7000 + 5000 + 8000);
eq('네이버 총액', s.naverGross, 10000 + 5000 + 9000);
eq('쿠팡 입고(type도 인정, 반출 제외)', s.coupang, 3000);
eq('기타마켓(날짜 정리)', s.other, 300);
eq('실매출 합계', s.total, 20000 + 3000 + 300);
eq('SA 이중 집계 방지', s.adSa, 150);
eq('스토어 광고비', s.adStore, 150 + 40 + 10);
eq('스토어 ROAS', s.storeRoas, 20000 / 200);
eq('쿠팡애즈는 참고 숫자', [s.coupAdCost, s.coupAdRev, s.coupAdRoas], [200, 600, 3]);
eq('메타 CTR', s.metaCtr, 0.05);
eq('날짜 정리', [C.normDate('2026-3-8'), C.normDate('2026.03.08.'), C.normDate('2026/03/08 10:00'), C.normDate('x')], ['2026-03-08', '2026-03-08', '2026-03-08', '']);
eq('바로 앞 같은 길이', C.prevPeriod('2026-10-12', '2026-11-10'), { from: '2026-09-12', to: '2026-10-11' });
eq('작년 같은 기간', C.lastYear('2026-10-01', '2026-10-31'), { from: '2025-10-01', to: '2025-10-31' });
eq('최근 1일(기본 기간)', C.preset('1', '2026-11-10', '2023-07-06'), { from: '2026-11-10', to: '2026-11-10' });
eq('지난달', C.preset('lastMonth', '2026-11-10', '2023-07-06'), { from: '2026-10-01', to: '2026-10-31' });
eq('전체 기간', C.preset('all', '2026-11-10', '2023-07-06'), { from: '2023-07-06', to: '2026-11-10' });
eq('조회 범위', [D.first, D.last], ['2026-01-01', '2026-01-02']);
const dl = C.daily(D, '2026-01-01', '2026-01-03');
eq('날짜별 합 = 요약 합', dl.reduce((a, o) => a + o.sales, 0), s.total);
eq('빈 날짜도 0으로 채움', [dl.length, dl[2].sales], [3, 0]);
eq('세트 옵션 풀기', C.skuParseOpt('선택1: 마트 / 선택2: 특이한 생물 / 선택3: 동물'), ['마트', '특이한생물', '동물']);
eq('옛 세트 표기', C.skuParseOpt('톰토미 노래하는 스티커북 3종 세트: 공룡+탈것+동물'), ['공룡', '탈것', '동물']);
eq('선택안함은 옵션 없음', C.skuParseOpt('추가구성: 선택안함'), []);
const sk = C.skuAggregate(D, '2026-01-01', '2026-01-02').map(o => [o.code, o.qty, o.cancel, o.net]).sort();
eq('SKU 집계(세트 분해, 취소, 미결제 제외, 미매핑)', sk, [['(매핑 없음)', 1, 0, 1], ['A', 2, 0, 2], ['B', 4, 0, 4], ['D', 2, 2, 0], ['E', 1, 1, 0]]);
eq('매핑 누락 옵션', C.skuUnmapped(D), ['333|빅롤스티커공룡']);
eq('판매와 주문 대조 일치', C.orderCheck(D).diff.length, 0);
eq('증감(이전 0이면 비율 없음)', [C.delta(10, 0).pct, C.delta(15, 10).pct], [null, 0.5]);

const full = C.dailyFull(D, '2026-01-01', '2026-01-02');
const tf = C.totalFull(full);
eq('날짜별 상세 합 = 요약', [tf.nNet, tf.nGross, tf.nRefund, tf.coup, tf.other, tf.adStore, tf.coupAdCost, tf.total], [s.naverNet, s.naverGross, s.naverRefund, s.coupang, s.other, s.adStore, s.coupAdCost, s.total]);
eq('월로 묶어도 합은 같다', C.totalFull(C.bucketFull(full, 'month')).total, s.total);
eq('주는 월요일 시작', C.bucketFull(C.dailyFull(D, '2025-12-31', '2026-01-05'), 'week').map(b => b.key), ['2025-12-29', '2026-01-05']);
eq('쿠팡 상위 품목 합 = 쿠팡 입고', C.coupangTop(D, '2026-01-01', '2026-01-02').reduce((a, o) => a + o.amount, 0), s.coupang);
eq('기타마켓 마켓별', C.otherByMarket(D, '2026-01-01', '2026-01-02').map(o => [o.market, o.amount]), [['이베이', 300]]);

const ad = C.adsTotal(C.adsDaily(D, '2026-01-01', '2026-01-02'));
eq('광고 날짜별 합 = 요약', [ad.saCost, ad.metaCost, ad.boostCost, ad.store, ad.coupCost, ad.coupRev, ad.nNet], [s.adSa, s.adMeta, s.adBoost, s.adStore, s.coupAdCost, s.coupAdRev, s.naverNet]);
eq('비율은 합계끼리 나눈다', [C.ratio(ad.metaClicks, ad.metaImp), C.ratio(1, 0)], [0.05, null]);
eq('SA 캠페인별(구분 없는 행 포함)', C.adsBreakdown(D, 'sa', '2026-01-01', '2026-01-02').map(o => [o.name, o.cost]), [['A', 100], ['(구분 없음)', 50]]);

// 원가, 상품 (작은 예시)
{
  const D2 = C.normalize({
    naverProd: [{ d: '2026-02-01', prodId: 'P1', name: '세트', qty: 3, rev: 30000 }, { d: '2026-02-01', prodId: 'P2', name: '단품', qty: 1, rev: 5000 }],
    naverOrder: [
      { d: '2026-02-01', prodId: 'P1', name: '세트', opt: '', qty: 2, st: '구매확정' },
      { d: '2026-02-10', prodId: 'P1', name: '세트', opt: '', qty: 1, st: '구매확정' },
      { d: '2026-02-01', prodId: 'P1', name: '세트', opt: '', qty: 1, st: '취소' },
      { d: '2026-02-01', prodId: 'P1', name: '세트', opt: '', qty: 9, st: '미결제취소' },
      { d: '2026-02-01', prodId: 'P2', name: '단품', opt: '', qty: 1, st: '구매확정' }],
    skuMap: [{ k: 'P1|(없음)', codes: [{ c: 'A', q: 1 }, { c: 'B', q: 2 }], names: ['에이', '비'] }, { k: 'P2|(없음)', codes: [{ c: 'Z', q: 1 }], names: ['제트'] }],
    skuCost: [{ ver: '2026-01-01 00:00:00', rows: [{ c: 'A', cost: 999 }] },
      { ver: '2026-01-02 00:00:00', rows: [{ c: 'A', cost: 1000, from: '' }, { c: 'A', cost: 1500, from: '2026-02-05' }, { c: 'B', cost: 200, from: '' }] }]
  });
  const cx = C.costIndex(D2.costVer);
  eq('가장 최근 원가표 판을 쓴다', D2.costVer.ver, '2026-01-02 00:00:00');
  eq('적용 시작일 전후 원가, 없는 코드는 null', [C.costAt(cx, 'A', '2026-02-04'), C.costAt(cx, 'A', '2026-02-05'), C.costAt(cx, 'Z', '2026-02-05')], [1000, 1500, null]);
  const M = C.products(D2, '2026-02-01', '2026-02-28');
  const p1 = M.prods.find(o => o.prodId === 'P1'), p2 = M.prods.find(o => o.prodId === 'P2');
  // P1 원가: 2/1 2세트 = 2*(1000+2*200)=2800, 2/10 1세트 = 1500+400=1900 → 4700. 취소, 미결제취소는 제외
  eq('세트 원가 = 구성품 합, 취소 제외, 날짜별 원가', [p1.cost, p1.margin, p1.oqty], [4700, 25300, 9]);
  eq('원가 없는 상품은 마진 없음(0원 취급 금지)', [p2.margin, p2.noCost], [null, 1]);
  eq('합계 마진은 원가가 다 있는 상품만', [M.total.net, M.total.netCosted, M.total.margin, M.noCost.map(s => s.code)], [35000, 30000, 25300, ['Z']]);
  const sk = {}; M.skus.forEach(s => sk[s.code] = [Math.round(s.rev), s.est]);
  eq('SKU 매출: 수량 비율로 배분, 여러 SKU 상품은 추정 표시', [sk.A, sk.B, sk.Z, M.total.unalloc], [[10000, true], [20000, true], [5000, false], 0]);
  eq('SKU 매출 합 = 상품 순매출 합', Math.round(M.skus.reduce((a, s) => a + s.rev, 0) + M.total.unalloc), M.total.net);
  const ps = C.productSeries(D2, ['P1', 'P2'], '2026-02-01', '2026-02-02');
  eq('상품 추이', [ps.labels, ps.series.P1, ps.series.P2, ps.unit], [['2026-02-01', '2026-02-02'], [30000, 0], [5000, 0], 'day']);
  const mg = C.costMerge(D2.costVer, [{ c: 'A', cost: 1100, from: '' }, { c: 'Z', cost: 300, from: '' }]);
  eq('원가표 합치기: 새 표에 없는 줄은 유지', [mg.stat, mg.rows.length, mg.rows.find(r => r.c === 'B').cost], [{ added: 1, changed: 1, same: 0, kept: 2 }, 4, 200]);
  const mg2 = C.costMerge(D2.costVer, [{ c: 'B', name: '비(새이름)', cost: 0, from: '' }]);
  eq('원가 빈 줄은 이름만 바꾸고 원가는 유지', [mg2.rows.find(r => r.c === 'B').cost, mg2.rows.find(r => r.c === 'B').name], [200, '비(새이름)']);
  // 품목 기준: 채널 합이 매출 메뉴 숫자와 같아야 한다
  const X = C.items(D2, '2026-02-01', '2026-02-28'), S2 = C.summary(D2, '2026-02-01', '2026-02-28');
  let n = 0, c = 0, o = 0; Object.values(X.rows).forEach(r => { n += r.ch.naver.rev; c += r.ch.coupang.rev; o += r.ch.other.rev; });
  eq('품목 기준 네이버 매출 합 = 상품 순매출 합', Math.round(n), M.total.net);
  eq('품목 기준 쿠팡 합 = 쿠팡 입고', Math.round(c), Math.round(S2.coupang));
  eq('품목 기준 기타몰 합 = 기타마켓', Math.round(o), Math.round(S2.other));
  eq('품목 순서는 기간과 무관', C.itemOrder(D2).length > 0, true);
  const ia = C.items(D2, '2026-02-01', '2026-02-28').rows.A.ch.naver;
  eq('품목 A: 수량, 배분 매출, 원가', [ia.qty, Math.round(ia.rev), ia.cost], [3, 10000, 3500]);
}
// 유입: 경로 합 = 날짜 합, 품목 유입 합 = 상품 방문 합, 주 품목 80% 규칙
{
  const D3 = C.normalize({
    naverVisit: [{ d: '2026-06-01', path1: '네이버 외부', path2: 'instagram.com', path3: '-', visits: 10, orders: 1, rev: 1000 }, { d: '2026-06-01', path1: '직유입', path2: '-', path3: '-', visits: 5, orders: 0, rev: 0 }],
    naverProdVisit: [{ d: '2026-06-01', prodId: 'P1', name: '세트', visits: 8 }, { d: '2026-06-01', prodId: 'P2', name: '택1', visits: 4 }, { d: '2026-06-01', prodId: 'P9', name: '모름', visits: 3 }],
    naverProd: [{ d: '2026-06-01', prodId: 'P1', qty: 10, rev: 1 }, { d: '2026-06-01', prodId: 'P2', qty: 2, rev: 1 }],
    naverOrder: [{ d: '2026-06-01', prodId: 'P1', opt: '', qty: 9, st: '구매확정' }, { d: '2026-06-01', prodId: 'P1', opt: '추가', qty: 1, st: '구매확정' },
      { d: '2026-06-01', prodId: 'P2', opt: 'a', qty: 1, st: '구매확정' }, { d: '2026-06-01', prodId: 'P2', opt: 'b', qty: 1, st: '구매확정' }],
    skuMap: [{ k: 'P1|(없음)', codes: [{ c: 'A', q: 1 }] }, { k: 'P1|추가', codes: [{ c: 'B', q: 1 }] }, { k: 'P2|a', codes: [{ c: 'A', q: 1 }] }, { k: 'P2|b', codes: [{ c: 'B', q: 1 }] }]
  });
  const tt = C.trafficTotal(C.trafficDaily(D3, '2026-06-01', '2026-06-01'));
  const pth = C.trafficPaths(D3, '2026-06-01', '2026-06-01');
  eq('유입 날짜 합 = 경로 합', [tt.visits, pth.reduce((a, g) => a + g.visits, 0)], [15, 15]);
  const ti = C.trafficItems(D3, '2026-06-01', '2026-06-01').rows;
  eq('주 품목 90% 페이지는 그 품목, 반반 페이지는 여러 품목, 매핑 없으면 미지정', [ti.A && ti.A.visits, ti['MULTI:P2'] && ti['MULTI:P2'].visits, ti[C.NONE] && ti[C.NONE].visits], [8, 4, 3]);
}
// 프로모션: 증분 매출, ROI, 원가 미입력이면 ROI 없음, 데이터가 없는 날짜는 빼고 기준선도 같은 길이
{
  const mk = cost => C.normalize({
    naver: [{ d: '2026-03-10', r: 1, src: 'newSales' }],
    other: [{ d: '2026-03-01', a: 1000, m: '몰', code: 'A', qty: 1 }, { d: '2026-03-05', a: 4000, m: '몰', code: 'A', qty: 4 }, { d: '2026-03-06', a: 2000, m: '몰', code: 'A', qty: 2 }, { d: '2026-03-05', a: 9000, m: '몰', code: 'B', qty: 1 }],
    skuCost: cost ? [{ ver: '1', rows: [{ c: 'A', name: '에이', cost: 300, from: '' }] }] : [],
    promo: [{ id: 'p1', from: '2026-03-05', to: '2026-03-08', ch: 'other', items: ['A'], fee: 5, base: 'prev', costs: { gift: 500 }, updated: '1' },
      { id: 'p1', from: '2026-03-05', to: '2026-03-08', ch: 'other', items: ['A'], fee: 5, base: 'prev', costs: { gift: 1000 }, updated: '2' },
      { id: 'p2', from: '2026-03-01', to: '2026-03-02', del: 1 }, { id: 'p3', from: '2026-04-01', to: '2026-04-02', ch: 'all', items: [], costs: {} }]
  });
  const D = mk(true), P = D.promos.find(p => p.id === 'p1'), r = C.promoCalc(D, P);
  eq('프로모션: 같은 id는 마지막 저장분, 지운 것은 제외', [D.promos.length, P.costs.gift], [2, 1000]);
  eq('프로모션: 기간 매출, 기준선, 증분', [r.cur.rev, r.b.rev, r.incRev, r.cur.qty], [6000, 1000, 5000, 6]);
  eq('프로모션: 대상 품목만 센다 (B 제외), 기타몰은 수수료 없음', [r.cur.rows.B, r.incFee], [undefined, 0]);
  eq('프로모션: ROI = (증분 매출 - 증분 원가 - 비용) ÷ 비용', [r.incCogs, r.incProfit, r.roi, r.roas], [1500, 2500, 2.5, 6]);
  eq('프로모션: 원가가 없으면 ROI는 비운다', [C.promoCalc(mk(false), P).roi, C.promoCalc(mk(false), P).incRev], [null, 5000]);
  eq('프로모션: 아직 데이터 없는 프로모션은 예정', C.promoCalc(D, D.promos.find(p => p.id === 'p3')).state, 'plan');
  const run = C.promoCalc(D, Object.assign({}, P, { to: '2026-03-20' }));
  eq('프로모션: 진행 중이면 데이터 있는 날까지, 기준선도 같은 길이', [run.state, run.range.to, run.base.from, run.base.to], ['run', '2026-03-10', '2026-02-27', '2026-03-04']);
}
// 쿠팡애즈 옛 행은 전환이 orders 칸에 있다: 요약과 캠페인 표의 전환 수가 같아야 한다
{
  const D = C.normalize({ naver: [{ d: '2026-04-09', r: 1, src: 'newSales' }], coupAd: [{ d: '2026-04-09', cost: 100, rev: 500, clicks: 3, imp: 50, orders: 2, campaign: '가' }, { d: '2026-04-08', cost: 50, rev: 0, clicks: 1, imp: 20, conv: 1 }] });
  const a = C.adsTotal(C.adsDaily(D, '2026-04-08', '2026-04-09')), t = C.adTree(D, 'coupang', '2026-04-08', '2026-04-09', 'ad').total;
  eq('쿠팡 요약 = 캠페인 표 (광고비, 매출, 클릭, 노출, 전환)', [a.coupCost, a.coupRev, a.coupClicks, a.coupImp, a.coupConv], [t.cost, t.rev, t.clicks, t.imp, t.conv]);
  eq('쿠팡 전환 합', a.coupConv, 3);
}
// 쿠팡 광고 상품명 → 품목코드 (2026-11-17 예영 확인)
eq('쿠팡 광고 상품명 연결', ['톰토미 루나 NEW 봉제인형,블루,블루,1개,1개,36cm,36cm', '톰토미 봉제 애착인형 25cm,화이트,화이트,1개,1개', '톰토미 유아용 뉴 봉제 인형,화이트', '스타원엔터테인먼트 뽀로로 유아동요 + 0~3세를 위한 유아동요 80곡집 음악CD 2종 세트,5CD,5CD', '톰토미 크리스마스 캐롤 한국어 영어캐롤 35곡 수록,2CD,2CD', '뽀로로 유아동요,3CD,3CD'].map(C.coupAdCode), ['SOMD-0012', 'SOMD-0002', 'SOMD-0014', C.AD_OTHER, 'SOCD-0320', C.AD_OTHER]);
// 광고 계획: 작년 1개당 광고비로 예산 ↔ 판매 계산
{
  const det = []; for (let i = 0; i < 14; i++) { const d = C.addDays('2025-12-01', i); det.push({ d, camp: '가', group: '나', prod: '톰토미 크리스마스 캐롤', convProd: '톰토미 크리스마스 캐롤', cost: i < 7 ? 1000 : 3000, rev: i < 7 ? 20000 : 10000, qty: i < 7 ? 2 : 1, clicks: 5, imp: 100, orders: 1 }); }
  const D = C.normalize({ naver: [{ d: '2025-12-20', r: 1, src: 'newSales' }], coupAdDetail: det, coupStock: [] });
  const R = C.adPlanRef(D, 'SOCD-0320', 'coupang', '2025-12-01', '2025-12-14');
  eq('계획: 기준 실적 (광고비, 광고 판매, 1개당 광고비, 하루 평균)', [R.cost, R.adQty, R.cpa, R.daily, R.days], [28000, 21, 28000 / 21, 2000, 14]);
  eq('계획: 범위는 좋았던 주 ~ 나빴던 주', [R.cpaLo, R.cpaHi], [500, 3000]);
  const g = C.adPlanCalc(R, { mode: 'goal', basis: 'growth', val: 10, days: 14 });
  eq('계획: 작년 대비 10% 성장 목표', [Math.round(g.adQty * 10) / 10, Math.round(g.budget), Math.round(g.daily), g.budgetLo, g.budgetHi].map(Math.round), [23, 30800, 2200, 11550, 69300]);
  const b = C.adPlanCalc(R, { mode: 'budget', budget: 4000, days: 7 });
  eq('계획: 하루 예산에서 예상 판매', [b.budget, b.adQty, b.vsDaily], [28000, 21, 2]);
  eq('계획: 기준 기간에 광고 판매가 없으면 계산하지 않는다', C.adPlanCalc(C.adPlanRef(D, 'SOCD-0320', 'coupang', '2025-11-01', '2025-11-07'), { mode: 'goal', basis: 'growth', val: 10, days: 7 }).ok, false);
}
// 상품 관리: 가격 이력
{
  const I = C.itemInfo([{ d: '_malls', malls: ['11번가', ' '] }, { d: 'A', code: 'A', hist: [{ from: '2026-06-01', list: 12000, prices: { naver: 9900 } }, { from: '2026-01-01', list: 10000, prices: { naver: 9000, coupang: 7000 } }] }]);
  eq('가격: 몰 목록, 이력은 날짜순', [I.malls, I.by.A.map(h => h.from)], [['11번가'], ['2026-01-01', '2026-06-01']]);
  eq('가격: 그 날짜에 적용되는 값', [C.priceAt(I, 'A', '2025-12-31'), C.priceAt(I, 'A', '2026-03-01').prices.naver, C.priceAt(I, 'A', '2026-06-01').list], [null, 9000, 12000]);
  const m = C.priceMerge(I.by.A, { from: '2026-09-01', prices: { naver: 8900, '11번가': 9500 } });
  eq('가격: 새 날짜는 줄을 하나 더 쌓고 안 바꾼 값은 이어받는다', [m.changed, m.hist.length, m.hist[2].list, m.hist[2].prices], [true, 3, 12000, { naver: 8900, '11번가': 9500 }]);
  eq('가격: 이전 이력은 그대로', m.hist[0], { from: '2026-01-01', list: 10000, prices: { naver: 9000, coupang: 7000 } });
  eq('가격: 같은 값이면 바뀌지 않는다', C.priceMerge(I.by.A, { from: '2026-09-01', list: 12000, prices: { naver: 9900 } }).changed, false);
  const e = C.priceMerge(I.by.A, { from: '2026-06-01', list: 13000, prices: { naver: 0 } });
  eq('가격: 같은 적용일이면 그 줄을 고치고, 0은 비움', [e.hist.length, e.hist[1].list, e.hist[1].prices], [2, 13000, {}]);
}
// 옵션 매핑표: 읽기와 합치기 (통째 교체 아님)
{
  const P = C.skuMapParse([['확인', '구분', '네이버 상품번호', '상품명', '옵션값', '확정 SKU코드 (여기만 수정)', '코드명 (참고)', '비고'],
    ['✅', '단품', '1234567', '가', '공 룡', 'A', '에이', ''], ['✅', '세트', '1234567', '가', '세트', 'A + B*2', '에이 + 비', ''], ['', '', '1234567', '가', '공룡', 'Z', '', ''], ['', '', 'abc', '', 'x', 'A', '', ''], ['⚠️ 새 옵션', '', '7654321', '나', '', '', '', '']]);
  eq('매핑표 읽기: 줄 수, 중복, 상품번호 이상, 코드 빈 줄', [P.rows.length, P.dup, P.bad, P.empty], [2, 1, 1, 1]);
  eq('매핑표 읽기: 옵션값 정규화, 세트 수량', [P.rows[0].k, P.rows[1].codes, P.rows[1].names], ['1234567|공룡', [{ c: 'A', q: 1 }, { c: 'B', q: 2 }], ['에이', '비']]);
  eq('매핑표 읽기: 필요한 칸이 없으면 null', C.skuMapParse([['아무', '칸']]), null);
  const prev = [{ k: '1234567|공룡', codes: [{ c: 'OLD', q: 1 }] }, { k: '999999|(없음)', codes: [{ c: 'K', q: 1 }] }];
  const M = C.skuMapMerge(prev, P.rows);
  eq('매핑표 합치기: 바뀜 1, 새로 1, 파일에 없는 줄은 그대로', [M.stat, M.rows.map(r => r.k), M.rows[0].codes[0].c], [{ added: 1, changed: 1, same: 0, kept: 1 }, ['1234567|공룡', '999999|(없음)', '1234567|세트'], 'A']);
}
// 백업에서 되돌리기: 줄 단위로 다시 묶고 클라우드와 비교
{
  const neu = C.backupRows({ ARCHIVE: { naver: [{ d: '2026-01-01', r: 1 }, { d: '2026-01-01', r: 2 }, { d: '2026-01-02', r: 3 }], skuMap: [{ k: 'a' }, { k: 'b' }] }, v6: { at: 'T', rows: [['naver', '2026-01-01', 2], ['naver', '2026-01-02', 1], ['skuMap', 'map', 2]] } });
  eq('백업 읽기(새 형식): 줄 경계 그대로', [neu.exact, Object.keys(neu.rows.naver), neu.rows.naver['2026-01-01'].length, neu.rows.skuMap.map.length], [true, ['2026-01-01', '2026-01-02'], 2, 2]);
  const old = C.backupRows({ ARCHIVE: { naver: [{ d: '2026-01-01', r: 1 }, { date: '2026-01-02', r: 3 }, { r: 9 }], skuMap: [{ k: 'a' }], slackConfig: [{ url: 'u' }], skuCost: [{ ver: 'v1', rows: [] }], other: [{ d: '2026-01-01' }] } });
  eq('백업 읽기(옛 형식): 날짜로 묶고 특수 채널은 정해진 이름', [old.exact, Object.keys(old.rows.naver), Object.keys(old.rows.skuMap), Object.keys(old.rows.slackConfig), Object.keys(old.rows.skuCost), old.nokey], [false, ['2026-01-01', '2026-01-02'], ['map'], ['webhook'], ['v1'], { naver: 1 }]);
  eq('백업 읽기: 백업 파일이 아니면 null', C.backupRows({ foo: 1 }), null);
  const d = C.restoreDiff({ naver: { '2026-01-01': [{ a: 1, b: 2 }, { a: 3 }], '2026-01-02': [{ a: 5 }], '2026-01-03': [{ a: 7 }] }, other: { x: [] } },
    { naver: { '2026-01-01': [{ a: 3 }, { b: 2, a: 1 }], '2026-01-02': [{ a: 6 }], '2026-02-01': [{ a: 9 }] } }, { other: 1 });
  eq('비교: 키와 항목 순서가 달라도 같은 값은 같음, 없는 날짜, 다른 날짜, 백업 뒤에 생긴 날짜', d, [{ ch: 'naver', missing: ['2026-01-03'], diff: ['2026-01-02'], same: 1, cloudOnly: 1 }]);
}
// 상품 보기: 날짜 묶음, 몰별, 많이 팔린 날과 대량 주문
{
  eq('묶음: 주는 월~일, 달은 말일에서 끊고 기간 밖은 자른다', [C.trendBuckets('2026-11-12', '2026-11-24', 'week').map(b => b.from + '~' + b.to), C.trendBuckets('2026-01-20', '2026-03-05', 'month').map(b => b.key + ':' + b.to)],
    [['2026-11-12~2026-11-15', '2026-11-16~2026-11-22', '2026-11-23~2026-11-24'], ['2026-01:2026-01-31', '2026-02:2026-02-28', '2026-03:2026-03-05']]);
  const D = C.normalize({ naver: [{ d: '2026-03-10', r: 1, src: 'newSales' }],
    other: [{ d: '2026-03-01', a: 1000, m: '몰A', code: 'A', qty: 1 }, { d: '2026-03-02', a: 40000, m: '몰B', code: 'A', qty: 40 }, { d: '2026-03-02', a: 9000, m: '몰A', code: 'B', qty: 3 }] });
  eq('몰별: 대상 품목만, 몰마다', C.itemOther(D, ['A'], '2026-03-01', '2026-03-31'), { A: { '몰A': { qty: 1, rev: 1000 }, '몰B': { qty: 40, rev: 40000 } } });
  const days = C.itemDays(D, ['A'], '2026-03-01', '2026-03-31').sort((a, b) => b.qty - a.qty);
  eq('많이 팔린 날: 한 줄 30개 이상은 대량', [days[0].d, days[0].qty, days[0].bulk, days[1].bulk], ['2026-03-02', 40, [{ ch: 'other', code: 'A', qty: 40 }], []]);
  const T = C.itemTrend(D, ['A'], '2026-03-01', '2026-03-03', 'day');
  eq('추이: 날짜별 채널 수량', T.rows.A.other.map(x => x.qty), [1, 40, 0]);
}
// 소모품, 비품: 마지막 저장분, 삭제 제외, 창고별 합계
{
  const L = C.supplyList([{ id: 'a', box: 'B박스', name: '테이프', price: 1000, qty: 3, updated: '1' }, { id: 'a', box: 'B박스', name: '테이프', price: 1200, qty: 5, updated: '2' },
    { id: 'b', box: 'A박스', name: '포장지', price: '2,000', qty: 2, updated: '1' }, { id: 'c', box: 'A박스', name: '버린 것', price: 1, qty: 1, del: 1 }, { id: 'd', name: '박스 없음', price: 0, qty: 1 }]);
  eq('비품 목록: 창고 순, 마지막 저장분, 삭제 제외, 숫자 쉼표', L.map(e => [e.box, e.name, e.price, e.qty]), [['(창고 미지정)', '박스 없음', 0, 1], ['A박스', '포장지', 2000, 2], ['B박스', '테이프', 1200, 5]]);
  eq('창고별 합계', C.supplyBoxes(L).map(b => [b.box, b.n, b.qty, b.amount]), [['(창고 미지정)', 1, 1, 0], ['A박스', 1, 2, 4000], ['B박스', 1, 5, 6000]]);
}
console.log(fail ? '실패 ' + fail + '건' : '모든 규칙 통과');
process.exit(fail ? 1 : 0);
