import { useState } from "react";
import { curYM, nextYM, getCarryIn, fmtE, shiftHours } from "../lib/utils";
import { GAS_URL } from "../data/gas";

function SalaryTab({ data, persist, setModal, gSt, toast }) {
  const [salYM, setSalYM] = useState(curYM());
  const [notifying, setNotifying] = useState(null); // 발송 중인 staffId

  // 💰 월급 준비 푸시 알림 (GAS notifyPay)
  const sendPayNotify = async (st, amount) => {
    if (!confirm(`${st.name}에게 "월급 준비됐어요" 알림을 보낼까요?\n(${salYM} · €${fmtE(amount)})`)) return;
    setNotifying(st.id);
    try {
      const res = await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({
          pushAction: "notifyPay",
          staffId: st.id,
          memo: `${salYM} 급여 €${fmtE(amount)} 준비 완료 — 확인해주세요!`
        }),
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        redirect: "follow"
      });
      const j = JSON.parse(await res.text());
      if (j.ok && j.sent > 0) toast(`✅ ${st.name}에게 알림 전송! (기기 ${j.sent}대)`);
      else if (j.ok) toast(`⚠️ ${st.name} 알림 미구독 — 직원 화면에서 "알림 켜기" 필요`);
      else toast("❌ 전송 실패: " + (j.error || "알 수 없는 오류"));
    } catch (e) {
      toast("❌ 전송 실패 — 인터넷 확인");
    } finally {
      setNotifying(null);
    }
  };
  const shifts = (data.shifts||[]).filter(s => s.date.startsWith(salYM));
  const map = {};
  shifts.forEach(s => {
    if (!map[s.staffId]) map[s.staffId] = [];
    map[s.staffId].push(s);
  });
  const rows = [];
  let total = 0;
  (data.staff||[]).forEach(st => {
    let h = 0;
    (map[st.id]||[]).forEach(s => { h += shiftHours(s); });
    const pay = h * st.wage;
    total += pay;
    rows.push({ st, h, pay, cnt: (map[st.id]||[]).length });
  });
  // 그달 급여 €0(근무 없음 or 시급 0)은 목록에서 숨김 — 사장님 요청(보기 편하게)
  const visRows = rows.filter(r => r.pay > 0);
  const pending = (data.payrollRecords||[]).filter(p =>
    p.adjType && p.adjType !== "없음" && p.adjAmount > 0 && nextYM(p.ym) === salYM
  );
  const prSorted = [...(data.payrollRecords||[])].sort((a, b) =>
    b.ym.localeCompare(a.ym) || a.staffId - b.staffId
  );

  return (
    <div>
      <div className="fr" style={{marginBottom:12}}>
        <div>
          <label>조회 월</label>
          <input type="month" value={salYM} onChange={e=>setSalYM(e.target.value)} style={{width:180}} />
        </div>
      </div>
      {pending.length > 0 ? (
        <div style={{borderRadius:9,padding:"12px 14px",marginBottom:12,background:"rgba(255,107,53,.12)",border:"1px solid rgba(255,107,53,.4)"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#d94c1a",marginBottom:7}}>⚠️ 이번달 반영할 조정금액!</div>
          {pending.map(p => {
            const st = gSt(p.staffId);
            // 옛날 "추가"도 "추가지급"과 같이 처리
            const isAdd = p.adjType === "추가지급" || p.adjType === "추가";
            const sign = isAdd ? "+" : "-";
            const col = isAdd ? "#20a060" : "#e63946";
            const label = isAdd ? "추가지급" : "차감";
            return (
              <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#fff",border:"1px solid #ffd4bb",borderRadius:6,padding:"7px 10px",marginBottom:5}}>
                <div style={{color:"#1a1a1a"}}>
                  <span className="dot" style={{background:st?.color||"#666"}} />
                  <strong style={{color:"#1a1a1a"}}>{st?.name||"?"}</strong>
                  <span className={"badge " + (isAdd ? "bgrn" : "bred")} style={{marginLeft:6}}>{label}</span>
                  {p.adjDesc ? <span style={{fontSize:10,color:"#888",marginLeft:6}}>· {p.adjDesc}</span> : null}
                </div>
                <strong style={{color:col,fontFamily:"monospace"}}>{sign}€{fmtE(p.adjAmount)}</strong>
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="g3" style={{marginBottom:12}}>
        {visRows.map(r => (
          <div key={r.st.id} className="chip">
            <div className="lb"><span className="dot" style={{background:r.st.color}} />{r.st.name}</div>
            <div className="vl">€{fmtE(r.pay)}</div>
            <div className="sb">{r.h}h · {r.cnt}회</div>
          </div>
        ))}
        <div className="chip" style={{border:"1px solid #f5c518"}}>
          <div className="lb">전체</div>
          <div className="vl">€{fmtE(total)}</div>
          <div className="sb">{salYM}</div>
        </div>
      </div>
      <div className="card" style={{marginBottom:12}}>
        <div className="ct">급여 상세</div>
        <table className="tbl">
          <thead><tr><th>직원</th><th>시간</th><th>시급</th><th>급여</th><th>횟수</th></tr></thead>
          <tbody>
            {visRows.map(r => (
              <tr key={r.st.id}>
                <td><span className="dot" style={{background:r.st.color}} /><strong>{r.st.name}</strong></td>
                <td>{r.h}h</td>
                <td className="mn">€{fmtE(r.st.wage)}/h</td>
                <td className="pos">€{fmtE(r.pay)}</td>
                <td style={{color:"#888"}}>{r.cnt}회</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card" style={{border:"1px solid rgba(77,171,247,.3)", marginBottom:12}}>
        <div className="ct" style={{color:"#1971c2",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>💰 {salYM} 지급 관리</span>
          <span style={{fontSize:10,color:"#888",fontWeight:400,textTransform:"none",letterSpacing:0}}>
            {(() => {
              let paidCnt = 0, readyCnt = 0;
              rows.forEach(r => {
                const pay = (data.payments||[]).find(p => p.staffId===r.st.id && p.ym===salYM);
                if (!pay) return;
                const status = pay.status || (pay.paid ? "paid" : "none");
                if (status === "paid") paidCnt++;
                else if (status === "ready") readyCnt++;
              });
              return `✓${paidCnt}  📦${readyCnt}  /${rows.length}`;
            })()}
          </span>
        </div>
        {rows.length === 0 ? (
          <p style={{color:"#888",fontSize:12}}>이 달에 근무한 직원 없음</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>직원</th>
                <th>지급액</th>
                <th>방법</th>
                <th>지급일</th>
                <th>상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const pay = (data.payments||[]).find(p => p.staffId===r.st.id && p.ym===salYM);
                const status = pay ? (pay.status || (pay.paid ? "paid" : "none")) : "none";
                const paid = status === "paid";
                const ready = status === "ready";
                // 이번달 급여 레코드(확정/실근무) — 회계사 리포트
                const myRec = (data.payrollRecords||[]).find(p => p.staffId===r.st.id && p.ym===salYM);
                // 지난달 조정이 이번달에 반영될 carry-in (차감 음수 / 추가 양수)
                const ci = getCarryIn(data.payrollRecords, r.st.id, salYM);
                const adjustment = ci.rec;
                const isAdd = ci.isAdd;
                const adjAmt = Math.abs(ci.amount);
                // 명세서 확정값(있으면) 아니면 스케줄급여
                const baseConfirm = (myRec && myRec.amount != null) ? myRec.amount : r.pay;
                // 실근무 정산액(있으면) 아니면 스케줄급여 — 여기에 carry-in 반영
                const actualBase = (myRec && myRec.actualAmount != null) ? myRec.actualAmount : r.pay;
                const hasActual = myRec && myRec.actualAmount != null;
                const settleNow = actualBase + ci.amount; // 이번달 실정산
                // 표시 지급액: 확정값 기준(명세서대로 지급), 레코드 없으면 스케줄±carry-in
                const finalPay = myRec ? baseConfirm : (actualBase + ci.amount);
                const carryOut = (myRec && myRec.carryToNext != null) ? myRec.carryToNext : null;
                return (
                  <tr key={r.st.id}>
                    <td>
                      <span className="dot" style={{background:r.st.color}} />
                      <strong>{r.st.name}</strong>
                    </td>
                    <td className="mn" style={{color:paid?"#888":"#1971c2",fontWeight:600,textDecoration:paid?"line-through":"none"}}>
                      €{pay ? fmtE(pay.amount || finalPay) : fmtE(finalPay)}
                      {(hasActual || adjustment || carryOut != null) ? (
                        <div style={{fontSize:10,fontWeight:400,color:"#888",marginTop:2,lineHeight:1.6}}>
                          {hasActual ? (
                            <div>확정 <strong style={{color:"#4ecdc4"}}>€{fmtE(baseConfirm)}</strong> · 실정산 <strong style={{color:"#1971c2"}}>€{fmtE(settleNow)}</strong></div>
                          ) : adjustment ? (
                            <div>기본 €{fmtE(r.pay)} {isAdd ? "+" : "-"} €{fmtE(adjAmt)}
                              <span style={{color: isAdd ? "#20a060" : "#e63946", marginLeft:4, fontSize:9}}>{isAdd ? "(추가지급)" : "(차감)"}</span>
                            </div>
                          ) : null}
                          {adjustment ? (
                            <div>↪ 지난달 {isAdd?"추가":"차감"} {isAdd?"+":"-"}€{fmtE(adjAmt)} 반영</div>
                          ) : null}
                          {carryOut != null && Math.abs(carryOut) > 0 ? (
                            <div>↩ {nextYM(salYM)} 이월 <strong style={{color: carryOut>=0 ? "#e63946" : "#20a060"}}>{carryOut>=0 ? "-" : "+"}€{fmtE(Math.abs(carryOut))}</strong></div>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {pay && pay.method ? (
                        <span className={"badge " + (
                          pay.method==="회사통장" ? "bblu" :
                          pay.method==="현금" ? "bgrn" :
                          pay.method==="계좌이체" ? "bprp" : "bgry"
                        )}>{pay.method}</span>
                      ) : <span style={{color:"#bbb",fontSize:11}}>—</span>}
                    </td>
                    <td className="mn" style={{fontSize:11,color:paid?"#666":"#bbb"}}>
                      {pay && pay.paidDate ? pay.paidDate : "—"}
                    </td>
                    <td>
                      {paid ? (
                        <span className="badge bgrn">✓ 지급완료</span>
                      ) : ready ? (
                        <span className="badge bylw">📦 준비완료</span>
                      ) : (
                        <span className="badge bred">미지급</span>
                      )}
                    </td>
                    <td>
                      <button
                        className={"btn " + (paid ? "bs" : "bp") + " sm"}
                        onClick={()=>setModal({
                          type:"editPayment",
                          staffId:r.st.id,
                          ym:salYM,
                          defaultAmount:finalPay,
                          baseAmount: r.pay,
                          settleNow: hasActual ? settleNow : null,
                          carryOut,
                          adjustment: adjustment ? {
                            isAdd, amount: adjAmt, desc: adjustment.adjDesc
                          } : null
                        })}>
                        {paid ? "수정" : ready ? "지급완료로" : "지급체크"}
                      </button>
                      <button
                        className="btn bs sm"
                        style={{marginTop:4,display:"block"}}
                        disabled={notifying === r.st.id}
                        title="월급 준비 푸시 알림 보내기"
                        onClick={()=>sendPayNotify(r.st, pay ? (pay.amount || finalPay) : finalPay)}>
                        {notifying === r.st.id ? "⏳ 전송중" : "💰 알림"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="card" style={{border:"1px solid rgba(78,205,196,.3)"}}>
        <div className="ct" style={{color:"#4ecdc4",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>📋 회계사 리포트</span>
          <button className="btn bs sm" onClick={()=>setModal({type:"addPayroll", ym:salYM})}>+ 추가</button>
        </div>
        {prSorted.length === 0 ? (
          <p style={{color:"#888",fontSize:12}}>없음</p>
        ) : (
          <table className="tbl">
            <thead><tr><th>직원</th><th>월</th><th>확정급여</th><th>실근무</th><th>조정</th><th>반영월</th><th></th></tr></thead>
            <tbody>
              {prSorted.map(p => {
                const st = gSt(p.staffId);
                const ha = p.adjType && p.adjType !== "없음" && p.adjAmount > 0;
                const isAdd = p.adjType === "추가지급" || p.adjType === "추가";
                const ac = isAdd ? "#20a060" : "#e63946";
                const as = isAdd ? "+" : "-";
                // 이 레코드 달의 전월 반영(carry-in) → 반영 후 금액
                const rci = getCarryIn(data.payrollRecords, p.staffId, p.ym);
                const afterCarry = p.actualAmount != null ? (p.actualAmount + rci.amount) : null;
                return (
                  <tr key={p.id}>
                    <td><span className="dot" style={{background:st?.color||"#666"}} />{st?.name||"?"}</td>
                    <td style={{fontWeight:600}}>{p.ym}</td>
                    <td className="mn" style={{color:"#1971c2"}}>€{fmtE(p.amount)}</td>
                    <td className="mn" style={{color:"#888"}}>
                      {p.actualAmount != null ? "€"+fmtE(p.actualAmount) : "—"}
                      {p.actualAmount != null && rci.amount !== 0 ? (
                        <div style={{fontSize:9,color:"#999",fontWeight:400}}>지난달 {rci.isAdd?"+":"-"}€{fmtE(Math.abs(rci.amount))} → €{fmtE(afterCarry)}</div>
                      ) : null}
                    </td>
                    <td className="mn" style={{color:ha?ac:"#888"}}>{ha ? (as+"€"+fmtE(p.adjAmount)) : "—"}</td>
                    <td style={{fontSize:11,color:"#d94c1a"}}>{ha ? nextYM(p.ym) : "—"}</td>
                    <td>
                      <button className="btn bs sm" onClick={()=>setModal({type:"addPayroll", editRec:p, ym:p.ym})}>수정</button>
                      <button className="btn bd sm" style={{marginLeft:3}} onClick={async()=>await persist({...data, payrollRecords:(data.payrollRecords||[]).filter(r=>r.id!==p.id)})}>삭제</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export { SalaryTab };
