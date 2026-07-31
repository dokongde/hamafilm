import { useState } from "react";
import { curYM, fmtE, fmt, nid } from "../lib/utils";
import { attributeGap } from "../lib/recon";

function SalesTab({ data, persist, setModal }) {
  const [salesYM, setSalesYM] = useState(curYM()); // 월별 필터
  const [editingSk, setEditingSk] = useState(null); // 슈킹 빠른 편집 {date, value}

  // 해당 월만 필터
  let sales = [...(data.sales||[])]
    .filter(s => s.date.startsWith(salesYM))
    .sort((a, b) => b.date.localeCompare(a.date));

  const T = {pc:0,pk:0,mc:0,mk:0,ac:0,ak:0,nc:0,nk:0,jc:0,jk:0,sk:0};
  sales.forEach(r => Object.keys(T).forEach(k => { T[k] += (r[k]||0); }));
  const tot = Object.values(T).reduce((a, b) => a + b, 0);
  const rT = r => (r.pc||0)+(r.pk||0)+(r.mc||0)+(r.mk||0)+(r.ac||0)+(r.ak||0)+(r.nc||0)+(r.nk||0)+(r.jc||0)+(r.jk||0)+(r.sk||0);
  const cell = v => v ? <span>{fmt(v)}</span> : <span style={{color:"#bbb"}}>-</span>;

  // 누락 (파생값, 읽기전용): 비인정 직원만의 사진구멍 = 매출 아님
  const gapByDate = {};
  sales.forEach(r => { gapByDate[r.date] = attributeGap(data, r); });
  const nurakT = Math.round(sales.reduce((a, r) => a + (gapByDate[r.date]?.nurak || 0), 0) * 100) / 100;

  // 슈킹 빠른 입력 저장
  const saveSkuking = async (date, value) => {
    const amt = parseFloat(value) || 0;
    let newSales = [...(data.sales||[])];
    const existing = newSales.find(s => s.date === date);
    if (existing) {
      newSales = newSales.map(s => s.date === date ? {...s, sk: amt} : s);
    } else {
      newSales.push({
        id: nid(newSales),
        date, pc:0,pk:0,mc:0,mk:0,ac:0,ak:0,nc:0,nk:0,jc:0,jk:0,
        sk: amt
      });
    }
    await persist({...data, sales: newSales});
    setEditingSk(null);
  };

  // 월 이동
  const prevMonth = () => {
    const [y, m] = salesYM.split("-").map(Number);
    if (m === 1) setSalesYM(`${y-1}-12`);
    else setSalesYM(`${y}-${String(m-1).padStart(2,"0")}`);
  };
  const nextMonth = () => {
    const [y, m] = salesYM.split("-").map(Number);
    if (m === 12) setSalesYM(`${y+1}-01`);
    else setSalesYM(`${y}-${String(m+1).padStart(2,"0")}`);
  };

  return (
    <div>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
        <button className="btn bs sm" onClick={prevMonth}>◀</button>
        <input type="month" value={salesYM} onChange={e=>setSalesYM(e.target.value)} style={{width:155}} />
        <button className="btn bs sm" onClick={nextMonth}>▶</button>
        <button className="btn bp sm" onClick={()=>setModal({type:"addSales"})}>+ 직접입력</button>
        <button className="btn bg2 sm" onClick={()=>setModal({type:"csvImport"})}>📥 CSV 자동입력</button>
        <span style={{fontSize:11,color:"#888",marginLeft:4}}>{sales.length}건</span>
      </div>
      <div className="g4" style={{marginBottom:12}}>
        <div className="chip">
          <div className="lb">📷 사진관 매출</div>
          <div className="vl">{fmt(T.pc+T.pk+T.mc+T.mk+T.sk-nurakT)}</div>
          <div className="sb">SUMUP+기계+슈킹{nurakT>0?" · 누락 제외":""}</div>
        </div>
        <div className="chip">
          <div className="lb">💍 악세서리</div>
          <div className="vl">{fmt(T.ac+T.ak)}</div>
        </div>
        <div className="chip">
          <div className="lb">💅 네일</div>
          <div className="vl">{fmt(T.nc+T.nk)}</div>
        </div>
        <div className="chip">
          <div className="lb">💎 조이스보물</div>
          <div className="vl">{fmt(T.jc+T.jk)}</div>
        </div>
      </div>
      <div className="g4" style={{marginBottom:12}}>
        <div className="chip" style={{border:"1px solid #4dabf7"}}>
          <div className="lb">📋 부가세 대상 (슈킹 제외)</div>
          <div className="vl" style={{color:"#1971c2"}}>{fmt(T.pc+T.pk+T.mc+T.mk+T.ac+T.ak+T.nc+T.nk+T.jc+T.jk)}</div>
          <div className="sb">부가세: €{fmtE((T.pc+T.pk+T.mc+T.mk+T.ac+T.ak+T.nc+T.nk+T.jc+T.jk)*0.19)}</div>
        </div>
        <div className="chip">
          <div className="lb">🔒 슈킹</div>
          <div className="vl" style={{color:"#888"}}>{fmt(T.sk-nurakT)}</div>
          <div className="sb">인정몫+설명됨</div>
        </div>
        <div className="chip" style={{border:"1px solid #e03131"}}>
          <div className="lb" style={{color:"#e03131"}}>❗ 누락</div>
          <div className="vl" style={{color:"#e03131"}}>{fmt(nurakT)}</div>
          <div className="sb" style={{color:"#e03131"}}>매출 아님 · 확인 필요</div>
        </div>
        <div className="chip" style={{border:"1px solid #f5c518"}}>
          <div className="lb">전체 (슈킹 포함)</div>
          <div className="vl">{fmt(tot-nurakT)}</div>
          <div className="sb">누락 제외</div>
        </div>
      </div>
      <div className="card" style={{background:"rgba(255,212,0,.08)",border:"1px solid rgba(255,212,0,.4)",marginBottom:10}}>
        <div style={{fontSize:11,color:"#b8860b",fontWeight:600,marginBottom:6}}>
          🔒 슈킹 빠른 입력 — 표에서 슈킹 칸을 클릭해서 직접 입력하세요
        </div>
        <div style={{fontSize:10,color:"#888"}}>
          • 매출이 없는 날에도 슈킹만 입력 가능 · 입력 후 자동 저장
        </div>
      </div>
      <div className="card" style={{overflowX:"auto"}}>
        <table className="tbl">
          <thead>
            <tr>
              <th>날짜</th><th>💳현금</th><th>💳카드</th><th>🖨현금</th><th>🖨카드</th>
              <th>💍현금</th><th>💍카드</th><th>💅현금</th><th>💅카드</th>
              <th>💎현금</th><th>💎카드</th><th>🔒슈킹</th><th style={{color:"#e03131"}}>누락</th><th>합계</th><th></th>
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 ? (
              <tr><td colSpan={15} style={{textAlign:"center",color:"#888",padding:16}}>이 달 매출 없음</td></tr>
            ) : (
              sales.map(r => (
                <tr key={r.id}>
                  <td style={{fontWeight:600,whiteSpace:"nowrap"}}>{r.date}</td>
                  <td className="mn" style={{fontSize:11}}>{cell(r.pc)}</td>
                  <td className="mn" style={{fontSize:11}}>{cell(r.pk)}</td>
                  <td className="mn" style={{fontSize:11}}>{cell(r.mc)}</td>
                  <td className="mn" style={{fontSize:11}}>{cell(r.mk)}</td>
                  <td className="mn" style={{fontSize:11}}>{cell(r.ac)}</td>
                  <td className="mn" style={{fontSize:11}}>{cell(r.ak)}</td>
                  <td className="mn" style={{fontSize:11}}>{cell(r.nc)}</td>
                  <td className="mn" style={{fontSize:11}}>{cell(r.nk)}</td>
                  <td className="mn" style={{fontSize:11}}>{cell(r.jc)}</td>
                  <td className="mn" style={{fontSize:11}}>{cell(r.jk)}</td>
                  <td
                    className="mn"
                    style={{
                      color:"#b8860b",
                      fontSize:11,
                      background: editingSk?.date === r.date ? "rgba(255,212,0,.2)" : "rgba(255,212,0,.08)",
                      cursor:"pointer",
                      fontWeight:600
                    }}
                    onClick={()=>setEditingSk({date:r.date, value: r.sk || 0})}>
                    {editingSk?.date === r.date ? (
                      <input
                        type="number"
                        autoFocus
                        value={editingSk.value}
                        onChange={e=>setEditingSk({...editingSk, value:e.target.value})}
                        onBlur={()=>saveSkuking(r.date, editingSk.value)}
                        onKeyDown={e=>{
                          if (e.key === "Enter") saveSkuking(r.date, editingSk.value);
                          else if (e.key === "Escape") setEditingSk(null);
                        }}
                        style={{width:60,padding:"2px 4px",fontSize:11}}
                      />
                    ) : (r.sk ? fmt(r.sk) : <span style={{color:"#aaa"}}>+ 입력</span>)}
                  </td>
                  <td className="mn" style={{fontSize:11,color:"#e03131",fontWeight:(gapByDate[r.date]?.nurak||0)>0?700:400}}>
                    {(gapByDate[r.date]?.nurak||0)>0 ? fmt(gapByDate[r.date].nurak) : <span style={{color:"#bbb"}}>-</span>}
                  </td>
                  <td className="mn" style={{fontWeight:700,color:"#1971c2"}}>{fmt(rT(r)-(gapByDate[r.date]?.nurak||0))}</td>
                  <td>
                    <button className="btn bd sm" onClick={async()=>{
                      if(!confirm(r.date + " 매출 전체 삭제?")) return;
                      await persist({...data, sales:(data.sales||[]).filter(s=>s.id!==r.id)});
                    }}>삭제</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { SalesTab };
