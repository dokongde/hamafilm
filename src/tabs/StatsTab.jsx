import { useState } from "react";
import { curYM, fmtE, fmt } from "../lib/utils";
import { calcMonthData } from "../lib/recon"; // 매출·순수익은 누락(비인정 구멍) 제외

function StatsTab({ data, setModal, persist }) {
  const [view, setView] = useState("dashboard"); // "dashboard" | "details" | "expenses"
  const [stYM, setStYM] = useState(curYM());

  // 그래프: 최근 12개월만 (간결하게)
  const get12Months = () => {
    const result = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      result.push(ym);
    }
    return result;
  };

  // 종합표: 최근 24개월 (2년치)
  const get24Months = () => {
    const result = [];
    const now = new Date();
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      result.push(ym);
    }
    return result;
  };

  // 차트용: 최근 12개월, 그래프에서 최신을 왼쪽으로 → reverse
  const chartMonths = get12Months().reverse(); // 최신 → 옛날
  const chartData = chartMonths.map(ym => calcMonthData(data, ym));
  const maxSales = Math.max(...chartData.map(m => m.sales), 1);
  const maxLabor = Math.max(...chartData.map(m => m.labor), 1);

  // 종합표용: 최근 24개월
  const tableMonths = get24Months();
  const tableData = tableMonths.map(ym => calcMonthData(data, ym));

  // 해당 월 상세
  const cur = calcMonthData(data, stYM);
  const prev = (() => {
    const [y, m] = stYM.split("-").map(Number);
    const pm = m === 1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,"0")}`;
    return calcMonthData(data, pm);
  })();

  // 전년 동월
  const prevYear = (() => {
    const [y, m] = stYM.split("-").map(Number);
    return calcMonthData(data, `${y-1}-${String(m).padStart(2,"0")}`);
  })();

  // 전년 동월 데이터가 존재하는지 (실제 매출/비용/historical 데이터가 있는지)
  const hasPrevYear = prevYear.sales > 0 || prevYear.expenses > 0 || prevYear.isHistorical;

  const diff = (curr, prv) => {
    if (prv === 0 || prv === undefined || prv === null) return null;
    const pct = ((curr - prv) / Math.abs(prv) * 100);
    return pct;
  };
  const diffAmt = (curr, prv) => curr - prv;

  const salesDiff = diff(cur.sales, prev.sales);
  const netDiff = diff(cur.net, prev.net);
  const expDiff = diff(cur.expenses, prev.expenses);
  const salesYDiff = hasPrevYear ? diff(cur.sales, prevYear.sales) : null;
  const netYDiff = hasPrevYear ? diff(cur.net, prevYear.net) : null;
  const expYDiff = hasPrevYear ? diff(cur.expenses, prevYear.expenses) : null;

  // 비교 박스 렌더링: 전월/전년 둘 다 보여줌
  const renderCompare = (curVal, prvVal, prvYearVal, isExpense) => {
    const items = [];
    // 전월
    if (prvVal !== undefined) {
      const d = diffAmt(curVal, prvVal);
      const pct = diff(curVal, prvVal);
      const good = isExpense ? d < 0 : d > 0;
      const color = Math.abs(d) < 1 ? "#888" : (good ? "#20a060" : "#e63946");
      const arrow = d > 1 ? "▲" : d < -1 ? "▼" : "—";
      items.push(
        <div key="prev" style={{fontSize:10,marginTop:2,lineHeight:1.4}}>
          <span style={{color:"#888"}}>전월: </span>
          <span style={{color}}>{arrow} {d >= 0 ? "+" : ""}€{fmtE(d)}</span>
          {pct !== null ? <span style={{color, marginLeft:4}}>({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)</span> : null}
        </div>
      );
    }
    // 전년
    if (prvYearVal !== undefined && hasPrevYear) {
      const d = diffAmt(curVal, prvYearVal);
      const pct = diff(curVal, prvYearVal);
      const good = isExpense ? d < 0 : d > 0;
      const color = Math.abs(d) < 1 ? "#888" : (good ? "#20a060" : "#e63946");
      const arrow = d > 1 ? "▲" : d < -1 ? "▼" : "—";
      items.push(
        <div key="prevYear" style={{fontSize:10,marginTop:2,lineHeight:1.4}}>
          <span style={{color:"#888"}}>전년: </span>
          <span style={{color}}>{arrow} {d >= 0 ? "+" : ""}€{fmtE(d)}</span>
          {pct !== null ? <span style={{color, marginLeft:4}}>({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)</span> : null}
        </div>
      );
    }
    return items;
  };

  // 매출 카테고리 (해당 월)
  const monthSales = (data.sales||[]).filter(s => s.date.startsWith(stYM));
  const sv = k => monthSales.reduce((t, r) => t + (r[k]||0), 0);

  return (
    <div>
      {/* 뷰 전환 탭 */}
      <div style={{display:"flex",gap:5,marginBottom:14,borderBottom:"1px solid #e0e0e0",paddingBottom:0}}>
        {[["dashboard","📊 대시보드"],["details","🔍 매출 상세"],["expenses","💸 지출 관리"]].map(([k,lbl])=>(
          <button key={k}
            onClick={()=>setView(k)}
            style={{
              background:"transparent",
              border:"none",
              padding:"8px 12px",
              fontSize:12,
              fontWeight: view===k ? 700 : 500,
              color: view===k ? "#1971c2" : "#666",
              borderBottom: view===k ? "2px solid #4dabf7" : "2px solid transparent",
              cursor:"pointer",
              fontFamily:"'Noto Sans KR', sans-serif"
            }}>
            {lbl}
          </button>
        ))}
      </div>

      {view === "dashboard" ? (
        <>
          <div className="fr" style={{marginBottom:12}}>
            <div>
              <label>조회 월</label>
              <input type="month" value={stYM} onChange={e=>setStYM(e.target.value)} style={{width:180}} />
            </div>
          </div>

          {/* 누락 경고 — 비인정 직원 구멍 = 매출 아님 */}
          {cur.nurak > 0 ? (
            <div className="card" style={{marginBottom:12,border:"1px solid #e03131",background:"rgba(255,107,107,.06)",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <span style={{color:"#e03131",fontWeight:800,fontSize:13}}>❗ 이번달 누락 €{fmtE(cur.nurak)}</span>
              <span style={{fontSize:11,color:"#888"}}>매출 아님 · 확인 필요 — 매출·순수익에서 제외됨 (대사 탭에서 날짜별 확인)</span>
            </div>
          ) : null}

          {/* 핵심 KPI */}
          <div className="g3" style={{marginBottom:12}}>
            <div className="chip" style={{border:"1.5px solid #4dabf7"}}>
              <div className="lb">📈 매출 {cur.isHistorical ? "(과거)" : ""}</div>
              <div className="vl" style={{color:"#1971c2"}}>€{fmtE(cur.sales)}</div>
              {cur.nurak > 0 ? <div style={{fontSize:10,color:"#e03131"}}>누락 €{fmtE(cur.nurak)} 제외</div> : null}
              <div>{renderCompare(cur.sales, prev.sales, prevYear.sales, false)}</div>
            </div>
            <div className="chip" style={{border:"1.5px solid #e63946"}}>
              <div className="lb">📉 비용</div>
              <div className="vl" style={{color:"#e63946"}}>€{fmtE(cur.expenses)}</div>
              <div>{renderCompare(cur.expenses, prev.expenses, prevYear.expenses, true)}</div>
            </div>
            <div className="chip" style={{border: cur.net >= 0 ? "1.5px solid #20a060" : "1.5px solid #e63946"}}>
              <div className="lb">💰 순수익</div>
              <div className="vl" style={{color: cur.net >= 0 ? "#20a060" : "#e63946"}}>
                €{fmtE(cur.net)}
              </div>
              <div>{renderCompare(cur.net, prev.net, prevYear.net, false)}</div>
            </div>
          </div>

          {/* 비용 세부 */}
          {!cur.isHistorical ? (
            <div className="card" style={{marginBottom:12}}>
              <div className="ct">💸 비용 세부 ({stYM})</div>
              <table className="tbl">
                <tbody>
                  <tr>
                    <td>👥 인건비</td>
                    <td className="mn" style={{textAlign:"right"}}>€{fmtE(cur.labor)}</td>
                    <td style={{textAlign:"right",width:60,color:"#888",fontSize:11}}>
                      {cur.expenses>0 ? ((cur.labor/cur.expenses)*100).toFixed(0) : 0}%
                    </td>
                  </tr>
                  <tr>
                    <td>📋 부가세 (19%)</td>
                    <td className="mn" style={{textAlign:"right"}}>€{fmtE(cur.vat)}</td>
                    <td style={{textAlign:"right",width:60,color:"#888",fontSize:11}}>
                      {cur.expenses>0 ? ((cur.vat/cur.expenses)*100).toFixed(0) : 0}%
                    </td>
                  </tr>
                  <tr>
                    <td>📦 일반 지출</td>
                    <td className="mn" style={{textAlign:"right"}}>€{fmtE(cur.expensesNoLabor)}</td>
                    <td style={{textAlign:"right",width:60,color:"#888",fontSize:11}}>
                      {cur.expenses>0 ? ((cur.expensesNoLabor/cur.expenses)*100).toFixed(0) : 0}%
                    </td>
                  </tr>
                  <tr style={{borderTop:"2px solid #1a1a1a"}}>
                    <td style={{fontWeight:700}}>합계</td>
                    <td className="mn" style={{textAlign:"right",fontWeight:700,color:"#e63946"}}>€{fmtE(cur.expenses)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card" style={{marginBottom:12, background:"#fff8e1"}}>
              <div style={{fontSize:12, color:"#b8860b"}}>
                📌 이 달은 시스템 도입 전 직접 입력 데이터입니다.
                {cur.labor > 0 ? <span> 인건비: <strong>€{fmtE(cur.labor)}</strong></span> : null}
              </div>
            </div>
          )}

          {/* 월별 그래프 — 최근 12개월, 최신이 왼쪽 */}
          <div className="card" style={{marginBottom:12}}>
            <div className="ct">📊 월별 매출 / 순수익 (최근 12개월)</div>
            <div style={{overflowX:"auto"}}>
              <div style={{minWidth: 580, display:"flex", gap:6, alignItems:"flex-end", height:200, padding:"10px 0", borderBottom:"1px solid #e0e0e0"}}>
                {chartData.map(m => {
                  const salesH = (m.sales / maxSales) * 160;
                  const netH = (Math.abs(m.net) / maxSales) * 160;
                  const isCur = m.ym === stYM;
                  const netColor = m.net >= 0 ? "#20a060" : "#e63946";
                  return (
                    <div key={m.ym}
                      onClick={()=>setStYM(m.ym)}
                      style={{
                        flex:"1 0 42px",
                        display:"flex",
                        flexDirection:"column",
                        alignItems:"center",
                        cursor:"pointer",
                        opacity: isCur ? 1 : 0.85,
                        position:"relative"
                      }}>
                      <div style={{display:"flex",gap:2,alignItems:"flex-end",height:165}}>
                        <div style={{
                          width:14,
                          height: salesH,
                          background: isCur ? "#1971c2" : "#4dabf7",
                          borderRadius: "3px 3px 0 0",
                          minHeight: 1
                        }} title={"매출 €"+fmtE(m.sales)} />
                        <div style={{
                          width:14,
                          height: netH,
                          background: netColor,
                          opacity: isCur ? 1 : 0.6,
                          borderRadius: "3px 3px 0 0",
                          minHeight: 1
                        }} title={"순수익 €"+fmtE(m.net)} />
                      </div>
                      <div style={{
                        fontSize:9,
                        color: isCur ? "#1971c2" : "#888",
                        fontWeight: isCur ? 700 : 400,
                        marginTop:4,
                        textAlign:"center",
                        whiteSpace:"nowrap"
                      }}>
                        {m.ym.slice(2).replace("-", "/")}
                      </div>
                      {m.isHistorical ? <div style={{fontSize:7, color:"#b8860b"}}>📌</div> : null}
                    </div>
                  );
                })}
              </div>
              <div style={{display:"flex",gap:14,marginTop:8,fontSize:11,color:"#666",flexWrap:"wrap"}}>
                <span><span style={{display:"inline-block",width:10,height:10,background:"#4dabf7",borderRadius:2,marginRight:4}}></span>매출</span>
                <span><span style={{display:"inline-block",width:10,height:10,background:"#20a060",borderRadius:2,marginRight:4}}></span>순수익(흑자)</span>
                <span><span style={{display:"inline-block",width:10,height:10,background:"#e63946",borderRadius:2,marginRight:4}}></span>순수익(적자)</span>
                <span style={{color:"#888"}}>← 최신</span>
              </div>
            </div>
          </div>

          {/* 인건비 추이 — 최근 12개월, 최신이 왼쪽 */}
          <div className="card" style={{marginBottom:12}}>
            <div className="ct">👥 월별 인건비 추이 (최근 12개월)</div>
            <div style={{overflowX:"auto"}}>
              <div style={{minWidth: 580, display:"flex", gap:6, alignItems:"flex-end", height:130, padding:"8px 0", borderBottom:"1px solid #e0e0e0"}}>
                {chartData.map(m => {
                  const h = (m.labor / maxLabor) * 100;
                  const isCur = m.ym === stYM;
                  return (
                    <div key={m.ym}
                      onClick={()=>setStYM(m.ym)}
                      style={{flex:"1 0 42px",display:"flex",flexDirection:"column",alignItems:"center",cursor:"pointer"}}>
                      <div style={{
                        width:24,
                        height: h,
                        background: isCur ? "#7950f2" : "#a55eea",
                        borderRadius: "3px 3px 0 0",
                        minHeight: m.labor > 0 ? 1 : 0
                      }} title={"인건비 €"+fmtE(m.labor)} />
                      <div style={{fontSize:9, color: isCur ? "#7950f2" : "#888", fontWeight: isCur?700:400, marginTop:4}}>
                        {m.ym.slice(2).replace("-", "/")}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{fontSize:10,color:"#888",marginTop:6}}>← 최신 (왼쪽이 최근달)</div>
            </div>
          </div>

          {/* 월별 데이터 표 — 최근 24개월 (2년) */}
          <div className="card">
            <div className="ct" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>📋 월별 종합표 (최근 2년)</span>
              <button className="btn bs sm" onClick={()=>setModal({type:"historical"})}>+ 과거 데이터 입력</button>
            </div>
            <div style={{overflowX:"auto"}}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>월</th>
                    <th>매출</th>
                    <th>비용</th>
                    <th>인건비</th>
                    <th>순수익</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...tableData].reverse().map(m => {
                    const profit = m.sales - m.expenses;
                    const margin = m.sales > 0 ? (profit/m.sales*100).toFixed(1) : "0.0";
                    const isEmpty = m.sales === 0 && m.expenses === 0 && !m.isHistorical;
                    return (
                      <tr key={m.ym} style={{background: m.ym===stYM ? "#e7f5ff" : "transparent", opacity: isEmpty ? 0.4 : 1}}>
                        <td style={{fontWeight:600}}>
                          {m.ym}
                          {m.isHistorical ? <span style={{color:"#b8860b",marginLeft:4,fontSize:10}}>📌</span> : null}
                        </td>
                        <td className="mn" style={{color:"#1971c2"}}>€{fmtE(m.sales)}</td>
                        <td className="mn" style={{color:"#e63946"}}>€{fmtE(m.expenses)}</td>
                        <td className="mn" style={{color:"#7950f2"}}>€{fmtE(m.labor)}</td>
                        <td className="mn" style={{color: m.net >= 0 ? "#20a060" : "#e63946", fontWeight:700}}>
                          €{fmtE(m.net)} <span style={{fontSize:10,color:"#888",fontWeight:400}}>({margin}%)</span>
                        </td>
                        <td>
                          {m.isHistorical ? (
                            <button className="btn bs sm" onClick={()=>setModal({type:"historical", edit: (data.historicalData||[]).find(h=>h.ym===m.ym)})}>수정</button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : view === "details" ? (
        // ─── 매출 상세 ───
        (() => {
          const sumup = sv("pc")+sv("pk");
          const machine = sv("mc")+sv("mk");
          const acc = sv("ac")+sv("ak");
          const nail = sv("nc")+sv("nk");
          const joys = sv("jc")+sv("jk");
          const skRaw = sv("sk");
          const nurak = cur.nurak || 0; // 비인정 직원 구멍 = 매출 아님
          const sk = skRaw - nurak; // 슈킹 = sk − 누락 (인정몫+설명됨)
          const photoStudio = sumup + machine + sk; // 진짜 사진관 매출 (누락 제외)
          const vatable = sumup + machine + acc + nail + joys; // 부가세 대상 (슈킹 제외)
          const all = vatable + sk;
          const vat = vatable * 0.19;
          const cash = sv("pc")+sv("mc")+sv("ac")+sv("nc")+sv("jc")+sk;
          const card = sv("pk")+sv("mk")+sv("ak")+sv("nk")+sv("jk");
          const cats = [
            {n:"💳 SUMUP 현금", v:sv("pc"), c:"#4dabf7"},
            {n:"💳 SUMUP 카드", v:sv("pk"), c:"#4dabf7"},
            {n:"🖨 기계 현금", v:sv("mc"), c:"#ffd700"},
            {n:"🖨 기계 카드", v:sv("mk"), c:"#ffd700"},
            {n:"💍 악세서리 현금", v:sv("ac"), c:"#ff6b35"},
            {n:"💍 악세서리 카드", v:sv("ak"), c:"#ff6b35"},
            {n:"💅 네일 현금", v:sv("nc"), c:"#ff4757"},
            {n:"💅 네일 카드", v:sv("nk"), c:"#ff4757"},
            {n:"💎 조이스 현금", v:sv("jc"), c:"#5352ed"},
            {n:"💎 조이스 카드", v:sv("jk"), c:"#5352ed"},
            {n:"🔒 슈킹", v:sk, c:"#888"}
          ];
          if (nurak > 0) cats.push({n:"❗ 누락 (매출 아님)", v:nurak, c:"#e03131"});
          const mx = Math.max(...cats.map(c => c.v), 1);

          return (
            <>
              <div className="fr" style={{marginBottom:12}}>
                <div>
                  <label>조회 월</label>
                  <input type="month" value={stYM} onChange={e=>setStYM(e.target.value)} style={{width:180}} />
                </div>
              </div>
              {/* 진짜 사진관 매출 */}
              <div className="card" style={{marginBottom:12, border:"1.5px solid #4dabf7"}}>
                <div className="ct" style={{color:"#1971c2"}}>📷 사진관 매출 (SUMUP + 기계 + 슈킹)</div>
                <div className="g3">
                  <div className="chip"><div className="lb">💳 SUMUP</div><div className="vl">{fmt(sumup)}</div></div>
                  <div className="chip"><div className="lb">🖨 기계</div><div className="vl">{fmt(machine)}</div></div>
                  <div className="chip">
                    <div className="lb">🔒 슈킹</div>
                    <div className="vl" style={{color:"#888"}}>{fmt(sk)}</div>
                    {nurak > 0 ? <div className="sb" style={{color:"#e03131"}}>누락 €{fmtE(nurak)} 제외</div> : null}
                  </div>
                </div>
                <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #e0e0e0",display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:700}}>
                  <span>사진관 매출 합계</span>
                  <span className="mn" style={{color:"#1971c2"}}>€{fmtE(photoStudio)}</span>
                </div>
              </div>
              {/* 부가가치 상품 */}
              <div className="card" style={{marginBottom:12}}>
                <div className="ct">🛍️ 부가 상품 매출</div>
                <div className="g3">
                  <div className="chip"><div className="lb">💍 악세서리</div><div className="vl">{fmt(acc)}</div></div>
                  <div className="chip"><div className="lb">💅 네일</div><div className="vl">{fmt(nail)}</div></div>
                  <div className="chip"><div className="lb">💎 조이스보물</div><div className="vl">{fmt(joys)}</div></div>
                </div>
              </div>
              {/* 결제수단 */}
              <div className="g3" style={{marginBottom:10}}>
                <div className="chip"><div className="lb">💵 현금</div><div className="vl">{fmt(cash)}</div></div>
                <div className="chip"><div className="lb">💳 카드</div><div className="vl">{fmt(card)}</div></div>
                <div className="chip" style={{border:"1px solid #f5c518"}}><div className="lb">전체 (슈킹 포함)</div><div className="vl">{fmt(all)}</div><div className="sb">{monthSales.length}일</div></div>
              </div>
              {/* 부가세 / 신고 */}
              <div className="g2" style={{marginBottom:12}}>
                <div className="chip" style={{border:"1px solid #4dabf7"}}>
                  <div className="lb">📋 부가세 대상 (슈킹 제외)</div>
                  <div className="vl" style={{color:"#1971c2"}}>{fmt(vatable)}</div>
                  <div className="sb">SUMUP+기계+악세+네일+조이스</div>
                </div>
                <div className="chip" style={{border:"1px solid #e63946"}}>
                  <div className="lb">💸 부가세 (19%)</div>
                  <div className="vl" style={{color:"#e63946"}}>{fmt(vat)}</div>
                  <div className="sb">납부할 세금</div>
                </div>
              </div>
              <div className="card">
                <div className="ct">📊 카테고리별 상세</div>
                {cats.map(c => (
                  <div key={c.n} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <span style={{fontSize:12}}>{c.n}</span>
                      <span className="mn" style={{fontSize:12,color:"#888"}}>{fmt(c.v)}</span>
                    </div>
                    <div style={{background:"#f5f5f7",borderRadius:4,height:6,overflow:"hidden"}}>
                      <div style={{height:"100%", width:((c.v/mx*100).toFixed(1)+"%"), background:c.c, borderRadius:4}} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          );
        })()
      ) : (
        // ─── 지출 관리 ───
        <ExpensesView data={data} stYM={stYM} setStYM={setStYM} setModal={setModal} persist={persist} />
      )}
    </div>
  );
}

// 지출 관리 뷰
function ExpensesView({ data, stYM, setStYM, setModal, persist }) {
  const monthExpenses = (data.expenses||[])
    .filter(x => x.date.startsWith(stYM))
    .sort((a, b) => b.date.localeCompare(a.date));

  // 카테고리별 합계
  const byCategory = {};
  monthExpenses.forEach(x => {
    if (!byCategory[x.category]) byCategory[x.category] = 0;
    byCategory[x.category] += x.amount || 0;
  });
  const total = Object.values(byCategory).reduce((a, b) => a + b, 0);

  const handleDelete = async (x) => {
    if (!confirm(`삭제할까요?\n${x.date} ${x.category} €${fmtE(x.amount)}${x.memo ? " — "+x.memo : ""}`)) return;
    const nd = {...data, expenses: (data.expenses||[]).filter(e => e.id !== x.id)};
    await persist(nd);
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <div style={{flex:"1 1 200px"}}>
          <label>조회 월</label>
          <input type="month" value={stYM} onChange={e=>setStYM(e.target.value)} style={{maxWidth:180}} />
        </div>
        <button className="btn bp sm" onClick={()=>setModal({type:"expense"})}>+ 지출 추가</button>
      </div>

      {/* 카테고리별 요약 */}
      <div className="card" style={{marginBottom:12}}>
        <div className="ct">{stYM} 카테고리별 지출</div>
        {Object.keys(byCategory).length === 0 ? (
          <p style={{color:"#888",fontSize:12}}>이 달 지출 없음</p>
        ) : (
          <>
            {Object.entries(byCategory).sort((a,b)=>b[1]-a[1]).map(([cat, amt]) => {
              const pct = total > 0 ? (amt/total*100) : 0;
              return (
                <div key={cat} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,fontSize:12}}>
                    <span>{cat}</span>
                    <span className="mn" style={{color:"#666"}}>€{fmtE(amt)} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div style={{background:"#f5f5f7",borderRadius:4,height:6,overflow:"hidden"}}>
                    <div style={{height:"100%", width: pct+"%", background:"#e63946", borderRadius:4}} />
                  </div>
                </div>
              );
            })}
            <div style={{marginTop:12,paddingTop:10,borderTop:"1px solid #e0e0e0",display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:700}}>
              <span>합계</span>
              <span className="mn" style={{color:"#e63946"}}>€{fmtE(total)}</span>
            </div>
          </>
        )}
      </div>

      {/* 지출 목록 */}
      <div className="card">
        <div className="ct">{stYM} 지출 내역</div>
        {monthExpenses.length === 0 ? (
          <p style={{color:"#888",fontSize:12}}>없음</p>
        ) : (
          <table className="tbl">
            <thead><tr><th>날짜</th><th>카테고리</th><th>금액</th><th>메모</th><th></th></tr></thead>
            <tbody>
              {monthExpenses.map(x => (
                <tr key={x.id}>
                  <td>{x.date}</td>
                  <td>
                    <span className="badge bgry">{x.category}</span>
                    {x.recurring ? <span style={{marginLeft:4,fontSize:10,color:"#7950f2"}}>🔁</span> : null}
                  </td>
                  <td className="mn" style={{color:"#e63946"}}>€{fmtE(x.amount)}</td>
                  <td style={{color:"#666",fontSize:11}}>{x.memo || "—"}</td>
                  <td>
                    <div style={{display:"flex",gap:4}}>
                      <button className="btn bs sm" onClick={()=>setModal({type:"expense", edit:x})}>수정</button>
                      <button className="btn sm" style={{background:"#fff5f5",color:"#e63946",border:"1px solid #fcc"}} onClick={()=>handleDelete(x)}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export { StatsTab, ExpensesView };
