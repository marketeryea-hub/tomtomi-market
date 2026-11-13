"""v5(index.html)의 파일 읽기 함수를 그대로 복사해 v6/parsers.js를 만든다.
v5 파서를 새로 짜지 않는 이유: 그동안 잡은 예외 처리를 그대로 살리기 위해.
사용: python3 v6/tools/build_parsers.py   (저장소 맨 위 폴더에서)
"""
import re, sys
SRC = 'index.html'
NAMES = ['detectFileType', 'normalizeDate', 'toNum', 'healNaverTotals',
         'skuNorm', 'skuParseOpt', 'skuParseCodes', 'skuIndex', 'skuKeys', 'skuUnmapped', 'orderCheck',
         'parseNewSales', 'parseNewVisit', 'parsePathVisit', 'parseProdVisit', 'parseNaverOrder',
         'parseNaverAdCSV', 'parseNaverAdBoostCSV', 'parseMetaAd', 'parseCoupAdProd', 'parseCoupStock']
s = open(SRC, encoding='utf-8').read()
ver = re.search(r'v5\.\d+', s[s.index('<title>'):s.index('</title>')] if '<title>' in s else s[:2000])
body = ''
for n in NAMES:
    i = s.index('\nfunction ' + n + '(') + 1
    j = s.index('\n}\n', i) + 3
    body += s[i:j] + '\n'
out = '''/* 톰토미 대시보드 v6 — 파일 읽기 (v5 파서 그대로)
 *
 * 이 파일은 v6/tools/build_parsers.py 가 index.html(v5)에서 함수를 그대로 복사해 만든다. 직접 고치지 말 것.
 * v5 파서는 전역 DB 배열을 고치고 markTouched(채널, 날짜)를 부른다.
 * 여기서는 DB 복사본을 넣어 돌린 뒤, 바뀐 (채널, 날짜)만 골라 저장 전 확인에 쓴다.
 */
(function (root) {
  function make(DB) {
    var touched = {}, notes = [];
    var ARCHIVE_CUTOFF_STR = '2020-01-01';
    function markTouched(ch, d) { if (ch && d) touched[ch + '|' + d] = 1; }
    function addStatusChip(f, msg) { notes.push(String(msg)); }
    function showSaveToast(msg) { notes.push(String(msg)); }
    function renderAll() {}
    var XLSX = root.XLSX;
''' + '\n'.join('    ' + l if l else '' for l in body.splitlines()) + '''
    function parseXLSX(wb, type, filename) {
      if (type === 'newSales') return parseNewSales(wb, filename);
      if (type === 'newVisit') return parseNewVisit(wb, filename);
      if (type === 'naverOrder') return parseNaverOrder(wb, filename);
      if (type === 'coupStock') return parseCoupStock(wb);
      if (type === 'coupAdProd') return parseCoupAdProd(wb);
      if (type === 'metaAd') return parseMetaAd(wb);
      return false;
    }
    function parseCSV(text, type) {
      if (type === 'naverAd') return parseNaverAdCSV(text);
      if (type === 'naverAdBoost') return parseNaverAdBoostCSV(text);
      return false;
    }
    return { detect: detectFileType, parseXLSX: parseXLSX, parseCSV: parseCSV, touched: touched, notes: notes };
  }
  root.TTParse = { make: make, SUPPORTED: { newSales: '네이버 판매 (sales_)', newVisit: '네이버 유입 (visit_)', naverOrder: '네이버 주문조회', naverAd: '네이버 SA (yyk CSV)', naverAdBoost: '애드부스트 (result.csv)', metaAd: '메타 (meta_)', coupAdProd: '쿠팡애즈 (custom_report)', coupStock: '쿠팡 입고 (coupang_stocked)' } };
})(window);
'''
open('v6/parsers.js', 'w', encoding='utf-8').write(out)
print('v6/parsers.js', len(out.splitlines()), 'lines')
