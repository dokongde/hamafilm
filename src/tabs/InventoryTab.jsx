import { useState } from "react";
import { fmtE } from "../lib/utils";
import { EUR_KRW, stockBySku, stockColor, itemRow, inventoryTotals, itemImage } from "../lib/inventory";

// ===== 소품 재고 (관리자) =====
// 상품 마스터(inventory) + 재고 장부(stockMoves). 현재 재고 = 이동 합계.
// 관리자: 원가·마진·재고금액·누적 순익까지. 직원 화면은 StaffView에서 가격·재고만 표시.
const CAT_ORDER = ["키링", "이어폰·홀더", "그립톡", "가방·파우치", "안경", "기타"];
const won = n => "₩" + Math.round(n || 0).toLocaleString("ko-KR");

function InventoryTab({ data, setModal }) {
  const inv = (data.inventory || []).filter(it => it.active !== false);
  const moves = data.stockMoves || [];
  const [cat, setCat] = useState("전체");
  const [onlyLow, setOnlyLow] = useState(false);

  const stock = stockBySku(moves);
  const totals = inventoryTotals(data.inventory, moves);
  const cats = ["전체", ...CAT_ORDER.filter(c => inv.some(it => it.category === c))];

  let list = inv.slice().sort((a, b) =>
    (CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category)) ||
    String(a.sku).localeCompare(String(b.sku))
  );
  if (cat !== "전체") list = list.filter(it => it.category === cat);
  if (onlyLow) list = list.filter(it => (stock[it.sku] || 0) <= 1);

  return (
    <div>
      {/* 요약 */}
      <div className="g3" style={{marginBottom:12}}>
        <div className="chip"><div className="lb">상품 수</div><div className="vl">{totals.skus}</div><div className="sb">품절 {totals.outOfStock}</div></div>
        <div className="chip"><div className="lb">총 재고</div><div className="vl">{totals.units}</div><div className="sb">개</div></div>
        <div className="chip"><div className="lb">재고 원가</div><div className="vl" style={{fontSize:15}}>{won(totals.stockCostKrw)}</div><div className="sb">부대 포함</div></div>
        <div className="chip"><div className="lb">재고 판매가치</div><div className="vl">€{fmtE(totals.stockValueEur)}</div><div className="sb">정가 기준</div></div>
        <div className="chip"><div className="lb">누적 판매</div><div className="vl">{totals.soldUnits}</div><div className="sb">개</div></div>
        <div className="chip" style={{border:"1px solid #2f9e44"}}><div className="lb">누적 순익</div><div className="vl" style={{color:"#2f9e44"}}>€{fmtE(totals.profitEur)}</div><div className="sb">VAT·원가 제외</div></div>
      </div>

      {/* 필터 + 추가 */}
      <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center",marginBottom:10}}>
        {cats.map(c => (
          <button key={c} className={"badge " + (cat === c ? "bp" : "")} style={{cursor:"pointer",border:cat===c?"none":"1px solid #ddd"}} onClick={()=>setCat(c)}>{c}</button>
        ))}
        <label style={{display:"flex",alignItems:"center",gap:4,fontSize:12,color:"#666",marginLeft:4,cursor:"pointer"}}>
          <input type="checkbox" checked={onlyLow} onChange={e=>setOnlyLow(e.target.checked)} style={{width:"auto"}} /> 재고 부족만
        </label>
        <button className="btn bp sm" style={{marginLeft:"auto"}} onClick={()=>setModal({type:"itemEdit"})}>+ 상품 추가</button>
      </div>

      {/* 상품 목록 */}
      {list.map(it => {
        const r = itemRow(it, moves);
        return (
          <div key={it.sku} className="card" style={{marginBottom:8,padding:"10px 12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"flex-start"}}>
              <img src={itemImage(it)} alt="" loading="lazy"
                onError={e => { e.currentTarget.style.visibility = "hidden"; }}
                style={{width:56,height:56,borderRadius:8,objectFit:"cover",flexShrink:0,background:"#f2f2f4"}} />
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:14}}>{it.name_ko}</div>
                <div style={{fontSize:11,color:"#888",marginTop:1}}>
                  <span className="badge" style={{background:"#eef",color:"#4455bb",marginRight:4}}>{it.category}</span>
                  {it.supplier ? it.supplier + " · " : ""}{it.sku}
                  {it.qty_status && it.qty_status !== "총액 일치" ? <span style={{color:"#e8590c"}}> · ⚠️{it.qty_status}</span> : null}
                </div>
                {it.options ? <div style={{fontSize:11,color:"#aaa",marginTop:2}}>{it.options}</div> : null}
              </div>
              <div style={{textAlign:"right",whiteSpace:"nowrap"}}>
                <div style={{fontSize:20,fontWeight:800,color:stockColor(r.stock),lineHeight:1}}>{r.stock}<span style={{fontSize:11,fontWeight:500}}>개</span></div>
                <button className="btn bs sm" style={{marginTop:6,padding:"3px 8px"}} onClick={()=>setModal({type:"stockMove", sku:it.sku})}>입·출고</button>
              </div>
            </div>
            <div style={{display:"flex",gap:14,fontSize:11,color:"#777",marginTop:8,paddingTop:7,borderTop:"1px solid #f0f0f0",flexWrap:"wrap"}}>
              <span>판매가 <b style={{color:"#1a1a1a"}}>€{it.price_eur}</b></span>
              <span>원가 <b>{won(it.landed_krw)}</b></span>
              <span>마진 <b style={{color: it.margin_pct>=60?"#2f9e44":"#e8590c"}}>{it.margin_pct}%</b></span>
              {r.sold > 0 ? <span>판매 <b>{r.sold}</b> · 순익 <b style={{color:"#2f9e44"}}>€{fmtE(r.profitEur)}</b></span> : null}
              <button className="lnk" style={{marginLeft:"auto",background:"none",border:"none",color:"#4dabf7",cursor:"pointer",fontSize:11}} onClick={()=>setModal({type:"itemEdit", edit:it})}>수정</button>
            </div>
          </div>
        );
      })}
      {!list.length ? <div style={{textAlign:"center",color:"#aaa",padding:30}}>상품이 없어요</div> : null}

      <div style={{fontSize:10,color:"#aaa",marginTop:10,lineHeight:1.6}}>
        💡 재고 <span style={{color:"#e03131"}}>빨강=품절</span>, <span style={{color:"#e8590c"}}>주황=1개</span>. 판매하면 "입·출고 → 판매"로 빼주세요.
        SumUp 판매 CSV 자동 차감은 상품 등록 후 샘플이 준비되면 연결됩니다.
      </div>
    </div>
  );
}

export { InventoryTab };
