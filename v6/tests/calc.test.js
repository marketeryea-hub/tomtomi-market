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

console.log(fail ? '실패 ' + fail + '건' : '모든 규칙 통과');
process.exit(fail ? 1 : 0);
