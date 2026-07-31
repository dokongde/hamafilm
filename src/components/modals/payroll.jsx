import { useState } from "react";
import { todayStr, curYM, nextYM, getCarryIn, fmtE, nid, shiftHours } from "../../lib/utils";

function AddPayrollModal({ modal, data, persist, close, toast, gSt }) {
  const rec = modal.editRec;
  const [sid, setSid] = useState(rec?.staffId || data.staff[0]?.id || 1);
  const [ym, setYm] = useState(rec?.ym || modal.ym || curYM());
  const [amount, setAmount] = useState(rec?.amount || "");
  const [actualAmount, setActualAmount] = useState(rec?.actualAmount ?? "");
  const [hours, setHours] = useState(rec?.hours || "");
  const [adjType, setAdjType] = useState(() => {
    const t = rec?.adjType || "없음";
    if (t === "추가") return "추가지급"; // 옛날 데이터 마이그레이션
    return t;
  });
  const [adjAmt, setAdjAmt] = useState(rec?.adjAmount || "");
  const [adjDesc, setAdjDesc] = useState(rec?.adjDesc || "");
  const [autoCarry, setAutoCarry] = useState(rec ? (rec.carryToNext != null) : true);
  const shifts = (data.shifts||[]).filter(s => s.staffId===sid && s.date.startsWith(ym));
  let refH = 0;
  shifts.forEach(s => { refH += shiftHours(s); });
  const st = gSt(sid);
  const refPayNum = refH * (st?.wage || 0); // 그 달 스케줄 기준 근무 총액 (숫자)
  const refPay = fmtE(refPayNum);

  // ── 실근무 정산액 기반 자동 이월 계산 ──
  // 실정산 = 실근무정산액 + 전월 carry-in(차감은 음수)
  // 차월이월 = 확정급여 − 실정산  (양수면 다음달 차감, 음수면 다음달 추가지급)
  const carryIn = getCarryIn(data.payrollRecords, sid, ym); // {amount(부호), isAdd, desc}
  // 실근무 정산액: 직접 입력했으면 그 값, 비워두면 그 달 근무 총액(스케줄 기준)을 자동 사용
  const userTypedActual = actualAmount !== "" && !isNaN(parseFloat(actualAmount));
  const effActual = userTypedActual ? parseFloat(actualAmount) : refPayNum; // 계산에 쓰는 실근무액
  const hasActual = userTypedActual || refPayNum > 0; // 자동값이라도 있으면 계산 진행
  const settleNow = hasActual ? (effActual + carryIn.amount) : null; // 이번달 실정산(전월 반영 후)
  const carryRaw = (hasActual && amount !== "") ? (parseFloat(amount) - settleNow) : 0; // 확정 − 실정산
  // 부동소수 보정 (예: 51.330000001 → 51.33)
  const carryToNext = Math.round(carryRaw * 100) / 100;

  // 자동모드면 위 계산값으로 adjType/adjAmt를 덮어쓴다
  const effAdjType = autoCarry && hasActual ? (carryToNext >= 0 ? "차감" : "추가지급") : adjType;
  const effAdjAmt = autoCarry && hasActual ? Math.abs(carryToNext) : (parseFloat(adjAmt) || 0);

  const hasAdj = effAdjType !== "없음" && effAdjAmt > 0;
  const adjSign = effAdjType === "추가지급" ? "+" : "-";
  const adjCol = effAdjType === "추가지급" ? "#20a060" : "#e63946";

  const save = async () => {
    if (!amount) { toast("확정급여 입력"); return; }
    const entry = {
      id: rec ? rec.id : nid(data.payrollRecords||[]),
      staffId: sid, ym,
      amount: parseFloat(amount),
      actualAmount: hasActual ? Math.round(effActual * 100) / 100 : null,
      hours: parseFloat(hours) || 0,
      adjType: effAdjType,
      adjAmount: effAdjAmt > 0 ? Math.round(effAdjAmt * 100) / 100 : 0,
      adjDesc: (autoCarry && hasActual && !adjDesc) ? "실근무 정산 차액 이월" : adjDesc,
      carryToNext: (autoCarry && hasActual) ? carryToNext : null,
      savedAt: new Date().toISOString()
    };
    let nd;
    if (rec) {
      nd = {...data, payrollRecords: (data.payrollRecords||[]).map(r => r.id===rec.id ? entry : r)};
    } else {
      nd = {...data, payrollRecords: [...(data.payrollRecords||[]), entry]};
    }
    await persist(nd);
    close();
    toast("✅ " + (st?.name || "") + " " + ym + " 저장!");
  };
  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>{rec ? "급여 수정" : "급여 기록 추가"}</h3>
        <div className="fr fc2">
          <div>
            <label>직원</label>
            <select value={sid} onChange={e=>setSid(parseInt(e.target.value))}>
              {data.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label>월</label>
            <input type="month" value={ym} onChange={e=>setYm(e.target.value)} />
          </div>
        </div>
        <div style={{background:"#eef6ff",border:"1px solid rgba(25,113,194,.22)",borderRadius:8,padding:"9px 12px",fontSize:12,marginBottom:10,lineHeight:1.85}}>
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <span style={{color:"#666"}}>그 달 근무 총액 <span style={{fontSize:10,color:"#999"}}>({refH}h)</span></span>
            <strong className="mn" style={{color:"#1a1a1a"}}>€{refPay}</strong>
          </div>
          {carryIn.amount !== 0 ? (
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{color:"#666"}}>지난달 {carryIn.isAdd ? "추가지급" : "차감"}{carryIn.desc ? <span style={{fontSize:10,color:"#999",marginLeft:4}}>({carryIn.desc})</span> : null}</span>
              <strong className="mn" style={{color: carryIn.isAdd ? "#20a060" : "#e63946"}}>{carryIn.isAdd ? "+" : "-"}€{fmtE(Math.abs(carryIn.amount))}</strong>
            </div>
          ) : null}
          <div style={{display:"flex",justifyContent:"space-between",paddingTop:5,marginTop:4,borderTop:"1.5px solid rgba(25,113,194,.25)"}}>
            <strong style={{color:"#1971c2"}}>→ 반영 후 금액</strong>
            <strong className="mn" style={{color:"#1971c2",fontSize:15}}>€{fmtE(settleNow != null ? settleNow : refPayNum)}</strong>
          </div>
          {userTypedActual ? (
            <div style={{fontSize:10,color:"#999",marginTop:2}}>※ 실근무 정산액을 직접 입력함(€{fmtE(parseFloat(actualAmount))}) — 근무 총액 대신 사용</div>
          ) : null}
        </div>
        <div className="fr fc2">
          <div>
            <label>확정 급여 (€) <span style={{fontSize:9,color:"#888"}}>명세서</span></label>
            <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} step="0.01" placeholder={refPay} />
          </div>
          <div>
            <label>확정 시간 (h)</label>
            <input type="number" value={hours} onChange={e=>setHours(e.target.value)} step="0.5" placeholder={String(refH)} />
          </div>
        </div>
        <div className="fr">
          <div>
            <label>실근무 정산액 (€) <span style={{fontSize:9,color:"#888"}}>비우면 근무 총액 €{refPay} 자동 사용</span></label>
            <input type="number" value={actualAmount} onChange={e=>setActualAmount(e.target.value)} step="0.01" placeholder={"자동: €"+refPay} />
          </div>
        </div>
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#1971c2",fontWeight:600,margin:"6px 0"}}>
          <input type="checkbox" checked={autoCarry} onChange={e=>setAutoCarry(e.target.checked)} style={{width:"auto"}} />
          🔄 차월 이월 자동 계산 (확정 − 실정산)
        </label>
        {!autoCarry ? (
          <>
            <div style={{fontSize:11,fontWeight:700,color:"#d94c1a",margin:"8px 0 5px"}}>⚖️ 조정 (다음달 반영) · 수동</div>
            <div className="fr fc2">
              <div>
                <label>유형</label>
                <select value={adjType} onChange={e=>setAdjType(e.target.value)}>
                  <option value="없음">없음</option>
                  <option value="추가지급">➕ 추가지급 (이번달 더 일함 → 다음달 더 줌)</option>
                  <option value="차감">➖ 차감 (이번달 덜 일함 → 다음달 덜 줌)</option>
                </select>
              </div>
              <div>
                <label>금액 (€)</label>
                <input type="number" value={adjAmt} onChange={e=>setAdjAmt(e.target.value)} step="0.01" placeholder="0.00" />
              </div>
            </div>
          </>
        ) : null}
        <div className="fr">
          <div>
            <label>사유</label>
            <input value={adjDesc} onChange={e=>setAdjDesc(e.target.value)} placeholder={autoCarry ? "비우면 자동: 실근무 정산 차액 이월" : "예: 미근무 차감"} />
          </div>
        </div>
        {parseFloat(amount) > 0 ? (
          <div style={{background:"rgba(245,197,24,.08)",border:"1px solid rgba(245,197,24,.3)",borderRadius:7,padding:"8px 11px",fontSize:12,lineHeight:1.7}}>
            <div>확정(명세서): <strong style={{color:"#4ecdc4"}}>€{fmtE(parseFloat(amount))}</strong></div>
            {hasActual ? (
              <div>이번달 실정산: <strong style={{color:"#1971c2"}}>€{fmtE(settleNow)}</strong>
                <span style={{fontSize:10,color:"#888",marginLeft:5}}>
                  (실근무 €{fmtE(parseFloat(actualAmount))}{carryIn.amount !== 0 ? ` ${carryIn.amount<0?"−":"+"} €${fmtE(Math.abs(carryIn.amount))}` : ""})
                </span>
              </div>
            ) : null}
            {hasAdj ? (
              <div>{nextYM(ym)} 이월: <strong style={{color:adjCol}}>{adjSign}€{fmtE(effAdjAmt)}</strong>
                <span style={{fontSize:10,color:"#888",marginLeft:5}}>{effAdjType==="차감"?"(다음달 차감)":"(다음달 추가)"}</span>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="mf">
          <button className="btn bs" onClick={close}>취소</button>
          <button className="btn bp" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

// 지급 관리 모달
function EditPaymentModal({ modal, data, persist, close, toast, gSt }) {
  const existing = (data.payments||[]).find(p => p.staffId===modal.staffId && p.ym===modal.ym);
  const st = gSt(modal.staffId);
  // 상태: "none"(미지급) | "ready"(준비완료) | "paid"(지급완료)
  const initStatus = existing
    ? (existing.status || (existing.paid ? "paid" : "none"))
    : "none";
  const [status, setStatus] = useState(initStatus);
  const [paidDate, setPaidDate] = useState(existing?.paidDate || todayStr());
  const [method, setMethod] = useState(existing?.method || "회사통장");
  const [amount, setAmount] = useState(existing?.amount || modal.defaultAmount || 0);
  const [memo, setMemo] = useState(existing?.memo || "");

  const save = async () => {
    const entry = {
      id: existing?.id || nid(data.payments||[]),
      staffId: modal.staffId,
      ym: modal.ym,
      status,
      paid: status === "paid", // 호환성 유지
      paidDate: status === "paid" ? paidDate : "",
      method: status === "paid" ? method : (status === "ready" ? method : ""),
      amount: parseFloat(amount) || 0,
      memo,
      savedAt: new Date().toISOString()
    };
    let nd;
    if (existing) {
      nd = {...data, payments: (data.payments||[]).map(p => p.id===existing.id ? entry : p)};
    } else {
      nd = {...data, payments: [...(data.payments||[]), entry]};
    }
    await persist(nd);
    close();
    const msgs = {none:"미지급으로 변경", ready:"📦 준비완료!", paid:"✅ 지급완료!"};
    toast(msgs[status]);
  };

  const remove = async () => {
    if (!existing) return;
    if (!confirm("지급 기록을 삭제할까요?")) return;
    await persist({...data, payments: (data.payments||[]).filter(p => p.id !== existing.id)});
    close();
    toast("기록 삭제됨");
  };

  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>💰 {st?.name} · {modal.ym} 급여 지급</h3>
        <div style={{background:"#f5f5f7",borderRadius:7,padding:"10px 12px",fontSize:12,color:"#666",marginBottom:12}}>
          {(modal.adjustment || modal.settleNow != null || (modal.carryOut != null && Math.abs(modal.carryOut) > 0)) ? (
            <>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span>{modal.settleNow != null ? "확정 (명세서)" : "이번달 기본 급여"}</span>
                <strong className="mn" style={{color:"#1a1a1a"}}>€{fmtE(modal.settleNow != null ? (modal.defaultAmount || 0) : (modal.baseAmount || 0))}</strong>
              </div>
              {modal.adjustment ? (
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span>
                    지난달 {modal.adjustment.isAdd ? "추가지급" : "차감"}
                    {modal.adjustment.desc ? <span style={{fontSize:10,color:"#888",marginLeft:4}}>({modal.adjustment.desc})</span> : null}
                  </span>
                  <strong className="mn" style={{color: modal.adjustment.isAdd ? "#20a060" : "#e63946"}}>
                    {modal.adjustment.isAdd ? "+" : "-"}€{fmtE(modal.adjustment.amount)}
                  </strong>
                </div>
              ) : null}
              {modal.settleNow != null ? (
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span>이번달 실정산</span>
                  <strong className="mn" style={{color:"#1971c2"}}>€{fmtE(modal.settleNow)}</strong>
                </div>
              ) : null}
              {modal.carryOut != null && Math.abs(modal.carryOut) > 0 ? (
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span>다음달 이월 {modal.carryOut >= 0 ? "(차감)" : "(추가지급)"}</span>
                  <strong className="mn" style={{color: modal.carryOut >= 0 ? "#e63946" : "#20a060"}}>
                    {modal.carryOut >= 0 ? "-" : "+"}€{fmtE(Math.abs(modal.carryOut))}
                  </strong>
                </div>
              ) : null}
              <div style={{display:"flex",justifyContent:"space-between",paddingTop:5,marginTop:5,borderTop:"1.5px solid #d0d0d0"}}>
                <strong style={{color:"#1971c2"}}>최종 지급액</strong>
                <strong className="mn" style={{color:"#1971c2",fontSize:14}}>€{fmtE(modal.defaultAmount || 0)}</strong>
              </div>
            </>
          ) : (
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span>예상 급여</span>
              <strong style={{color:"#1971c2"}}>€{fmtE(modal.defaultAmount || 0)}</strong>
            </div>
          )}
        </div>

        {/* 3단계 상태 버튼 */}
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          <button
            className="btn"
            onClick={()=>setStatus("none")}
            style={{
              flex:1,
              background: status === "none" ? "#e63946" : "#f5f5f7",
              color: status === "none" ? "#fff" : "#888",
              border: status === "none" ? "none" : "1px solid #d0d0d0",
              padding:"9px",
              fontSize:11
            }}>
            ✗ 미지급
          </button>
          <button
            className="btn"
            onClick={()=>setStatus("ready")}
            style={{
              flex:1,
              background: status === "ready" ? "#f5c518" : "#f5f5f7",
              color: status === "ready" ? "#000" : "#888",
              border: status === "ready" ? "none" : "1px solid #d0d0d0",
              padding:"9px",
              fontSize:11
            }}>
            📦 준비완료
          </button>
          <button
            className="btn"
            onClick={()=>setStatus("paid")}
            style={{
              flex:1,
              background: status === "paid" ? "#2ed573" : "#f5f5f7",
              color: status === "paid" ? "#fff" : "#888",
              border: status === "paid" ? "none" : "1px solid #d0d0d0",
              padding:"9px",
              fontSize:11
            }}>
            ✓ 지급완료
          </button>
        </div>

        {/* 안내 문구 */}
        {status === "ready" ? (
          <div style={{fontSize:11,color:"#b8860b",background:"rgba(245,197,24,.12)",padding:"7px 9px",borderRadius:5,marginBottom:10}}>
            💡 직원에게 "준비완료"로 보입니다. 직원이 받았다고 표시할 수 있어요.
          </div>
        ) : null}

        {/* 지급 정보 입력 (준비완료 또는 지급완료) */}
        {status !== "none" ? (
          <>
            <div className="fr fc2">
              {status === "paid" ? (
                <div>
                  <label>지급일</label>
                  <input type="date" value={paidDate} onChange={e=>setPaidDate(e.target.value)} />
                </div>
              ) : null}
              <div>
                <label>{status === "paid" ? "지급 방법" : "지급 예정 방법"}</label>
                <select value={method} onChange={e=>setMethod(e.target.value)}>
                  <option value="회사통장">🏦 회사통장</option>
                  <option value="현금">💵 현금</option>
                  <option value="계좌이체">💳 계좌이체</option>
                  <option value="기타">기타</option>
                </select>
              </div>
            </div>
            <div className="fr">
              <div>
                <label>{status === "paid" ? "실제 지급액 (€)" : "예정 금액 (€)"}</label>
                <input type="number" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} />
              </div>
            </div>
          </>
        ) : null}

        <div className="fr">
          <div>
            <label>메모</label>
            <input value={memo} onChange={e=>setMemo(e.target.value)} placeholder="선택사항" />
          </div>
        </div>

        <div className="mf">
          {existing ? (
            <button className="btn bd" onClick={remove}>기록 삭제</button>
          ) : null}
          <button className="btn bs" onClick={close}>취소</button>
          <button className="btn bp" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

// 지출 입력/수정 모달
function ExpenseModal({ modal, data, persist, close, toast }) {
  const ed = modal.edit;
  const [date, setDate] = useState(ed?.date || todayStr());
  const [category, setCategory] = useState(ed?.category || "임대료");
  const [amount, setAmount] = useState(ed?.amount || "");
  const [memo, setMemo] = useState(ed?.memo || "");
  const [recurring, setRecurring] = useState(ed?.recurring || false);

  const categories = [
    {v:"임대료", e:"🏢"},
    {v:"공과금", e:"💡"},
    {v:"재료비", e:"📦"},
    {v:"광고비", e:"📣"},
    {v:"수수료", e:"💳"},
    {v:"통신비", e:"📞"},
    {v:"보험", e:"🛡️"},
    {v:"세금", e:"📋"},
    {v:"수리/유지보수", e:"🔧"},
    {v:"기타", e:"📌"}
  ];

  const save = async () => {
    if (!amount || parseFloat(amount) <= 0) { toast("금액 입력"); return; }
    const entry = {
      id: ed?.id || nid(data.expenses||[]),
      date, category,
      amount: parseFloat(amount),
      memo,
      recurring,
      savedAt: new Date().toISOString()
    };
    let nd;
    if (ed) {
      nd = {...data, expenses: (data.expenses||[]).map(x => x.id===ed.id ? entry : x)};
    } else {
      nd = {...data, expenses: [...(data.expenses||[]), entry]};
    }
    await persist(nd);
    close();
    toast(ed ? "수정됨" : "지출 저장!");
  };

  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>{ed ? "지출 수정" : "지출 추가"}</h3>
        <div className="fr fc2">
          <div>
            <label>날짜</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
          </div>
          <div>
            <label>카테고리</label>
            <select value={category} onChange={e=>setCategory(e.target.value)}>
              {categories.map(c => <option key={c.v} value={c.v}>{c.e} {c.v}</option>)}
            </select>
          </div>
        </div>
        <div className="fr">
          <div>
            <label>금액 (€)</label>
            <input type="number" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <div className="fr">
          <div>
            <label>메모</label>
            <input value={memo} onChange={e=>setMemo(e.target.value)} placeholder="선택사항" />
          </div>
        </div>
        <label style={{display:"flex",alignItems:"center",gap:7,fontSize:12,color:"#666",cursor:"pointer",marginTop:4}}>
          <input type="checkbox" checked={recurring} onChange={e=>setRecurring(e.target.checked)} style={{width:"auto"}} />
          매월 정기 지출
        </label>
        <div className="mf">
          <button className="btn bs" onClick={close}>취소</button>
          <button className="btn bp" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

// 과거 데이터 입력 모달 (2024-08 ~ 2025-03)
function HistoricalModal({ modal, data, persist, close, toast }) {
  const ed = modal.edit;
  const [ym, setYm] = useState(ed?.ym || "2024-08");
  const [sales, setSales] = useState(ed?.sales || "");
  const [expenses, setExpenses] = useState(ed?.expenses || "");
  const [labor, setLabor] = useState(ed?.labor || "");
  const [memo, setMemo] = useState(ed?.memo || "");

  const save = async () => {
    if (!ym) { toast("월 입력"); return; }
    const entry = {
      ym,
      sales: parseFloat(sales) || 0,
      expenses: parseFloat(expenses) || 0,
      labor: parseFloat(labor) || 0,
      memo
    };
    let nd;
    const existing = (data.historicalData||[]).find(h => h.ym === ym);
    if (existing) {
      nd = {...data, historicalData: (data.historicalData||[]).map(h => h.ym===ym ? entry : h)};
    } else {
      nd = {...data, historicalData: [...(data.historicalData||[]), entry]};
    }
    await persist(nd);
    close();
    toast(ym + " 저장!");
  };

  const remove = async () => {
    if (!ed) return;
    if (!confirm(ed.ym + " 데이터 삭제?")) return;
    await persist({...data, historicalData: (data.historicalData||[]).filter(h => h.ym !== ed.ym)});
    close();
    toast("삭제됨");
  };

  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>{ed ? "과거 데이터 수정" : "과거 데이터 입력"}</h3>
        <div style={{fontSize:11,color:"#888",marginBottom:10}}>
          📌 시스템 도입 전(2024.08~2025.03)에 대한 월별 종합 데이터
        </div>
        <div className="fr">
          <div>
            <label>월 (YYYY-MM)</label>
            <input type="month" value={ym} onChange={e=>setYm(e.target.value)} disabled={!!ed} />
          </div>
        </div>
        <div className="fr fc2">
          <div>
            <label>총 매출 (€)</label>
            <input type="number" step="0.01" value={sales} onChange={e=>setSales(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label>총 비용 (€)</label>
            <input type="number" step="0.01" value={expenses} onChange={e=>setExpenses(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <div className="fr">
          <div>
            <label>인건비 (€) — 비용 중 인건비 부분</label>
            <input type="number" step="0.01" value={labor} onChange={e=>setLabor(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <div className="fr">
          <div>
            <label>메모</label>
            <input value={memo} onChange={e=>setMemo(e.target.value)} placeholder="선택사항" />
          </div>
        </div>
        {sales && expenses ? (
          <div style={{background:"rgba(77,171,247,.1)",border:"1px solid rgba(77,171,247,.3)",borderRadius:7,padding:"8px 11px",fontSize:12,marginTop:6}}>
            순수익: <strong style={{color:"#1971c2"}}>€{fmtE(parseFloat(sales)-parseFloat(expenses))}</strong>
          </div>
        ) : null}
        <div className="mf">
          {ed ? <button className="btn bd" onClick={remove}>삭제</button> : null}
          <button className="btn bs" onClick={close}>취소</button>
          <button className="btn bp" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

export { AddPayrollModal, EditPaymentModal, ExpenseModal, HistoricalModal };
