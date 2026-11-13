/* 톰토미 대시보드 v6 — 파일 읽기 (v5 파서 그대로)
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
    function detectFileType(filename){
      var f=filename.toLowerCase();
      if(filename.indexOf('SKU_매핑')!==-1&&f.indexOf('.xlsx')!==-1) return 'skuMap'; // v5.38 옵션→SKU 매핑표
      // 영문 패턴
      if(f.indexOf('nv_sales')!==-1)        return 'naver';
      if(f.indexOf('nv_product')!==-1)      return 'naverProd';
      // 새 양식 (2026.07~ 네이버 커머스센터)
      if(f.indexOf('sales_')!==-1&&f.indexOf('.xlsx')!==-1) return 'newSales';
      if(f.indexOf('visit_')!==-1&&f.indexOf('.xlsx')!==-1) return 'newVisit';
      if(f.indexOf('query_')!==-1&&f.indexOf('.xlsx')!==-1) return 'naverQuery';
      if(f.indexOf('customer_')!==-1&&f.indexOf('.xlsx')!==-1) return 'naverCustomer';
      if(filename.indexOf('주문조회')!==-1&&f.indexOf('.xlsx')!==-1) return 'naverOrder'; // v5.34 스마트스토어 주문조회(옵션 단위)
      if(f.indexOf('coupang_stocked')!==-1) return 'coupStock';
      if(f.indexOf('custom_report')!==-1)   return 'coupAdProd';
      if(f.indexOf('yyk')!==-1||(f.indexOf('.csv')!==-1&&(f.indexOf('naver')!==-1||f.indexOf('naver')!==-1))) return 'naverAd';
      if(f==='result.csv'||f.indexOf('result')!==-1&&f.indexOf('.csv')!==-1) return 'naverAdBoost';
      if(filename.indexOf('yyk')!==-1) return 'naverAd'; // 쉼표 포함 파일명 대응
      if(f.indexOf('meta_')!==-1)           return 'metaAd';
      if(f.indexOf('esk003e')!==-1)         return 'other';
      // 한글 파일명 패턴
      if(filename.indexOf('판매성과')!==-1)   return 'naver';
      if(filename.indexOf('상품성과')!==-1)   return 'naverProd';
      if(filename.indexOf('쿠팡_입고')!==-1||filename.indexOf('쿠팡입고')!==-1) return 'coupStock';
      if(filename.indexOf('메타')!==-1||filename.indexOf('meta')!==-1) return 'metaAd';
      if(filename.indexOf('네이버sa')!==-1||filename.indexOf('네이버SA')!==-1) return 'naverAd';
      if(filename.indexOf('기타마켓')!==-1)   return 'other';
      if(filename.indexOf('기타채널')!==-1)   return 'other';
      if(filename.indexOf('톰토미_기타')!==-1) return 'other';
      return null;
    }

    function normalizeDate(v){
      if(!v) return '';
      // Date 객체 (cellDates:true 시)
      if(v instanceof Date){
        if(isNaN(v)) return '';
        return v.getFullYear()+'-'+String(v.getMonth()+1).padStart(2,'0')+'-'+String(v.getDate()).padStart(2,'0');
      }
      var s = String(v).trim();
      // 이미 YYYY-MM-DD
      if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
      // 20260323 형식
      if(/^\d{8}$/.test(s)) return s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);
      // 2026.03.23. 형식
      if(/^\d{4}\.\d{2}\.\d{2}/.test(s)) return s.slice(0,4)+'-'+s.slice(5,7)+'-'+s.slice(8,10);
      // 2026/03/23 형식
      if(/^\d{4}\/\d{2}\/\d{2}/.test(s)) return s.slice(0,4)+'-'+s.slice(5,7)+'-'+s.slice(8,10);
      // Timestamp: "2026-03-23 00:00:00"
      if(/^\d{4}-\d{2}-\d{2} /.test(s)) return s.slice(0,10);
      return s.slice(0,10);
    }

    function toNum(v){
      if(v===null||v===undefined||v==='') return 0;
      const n=parseFloat(String(v).replace(/,/g,'').replace(/%/g,''));
      return isNaN(n)?0:n;
    }

    function healNaverTotals(){
      try{
        var byD={};
        (DB.naver||[]).forEach(function(e,i){ if(e&&e.src==='newSales'&&e.d){ (byD[e.d]=byD[e.d]||[]).push(i); } });
        var drop={};
        Object.keys(byD).forEach(function(d){
          var idx=byD[d]; if(idx.length<2) return;
          var seen={};
          idx.forEach(function(i){
            var e=DB.naver[i];
            var k=[e.o,e.r,e.visits,e.refund].join('|');
            if(seen[k]!==undefined){ drop[i]=1; } else seen[k]=i;
          });
          var rest=idx.filter(function(i){ return !drop[i]; });
          if(rest.length<2) return;
          rest.forEach(function(i){
            var x=DB.naver[i];
            var so=0,sr=0,sg=0,sv=0;
            rest.forEach(function(j){ if(j!==i){ var y=DB.naver[j]; so+=y.o||0; sr+=y.r||0; sg+=y.rev_gross||0; sv+=y.visits||0; } });
            if((x.o||0)>so&&(x.r||0)>sr&&(x.rev_gross||0)>sg&&(x.visits||0)>sv) drop[i]=1;
          });
        });
        var n=Object.keys(drop).map(Number).filter(function(i){ return !isNaN(i)&&drop[i]; });
        if(n.length){
          DB.naver=DB.naver.filter(function(e,i){ return !drop[i]; });
          console.log('[v5.13] 기간합계 오기입 행 자동 정리:',n.length,'건');
          if(typeof renderAll==='function'){ try{ renderAll(); }catch(e){} }
          return n.length;
        }
        return 0;
      }catch(err){ console.error('healNaverTotals:',err); return 0; }
    }

    function skuNorm(v){
      v=String(v||'').replace(/\s+/g,'');
      v=v.replace(/^(학산키즈워크북:|학산키즈:)/,'');
      v=v.replace(/^노래하는스티커북-/,'');
      return v;
    }

    function skuParseOpt(opt){
      var out=[]; opt=String(opt||''); if(!opt) return out;
      opt.split(' / ').forEach(function(part){
        var i=part.indexOf(': '), lab=i>=0?part.slice(0,i):'', val=i>=0?part.slice(i+2):part;
        var vals=(lab.indexOf('3종 세트')>=0)?val.split('+'):[val];
        vals.forEach(function(x){ var n=skuNorm(x); if(n&&n!=='선택안함') out.push(n); });
      });
      return out;
    }

    function skuParseCodes(str){
      var out=[];
      String(str||'').split('+').forEach(function(t){
        t=t.trim(); if(!t) return;
        var m=t.match(/^(.*?)\s*\*\s*(\d+)$/);
        if(m) out.push({c:m[1].trim(),q:parseInt(m[2],10)||1}); else out.push({c:t,q:1});
      });
      return out;
    }

    function skuIndex(){
      var idx={}, names={};
      (DB.skuMap||[]).forEach(function(r){
        if(!r||!r.k) return; idx[r.k]=r;
        (r.codes||[]).forEach(function(c,i){ if(r.names&&r.names[i]&&!names[c.c]) names[c.c]=r.names[i]; });
      });
      return {idx:idx,names:names};
    }

    function skuKeys(e){
      var vals=skuParseOpt(e.opt);
      return vals.length? vals.map(function(v){ return e.prodId+'|'+v; }) : [e.prodId+'|(없음)'];
    }

    function skuUnmapped(rows){
      var ix=skuIndex().idx, seen={}, out=[];
      (rows||DB.naverOrder||[]).forEach(function(e){
        if(!e||e.st==='미결제취소') return;
        skuKeys(e).forEach(function(k){
          if(ix[k]) return;
          if(!seen[k]){ seen[k]={k:k,prodId:e.prodId,val:k.split('|').slice(1).join('|'),name:e.name,raw:e.opt||'(옵션 없음)',qty:0,last:''}; out.push(seen[k]); }
          seen[k].qty+=e.qty||0; if(e.d>seen[k].last){ seen[k].last=e.d; seen[k].raw=e.opt||'(옵션 없음)'; if(!e.opt) seen[k].name=e.name; }
        });
      });
      return out.sort(function(a,b){ return b.qty-a.qty; });
    }

    function orderCheck(dates){
      var want=null; // v5.35: 결제일 차이 짝맞춤을 위해 항상 전체 기간으로 계산
      var ord={}, sal={}, salDates={}, nm={};
      (DB.naverOrder||[]).forEach(function(e){
        if(e.st==='미결제취소') return;   // v5.35: 결제 안 된 주문은 판매파일에 없음
        var k=e.d+'|'+e.prodId; ord[k]=(ord[k]||0)+(e.qty||0);
      });
      (DB.naverProd||[]).forEach(function(e){
        var d=e.d||e.date; if(!d||(want&&!want[d])) return;
        salDates[d]=1;
        var pid=String(e.prodId||e.pid||''); if(!pid) return;
        var k=d+'|'+pid; sal[k]=(sal[k]||0)+(e.qty||0); if(e.name) nm[pid]=e.name;
      });
      (DB.naverOrder||[]).forEach(function(e){ if(!nm[e.prodId]&&e.name&&!e.opt) nm[e.prodId]=e.name; });
      var diff=[], noSales={}, keys={};
      Object.keys(ord).forEach(function(k){keys[k]=1;}); Object.keys(sal).forEach(function(k){keys[k]=1;});
      var ordDates={}; (DB.naverOrder||[]).forEach(function(e){ ordDates[e.d]=1; });
      Object.keys(keys).forEach(function(k){
        var d=k.split('|')[0], pid=k.split('|')[1];
        if(!ordDates[d]) return;                    // 주문 파일이 없는 날은 비교 대상 아님
        if(!salDates[d]){ noSales[d]=1; return; }   // 판매 파일이 없는 날
        var a=sal[k]||0, b=ord[k]||0;
        if(a!==b) diff.push({d:d,prodId:pid,name:nm[pid]||'',sales:a,order:b,gap:b-a});
      });
      diff.sort(function(x,y){return x.d<y.d?-1:x.d>y.d?1:0;});
      // v5.35: 주문일과 결제일이 다른 주문(늦은 밤 주문, 무통장입금) — 같은 상품에서 주문파일 +N 뒤 7일 안에 판매파일 +N이 있으면 짝으로 인정
      var shifted=0, SHIFT_DAYS=7;
      function dayGap(a,b){ return Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000); }
      for(var i=0;i<diff.length;i++){
        var x=diff[i]; if(x.gap<=0) continue;
        for(var j=i+1;j<diff.length&&x.gap>0;j++){
          var y=diff[j]; if(y.prodId!==x.prodId||y.gap>=0) continue;
          if(dayGap(x.d,y.d)>SHIFT_DAYS) break;
          var m=Math.min(x.gap,-y.gap); x.gap-=m; y.gap+=m; shifted+=m;
        }
      }
      var real=diff.filter(function(e){ return e.gap!==0; });
      if(dates&&dates.length){ var w={}; dates.forEach(function(d){w[d]=1;}); real=real.filter(function(e){ return w[e.d]; }); }
      return {diff:real, noSales:Object.keys(noSales).length, shifted:shifted};
    }

    function parseNewSales(wb, filename){
      var rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:'',raw:true});
      if(rows.length<2) return false;
      var hdr=rows[0].map(function(v){return String(v||'').trim();});
      // 컬럼 인덱스 찾기
      var iDate=hdr.indexOf('날짜');
      var iName=hdr.indexOf('채널상품명');
      var iId=hdr.indexOf('채널상품번호');
      var iOrders=hdr.indexOf('상품결제건수');
      var iRefCnt=hdr.indexOf('환불건수');
      var iRevGross=hdr.indexOf('판매금액(총)');
      var iRevNet=hdr.indexOf('판매금액(순)');
      var iRefund=hdr.indexOf('환불금액');
      var iQty=hdr.indexOf('결제상품수량');
      var iRefQty=hdr.indexOf('환불상품수량');
      var iVisits=hdr.indexOf('방문수');
      var iCvr=hdr.indexOf('구매전환율');
      var iShip=hdr.indexOf('배송비');
      var iDiscount=hdr.indexOf('전체 할인액');
      var iSellerDisc=hdr.indexOf('판매자 부담 상품할인액');
      var iSellerOrdDisc=hdr.indexOf('판매자 부담 주문할인액');
      if(iDate<0||iName<0) return false;

      var touchedNaver={}, touchedProd={};
      var naverEntries=[], prodEntries=[];

      for(var i=1;i<rows.length;i++){
        var r=rows[i];
        var rawDate=String(r[iDate]==null?'':r[iDate]);
        if(/[~〜–—]/.test(rawDate)) continue; // v5.13: 기간 합계행(예: 2026-09-22~2026-09-27) 스킵 — 시작일 매출로 오합산되던 버그
        var ds=normalizeDate(r[iDate]);
        if(!ds) continue;
        var name=String(r[iName]||'');
        if(/^\d+(\.\d+)?$/.test(name.trim())){ console.warn('[검사] 상품명이 숫자뿐인 행 제외:',ds,name); continue; }
        var isTotal=(name==='전체');

        if(isTotal){
          // "전체" 행 → DB.naver (일매출)
          touchedNaver[ds]=true;
          var orders=toNum(r[iOrders]);
          var revNet=toNum(r[iRevNet]);
          // 요일 자동 계산
          var dayNames=['일','월','화','수','목','금','토'];
          var dow=dayNames[new Date(ds+'T00:00:00').getDay()]||'';
          naverEntries.push({
            d:ds,
            dow:dow,
            time:'',
            buyer:orders,  // 결제자수 미제공 → 결제건수로 대체
            o:orders,
            r:revNet,  // 판매금액(순) = 이미 환불 차감됨
            rev_gross:toNum(r[iRevGross]),
            unit_rev:orders>0?Math.round(revNet/orders):0,
            refund_cnt:toNum(r[iRefCnt]),
            refund:toNum(r[iRefund]),
            qty:toNum(r[iQty]),
            refund_qty:toNum(r[iRefQty]),
            visits:toNum(r[iVisits]),
            cvr:toNum(r[iCvr]),
            ship:toNum(r[iShip]),
            coupon:toNum(r[iDiscount]),
            prod_coupon:toNum(r[iSellerDisc]),
            order_coupon:toNum(r[iSellerOrdDisc]),
            isArchive:false,
            src:'newSales'
          });
        } else {
          // 상품 행 → DB.naverProd (상품성과)
          touchedProd[ds]=true;
          var pid=String(r[iId]||'');
          prodEntries.push({
            d:ds, date:ds,
            name:name.replace(/\[.*?\]/g,'').trim(),
            prodId:pid,
            o:toNum(r[iOrders]),
            qty:toNum(r[iQty]),
            rev:toNum(r[iRevNet]),
            visits:toNum(r[iVisits]),
            cvr:toNum(r[iCvr]),
            isArchive:false,
            src:'newSales'
          });
        }
      }

      // 기존 날짜 데이터 제거 후 추가 (덮어쓰기)
      DB.naver = DB.naver.filter(function(e){ return !touchedNaver[e.d]; });
      DB.naverProd = DB.naverProd.filter(function(e){ return !touchedProd[e.d||e.date]; });
      if(naverEntries.length>0){
        DB.naver.push.apply(DB.naver, naverEntries);
        naverEntries.forEach(function(e){ markTouched('naver',e.d); });
      }
      if(prodEntries.length>0){
        DB.naverProd.push.apply(DB.naverProd, prodEntries);
        prodEntries.forEach(function(e){ markTouched('naverProd',e.d); });
      }
      healNaverTotals();
      return naverEntries.length>0 || prodEntries.length>0;
    }

    function parseNewVisit(wb, filename){
      var rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:'',raw:true});
      if(rows.length<2) return false;
      var hdr=rows[0].map(function(v){return String(v||'').trim();});

      // 컬럼으로 구분: '경로(1단계)' 있으면 경로별, '브랜드' 있으면 상품별
      if(hdr.indexOf('경로(1단계)')>=0) return parsePathVisit(rows, hdr);
      if(hdr.indexOf('채널상품명')>=0)  return parseProdVisit(rows, hdr);
      return false;
    }

    function parsePathVisit(rows, hdr){
      var iDate=hdr.indexOf('날짜');
      var iP1=hdr.indexOf('경로(1단계)');
      var iP2=hdr.indexOf('경로(2단계)');
      var iP3=hdr.indexOf('경로(3단계)');
      var iVisits=hdr.indexOf('방문수');
      var iOrders=hdr.indexOf('상품결제건수');
      var iCvr=hdr.indexOf('구매전환율');
      var iRev=hdr.indexOf('판매금액(총)');
      if(iDate<0||iP1<0) return false;

      var touched={}, entries=[];
      for(var i=1;i<rows.length;i++){
        var r=rows[i];
        var ds=normalizeDate(r[iDate]);
        if(!ds) continue;
        var p1=String(r[iP1]||'');
        if(p1==='전체') continue; // 합계행 스킵
        touched[ds]=true;
        entries.push({
          d:ds, path1:p1, path2:String(r[iP2]||''), path3:String(r[iP3]||''),
          visits:toNum(r[iVisits]), orders:toNum(r[iOrders]),
          cvr:toNum(r[iCvr]), rev:toNum(r[iRev])
        });
      }
      DB.naverVisit = DB.naverVisit.filter(function(e){ return !touched[e.d]; });
      if(entries.length>0){
        DB.naverVisit.push.apply(DB.naverVisit, entries);
        entries.forEach(function(e){ markTouched('naverVisit',e.d); });
      }
      return entries.length>0;
    }

    function parseProdVisit(rows, hdr){
      var iDate=hdr.indexOf('날짜');
      var iName=hdr.indexOf('채널상품명');
      var iId=hdr.indexOf('채널상품번호');
      var iCat1=hdr.indexOf('대 카테고리');
      var iCat2=hdr.indexOf('중 카테고리');
      var iCat3=hdr.indexOf('소 카테고리');
      var iCat4=hdr.indexOf('세부 카테고리');
      var iBrand=hdr.indexOf('브랜드');
      var iChannel=hdr.indexOf('채널');
      var iVisits=hdr.indexOf('방문수');
      var iOrders=hdr.indexOf('상품결제건수');
      var iCvr=hdr.indexOf('구매전환율');
      var iRev=hdr.indexOf('판매금액(총)');
      if(iDate<0||iName<0) return false;

      var touched={}, entries=[];
      for(var i=1;i<rows.length;i++){
        var r=rows[i];
        var ds=normalizeDate(r[iDate]);
        if(!ds) continue;
        var name=String(r[iName]||'');
        if(name==='전체') continue;
        touched[ds]=true;
        entries.push({
          d:ds, name:name.replace(/\[.*?\]/g,'').trim(),
          prodId:String(r[iId]||''),
          cat1:iCat1>=0?String(r[iCat1]||''):'',
          cat2:iCat2>=0?String(r[iCat2]||''):'',
          cat3:iCat3>=0?String(r[iCat3]||''):'',
          cat4:iCat4>=0?String(r[iCat4]||''):'',
          brand:iBrand>=0?String(r[iBrand]||''):'',
          channel:iChannel>=0?String(r[iChannel]||''):'',
          visits:toNum(r[iVisits]), orders:toNum(r[iOrders]),
          cvr:toNum(r[iCvr]), rev:toNum(r[iRev])
        });
      }
      DB.naverProdVisit = DB.naverProdVisit.filter(function(e){ return !touched[e.d]; });
      if(entries.length>0){
        DB.naverProdVisit.push.apply(DB.naverProdVisit, entries);
        entries.forEach(function(e){ markTouched('naverProdVisit',e.d); });
      }
      return entries.length>0;
    }

    function parseNaverOrder(wb, filename){
      var sname=wb.SheetNames.find(function(n){return n==='주문조회';})||wb.SheetNames[0];
      var rows=XLSX.utils.sheet_to_json(wb.Sheets[sname],{header:1,defval:'',raw:false});
      if(rows.length<2) return false;
      // 헤더 행 찾기 (안내문 행이 위에 있을 수 있음)
      var hi=-1;
      for(var h=0;h<Math.min(rows.length,6);h++){
        var cells=rows[h].map(function(v){return String(v||'').trim();});
        if(cells.indexOf('상품주문번호')>=0&&cells.indexOf('옵션정보')>=0){ hi=h; break; }
      }
      if(hi<0) return false;
      var hdr=rows[hi].map(function(v){return String(v||'').trim();});
      // 발주/발송관리 파일은 '발송한 주문'만 있어 날짜 통째 교체 시 데이터가 빠짐 → 거부
      if(hdr.indexOf('발송처리일')>=0||hdr.indexOf('송장출력일')>=0){ console.warn('[주문조회] 발주/발송관리 양식은 지원하지 않음'); return false; }
      var iOid=hdr.indexOf('상품주문번호'), iDt=hdr.indexOf('주문일시'), iSt=hdr.indexOf('주문상태'),
          iClaim=hdr.indexOf('클레임상태'), iPid=hdr.indexOf('상품번호'), iName=hdr.indexOf('상품명'),
          iOpt=hdr.indexOf('옵션정보'), iQty=hdr.indexOf('수량');
      if(iOid<0||iDt<0||iPid<0||iQty<0) return false;
      var touched={}, entries=[], seen={};
      for(var i=hi+1;i<rows.length;i++){
        var r=rows[i];
        var oid=String(r[iOid]||'').trim();
        var ds=normalizeDate(r[iDt]);
        if(!oid||!/^\d{4}-\d{2}-\d{2}$/.test(ds)) continue;
        // v5.36: 파일 안 중복 제거를 하지 않음 — 부분취소가 여러 번 나뉘면 내용이 완전히 같은 줄도 각각 실제 주문행임 (재업로드 중복은 날짜 통째 교체로 방지)
        touched[ds]=true;
        entries.push({
          d:ds, oid:oid,
          prodId:String(r[iPid]||'').trim(),
          name:String(iName>=0?r[iName]:'').trim(),
          opt:String(iOpt>=0?r[iOpt]:'').trim(),
          qty:toNum(r[iQty]),
          st:String(iSt>=0?r[iSt]:'').trim(),
          claim:String(iClaim>=0?r[iClaim]:'').trim(),
          src:'order'
        });
      }
      if(!entries.length) return false;
      DB.naverOrder=(DB.naverOrder||[]).filter(function(e){ return !touched[e.d]; });
      DB.naverOrder.push.apply(DB.naverOrder,entries);
      Object.keys(touched).forEach(function(d){ markTouched('naverOrder',d); });
      // 판매 파일(sales_)과 수량 대조
      var chk=orderCheck(Object.keys(touched));
      var nOpt={}; entries.forEach(function(e){ if(e.opt) nOpt[e.prodId+'|'+e.opt]=1; });
      var msg=chk.diff.length
        ? '⚠️ '+entries.length+'건 / 대조 불일치 '+chk.diff.length+'건'
        : '✅ '+entries.length+'건 / 대조 일치'+(chk.shifted?' (결제일 차이 '+chk.shifted+'건 인정)':'')+(chk.noSales?' (판매파일 없는 날 '+chk.noSales+'일)':'');
      try{ if((DB.skuMap||[]).length){ var um=skuUnmapped(entries); if(um.length) msg+=' / 매핑 안 된 옵션 '+um.length+'종'; } }catch(e){}
      try{ addStatusChip(filename, msg, chk.diff.length?'var(--red)':'var(--green)'); }catch(e){}
      console.log('[주문조회] '+entries.length+'건, '+Object.keys(touched).length+'일, 옵션 '+Object.keys(nOpt).length+'종', chk);
      return true;
    }

    function parseNaverAdCSV(text){
      var BOM='﻿';
      var clean=text.startsWith(BOM)?text.slice(1):text;
      var rawLines=clean.split('\n').filter(function(l){return l.trim();});
      if(rawLines.length<3) return false;
      function splitCSV(line){
        var res=[],cur='',inQ=false;
        for(var c of line){
          if(c==='"'){inQ=!inQ;continue;}
          if(c===','&&!inQ){res.push(cur.trim());cur='';continue;}
          cur+=c;
        }
        res.push(cur.trim());
        return res;
      }
      var hdr=splitCSV(rawLines[1]);
      var iDate=-1,iCost=-1,iRev=-1,iClicks=-1,iImp=-1,iConv=-1,iCtr=-1,iCamp=-1,iCampType=-1;
      hdr.forEach(function(c,i){
        if(c==='캠페인'&&iCamp<0) iCamp=i;
        if(c==='캠페인유형'&&iCampType<0) iCampType=i;
        if(c.includes('총비용')&&iCost<0) iCost=i;
        if(c.includes('일별')) iDate=i;
        if(c.includes('역비용')&&iCost<0) iCost=i;
        if(c.includes('전환매출액')&&iRev<0) iRev=i;
        if(c.includes('클릭수')&&iClicks<0) iClicks=i;
        if(c.includes('노출수')&&iImp<0) iImp=i;
        if(c.includes('전환수')&&iConv<0) iConv=i;
        if(c.includes('클릭률')&&iCtr<0) iCtr=i;
      });
      if(iDate<0)iDate=2; if(iCost<0)iCost=7; if(iRev<0)iRev=10;
      // 이 파일에서 나올 날짜 미리 수집
      var touchedNA = {};
      for(var ri=2;ri<rawLines.length;ri++){
        var r0=splitCSV(rawLines[ri]);
        if(r0.length<3) continue;
        var ds0=normalizeDate(r0[iDate]);
        if(ds0&&ds0>=ARCHIVE_CUTOFF_STR) touchedNA[ds0]=true;
      }
      // 파싱 전 해당 날짜 기존 데이터 제거
      DB.naverAd = DB.naverAd.filter(function(e){ return !touchedNA[e.d]; });
      DB.naverAdRaw = DB.naverAdRaw.filter(function(e){ return !touchedNA[e.d]; });
      var dayMap={};
      for(var i=2;i<rawLines.length;i++){
        var r=splitCSV(rawLines[i]);
        if(r.length<3) continue;
        var ds=normalizeDate(r[iDate]);
        if(!ds||ds<ARCHIVE_CUTOFF_STR) continue;
        DB.naverAdRaw.push({
          d:ds, campaign_type:String(r[iCampType<0?0:iCampType]||''), campaign:String(r[iCamp<0?1:iCamp]||''),
          imp:toNum(r[iImp]), clicks:toNum(r[iClicks]), ctr:toNum(r[iCtr<0?5:iCtr]),
          avg_cpc:toNum(r[6]), cost:toNum(r[iCost]), conv:toNum(r[iConv<0?8:iConv]),
          conv_rate:toNum(r[9]), rev:toNum(r[iRev]), cost_per_conv:toNum(r[11]), roas:toNum(r[12])
        });
        var cost=toNum(r[iCost]),rev=iRev<r.length?toNum(r[iRev]):0;
        if(!cost&&!rev) continue;
        if(!dayMap[ds]) dayMap[ds]={d:ds,cost:0,rev:0,clicks:0,imp:0,conv:0,ctr:0,isArchive:false};
        dayMap[ds].cost+=cost;
        dayMap[ds].rev+=rev;
        if(iClicks>=0) dayMap[ds].clicks+=toNum(r[iClicks]);
        if(iImp>=0)    dayMap[ds].imp+=toNum(r[iImp]);
        if(iConv>=0)   dayMap[ds].conv+=toNum(r[iConv]);
      }
      var entries=Object.values(dayMap);
      entries.forEach(function(e){
        e.ctr=e.imp>0?parseFloat((e.clicks/e.imp*100).toFixed(4)):(iCtr>=0?0:0);
      });
      if(entries.length>0){DB.naverAd.push.apply(DB.naverAd,entries);entries.forEach(function(e){markTouched('naverAd',e.d);});return true;}
      if(Object.keys(touchedNA).length>0){ Object.keys(touchedNA).forEach(function(d){markTouched('naverAd',d);}); return true; }
      return false;
    }

    function parseNaverAdBoostCSV(text){
      var lines=text.split(/\r?\n/).filter(function(l){return l.trim();});
      if(lines.length<2) return false;
      function splitCSV(line){
        var res=[],cur='',inQ=false;
        for(var c of line){
          if(c==='"'){inQ=!inQ;continue;}
          if(c===','&&!inQ){res.push(cur.trim());cur='';continue;}
          cur+=c;
        }
        res.push(cur.trim());
        return res;
      }
      var hdr=splitCSV(lines[0]);
      var iDate=-1,iCost=-1,iImp=-1,iClicks=-1,iCtr=-1,iConv=-1,iRoas=-1,iName=-1,iCamp=-1;
      hdr.forEach(function(c,i){
        if(c==='기간') iDate=i;
        else if(c==='총비용') iCost=i;
        else if(c==='노출수') iImp=i;
        else if(c==='클릭수') iClicks=i;
        else if(c==='클릭률(%)') iCtr=i;
        else if(c==='결과') iConv=i;
        else if(c==='총 광고수익률(%)') iRoas=i;
        else if(c==='상품명') iName=i;
        else if(c==='캠페인 이름') iCamp=i;
      });
      if(iDate<0||iCost<0) return false;

      // 이 파일에서 나올 날짜 미리 수집
      var touched={};
      for(var ri=1;ri<lines.length;ri++){
        var cols0=splitCSV(lines[ri]);
        if(cols0.length<3) continue;
        var ds0=normalizeDate(cols0[iDate]);
        if(ds0) touched[ds0]=true;
      }
      // 기존 해당 날짜 데이터 제거 (덮어쓰기)
      DB.naverAdBoost = DB.naverAdBoost.filter(function(e){ return !touched[e.d]; });

      var dayMap={};
      for(var i=1;i<lines.length;i++){
        var cols=splitCSV(lines[i]);
        if(cols.length<3) continue;
        var ds=normalizeDate(cols[iDate]);
        if(!ds) continue;
        var cost=toNum(cols[iCost]);
        if(!dayMap[ds]) dayMap[ds]={d:ds,cost:0,imp:0,clicks:0,conv:0,ctr:0,roas:0,isArchive:false};
        dayMap[ds].cost+=cost;
        if(iImp>=0) dayMap[ds].imp+=toNum(cols[iImp]);
        if(iClicks>=0) dayMap[ds].clicks+=toNum(cols[iClicks]);
        if(iConv>=0) dayMap[ds].conv+=toNum(cols[iConv]);
      }
      var entries=Object.values(dayMap);
      entries.forEach(function(e){
        e.ctr=e.imp>0?parseFloat((e.clicks/e.imp*100).toFixed(2)):0;
      });
      if(entries.length>0){
        DB.naverAdBoost.push.apply(DB.naverAdBoost, entries);
        entries.forEach(function(e){ markTouched('naverAdBoost',e.d); });
        return true;
      }
      return false;
    }

    function parseMetaAd(wb){
      var sname=wb.SheetNames.find(function(n){return n.includes('Raw Data');})||wb.SheetNames[0];
      var rows=XLSX.utils.sheet_to_json(wb.Sheets[sname],{header:1,defval:'',raw:false});
      if(rows.length<2) return false;
      var hdr=rows[0].map(function(v){return String(v||'').trim();});
      var iDate=0,iSet=1,iReach=3,iImp=4,iClicks=5,iCtr=6,iResType=7,iResCost=8,
          iCost=9,iCpc=10,iResult=11,iQuality=12,iEngage=13,iConv=14,iInsta=15,iStart=16,iEnd=17;
      var setFound=false;
      hdr.forEach(function(c,i){
        if((c==='일'||c==='날짜')&&i<3) iDate=i;
        if(c.indexOf('광고 세트')!==-1&&!setFound){iSet=i;setFound=true;} // 중복 컬럼 중 첫번째만
        if(c==='도달') iReach=i;
        if(c==='노출') iImp=i;
        if(c==='클릭(전체)') iClicks=i;
        if(c==='CTR(전체)') iCtr=i;
        if(c==='결과 유형') iResType=i;
        if(c==='결과당 비용') iResCost=i;
        if(c.indexOf('지출 금액')!==-1) iCost=i;
        if(c==='CPC(전체)') iCpc=i;
        if(c==='결과') iResult=i;
        if(c==='품질 순위') iQuality=i;
        if(c==='참여율 순위') iEngage=i;
        if(c==='전환율 순위') iConv=i;
        if(c.indexOf('Instagram')!==-1) iInsta=i;
        if(c==='보고 시작') iStart=i;
        if(c==='보고 종료') iEnd=i;
      });
      // 이 파일에서 나올 날짜 미리 수집
      var touchedMeta = {};
      for(var ri=1;ri<rows.length;ri++){
        var ds0=normalizeDate(rows[ri][iDate]);
        if(ds0&&ds0>=ARCHIVE_CUTOFF_STR) touchedMeta[ds0]=true;
      }
      // 파싱 전 해당 날짜 기존 데이터 제거
      DB.metaAd = DB.metaAd.filter(function(e){ return !touchedMeta[e.d]; });
      DB.metaAdRaw = DB.metaAdRaw.filter(function(e){ return !touchedMeta[e.d]; });
      var dayMap={};
      for(var i=1;i<rows.length;i++){
        var r=rows[i];
        var ds=normalizeDate(r[iDate]);
        if(!ds||ds<ARCHIVE_CUTOFF_STR) continue;
        var cost=toNum(r[iCost]);
        if(!cost) continue;
        DB.metaAdRaw.push({
          d:ds, setName:String(r[iSet]||''),
          reach:toNum(r[iReach]), imp:toNum(r[iImp]), clicks:toNum(r[iClicks]),
          ctr:toNum(r[iCtr]), resType:String(r[iResType]||''), resCost:toNum(r[iResCost]),
          cost:cost, cpc:toNum(r[iCpc]), result:toNum(r[iResult]),
          quality:String(r[iQuality]||''), engage:String(r[iEngage]||''),
          conv:String(r[iConv]||''), insta:toNum(r[iInsta]),
          start:String(r[iStart]||''), end:String(r[iEnd]||'')
        });
        if(!dayMap[ds]) dayMap[ds]={
          d:ds, setName:'', resType:'', resCost:0,
          cost:0, cpc:0, result:0, quality:'', engage:'', conv:'',
          insta:0, reach:0, imp:0, clicks:0, ctr:0, isArchive:false
        };
        var e=dayMap[ds];
        if(!e.setName&&r[iSet]) e.setName=String(r[iSet]||'');
        if(!e.resType&&r[iResType]) e.resType=String(r[iResType]||'');
        e.cost   +=cost;
        e.reach  +=toNum(r[iReach]);
        e.imp    +=toNum(r[iImp]);
        e.clicks +=toNum(r[iClicks]);
        var res=r[iResult];
        try{ e.result+=isNaN(res)?0:parseFloat(res)||0; }catch(err){}
        e.insta  +=toNum(r[iInsta]);
        if(!e.quality&&r[iQuality]) e.quality=String(r[iQuality]||'');
        if(!e.engage&&r[iEngage])   e.engage=String(r[iEngage]||'');
        if(!e.conv&&r[iConv])       e.conv=String(r[iConv]||'');
      }
      var entries=Object.values(dayMap);
      entries.forEach(function(e){
        e.ctr=e.imp>0?parseFloat((e.clicks/e.imp*100).toFixed(4)):0;
        e.result=Math.round(e.result);
      });
      if(entries.length>0){DB.metaAd.push.apply(DB.metaAd,entries);entries.forEach(function(e){markTouched('metaAd',e.d);});return true;}
      if(Object.keys(touchedMeta).length>0){ Object.keys(touchedMeta).forEach(function(d){markTouched('metaAd',d);}); return true; }
      return false;
    }

    function parseCoupAdProd(wb){
      var rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:'',raw:false});
      if(rows.length<2) return false;
      var hdr=rows[0].map(function(v){return String(v||'').trim();});
      var iDate=-1,iCost=-1,iRev=-1,iClicks=-1,iImp=-1,iConv=-1;
      hdr.forEach(function(c,i){
        if(c==='날짜') iDate=i;
        if(c.includes('광고비')&&iCost<0) iCost=i;
        if(c.includes('전환 매출액')&&iRev<0) iRev=i;
        if(c==='클릭수'&&iClicks<0) iClicks=i;
        if(c==='노출수'&&iImp<0) iImp=i;
        if(c.includes('주문수')&&iConv<0) iConv=i;
      });
      if(iDate<0)iDate=0; if(iCost<0)iCost=10; if(iRev<0)iRev=12;
      // 이 파일에서 나올 날짜 미리 수집
      var touchedCA = {};
      for(var ri=1;ri<rows.length;ri++){
        var ds0=normalizeDate(rows[ri][iDate]);
        if(ds0&&ds0>=ARCHIVE_CUTOFF_STR) touchedCA[ds0]=true;
      }
      // 파싱 전에 해당 날짜의 기존 DB 데이터 제거 (덮어쓰기)
      DB.coupAd = DB.coupAd.filter(function(e){ return !touchedCA[e.d]; });
      DB.coupAdRaw = DB.coupAdRaw.filter(function(e){ return !touchedCA[e.d]; });
      var dayMap2={};
      for(var i=1;i<rows.length;i++){
        var r=rows[i];
        var ds=normalizeDate(r[iDate]);
        if(!ds||ds<ARCHIVE_CUTOFF_STR) continue;
        var cost=toNum(r[iCost]),rev=toNum(r[iRev]);
        if(!cost&&!rev) continue;
        DB.coupAdRaw.push({
          d:ds, campaign:String(r[1]||''), goal:String(r[2]||''),
          group:String(r[3]||''), prod:String(r[4]||''), conv_prod:String(r[5]||''),
          billing:String(r[6]||''), imp:toNum(r[7]), clicks:toNum(r[8]),
          ctr:toNum(r[9]), cost:cost, conv:toNum(r[11]), rev:toNum(r[iRev]),
          roas:toNum(r[13]), qty:toNum(r[14])
        });
        if(!dayMap2[ds]) dayMap2[ds]={d:ds,cost:0,rev:0,clicks:0,imp:0,conv:0,isArchive:false};
        dayMap2[ds].cost+=cost;
        dayMap2[ds].rev+=rev;
        if(iClicks>=0) dayMap2[ds].clicks+=toNum(r[iClicks]);
        if(iImp>=0)    dayMap2[ds].imp+=toNum(r[iImp]);
        if(iConv>=0)   dayMap2[ds].conv+=toNum(r[iConv]);
      }
      var entries=Object.values(dayMap2);
      if(entries.length>0){DB.coupAd.push.apply(DB.coupAd,entries);entries.forEach(function(e){markTouched('coupAd',e.d);});return true;}
      if(Object.keys(touchedCA).length>0){ Object.keys(touchedCA).forEach(function(d){markTouched('coupAd',d);}); return true; }
      return false;
    }

    function parseCoupStock(wb){
      var sname=wb.SheetNames.find(function(n){return n==='data';})||wb.SheetNames[0];
      var rows=XLSX.utils.sheet_to_json(wb.Sheets[sname],{header:1,defval:'',cellDates:true,raw:false});
      if(rows.length<2) return false;
      var hdr=rows[0].map(String);
      // 실제 파일: 구분(0), 번호(1), SKU번호(2), SKU명(3), 입고/반출시각(4), 물류센터(5), 세금타입(6), 수량(7), 단가(8), 공급가액(9), 세액(10), 총단가(11), 총공급가액(12), 총세액(13), 계산서번호(14), 지급일(15)
      var iDiv=0,iNo=1,iSkuNo=2,iSku=3,iDate=4,iWh=5,iTax=6,iQty=7,iUnit=8,
          iSupply=9,iTaxAmt=10,iTotalUnit=11,iAmt=12,iTotalTax=13,iInvoice=14,iPay=15;
      hdr.forEach(function(h,i){
        if(h==='구분') iDiv=i;
        if(h==='번호') iNo=i;
        if(h==='SKU번호') iSkuNo=i;
        if(h.indexOf('SKU')!==-1&&h.indexOf('명')!==-1) iSku=i;
        if(h.indexOf('입고')!==-1||h.indexOf('반출')!==-1) iDate=i;
        if(h.indexOf('물류')!==-1) iWh=i;
        if(h==='세금타입'||h.indexOf('세금')!==-1) iTax=i;
        if(h==='수량') iQty=i;
        if(h==='단가') iUnit=i;
        if(h==='공급가액') iSupply=i;
        if(h==='세액') iTaxAmt=i;
        if(h==='총단가') iTotalUnit=i;
        if(h==='총공급가액') iAmt=i;
        if(h==='총세액') iTotalTax=i;
        if(h==='계산서번호') iInvoice=i;
        if(h.indexOf('지급일')!==-1) iPay=i;
      });
      var entries=[];
      for(var i=1;i<rows.length;i++){
        var r=rows[i];
        var sku=String(r[iSku]||'');
        if(sku.indexOf('톰토미')===-1 && sku.indexOf('다다 NEW 봉제인형')===-1 && sku.indexOf('루나 NEW 봉제인형')===-1) continue;
        var ds=normalizeDate(r[iDate]);
        if(!ds) continue;
        if(ds<ARCHIVE_CUTOFF_STR) continue;
        // 중복 방지: 발주번호+SKU번호 기준 (날짜 무관, 계산서 업데이트 대응)
        var dupKey=String(r[iNo]||'')+'|'+String(r[iSkuNo]||'');
        var existIdx=DB.coupStock.findIndex(function(e){return (e.no+'|'+e.skuNo)===dupKey;});
        if(existIdx>=0){
          // 계산서번호가 업데이트됐으면 덮어쓰기
          var inv=String(r[iInvoice]||'');
          if(inv&&inv!=='-'&&(!DB.coupStock[existIdx].invoice||DB.coupStock[existIdx].invoice==='-')){
            DB.coupStock[existIdx].invoice=inv;
            DB.coupStock[existIdx].pay=normalizeDate(r[iPay]);
          }
          continue;
        }
        entries.push({
          d:ds, div:String(r[iDiv]||''), no:String(r[iNo]||''),
          skuNo:String(r[iSkuNo]||''), sku:sku.replace(/[\[\]]/g,'').trim(),
          wh:String(r[iWh]||''), tax:String(r[iTax]||''),
          qty:toNum(r[iQty]), unit:toNum(r[iUnit]), supply:toNum(r[iSupply]),
          taxAmt:toNum(r[iTaxAmt]), totalUnit:toNum(r[iTotalUnit]),
          a:toNum(r[iAmt]), totalTax:toNum(r[iTotalTax]),
          invoice:String(r[iInvoice]||''), pay:normalizeDate(r[iPay]),
          isArchive:false
        });
      }
      if(entries.length>0){DB.coupStock.push.apply(DB.coupStock,entries);entries.forEach(function(e){markTouched('coupStock',e.d);});}
      return entries.length>0;
    }

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
