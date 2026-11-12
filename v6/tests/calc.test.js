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
}

console.log(fail ? '실패 ' + fail + '건' : '모든 규칙 통과');
process.exit(fail ? 1 : 0);
