import { useState, Fragment } from "react";
import { curYM, nextYM, getCarryIn, fmtE, shiftHours, todayStr } from "../lib/utils";
import { GAS_URL } from "../data/gas";

// ═══ 연간 근무일수 (단기고용 70일 한도 관리) ═══
// 카운트는 실제 근무기록 기준 — 임의 제외 불가. 한도가 다가오면 미리 경고해서
// 시프트를 나누거나 미니잡 전환을 결정할 수 있게 한다.
const KURZ_LIMIT = 70;
function yearDayStats(shifts, staffId, year, today, kurzStart) {
  // kurzStart(공식 계약 시작일) 이전 근무는 카운트에서 제외 — 등록된 고용 기준으로 관리
  const from = kurzStart && kurzStart > `${year}-01-01` ? kurzStart : `${year}-01-01`;
  const used = new Set(), future = new Set();
  (shifts || []).forEach(s => {
    if (s.staffId !== staffId || !s.date.startsWith(year) || s.date < from) return;
    (s.date <= today ? used : future).add(s.date);
  });
  const start = new Date(from);
  const weeksElapsed = Math.max((new Date(today) - start) / 6048e5, 1);
  const weeksRemain = Math.max((new Date(`${year}-12-31`) - new Date(today)) / 6048e5, 0);
  const pace = used.size / weeksElapsed; // 일/주
  const yearEndEst = used.size + Math.max(future.size, Math.round(pace * weeksRemain));
  return { used: used.size, future: future.size, pace, yearEndEst };
}

// 수령확인서(Quittung) — 이름·기간·시간·금액을 quittung.html에 넘겨 새 창(브라우저)으로 연다.
// window.open+document.write 방식은 PWA에서 닫기 버튼이 없어 갇히는 문제가 있어 실제 URL 방식 사용.
function printQuittung(st, ym, hours, amount) {
  const q = new URLSearchParams({ name: st.name, ym, h: String(hours), amt: fmtE(amount) });
  const a = document.createElement("a");
  a.href = `/quittung.html?${q.toString()}`;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function SalaryTab({ data, persist, setModal, gSt, toast }) {
  const [salYM, setSalYM] = useState(curYM());
  const [notifying, setNotifying] = useState(null); // 발송 중인 staffId
  const [expanded, setExpanded] = useState(null); // 지급 관리에서 상세 펼친 staffId

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
      if (j.ok && j.sent > 0) toast(`${st.name}에게 알림 전송 (기기 ${j.sent}대)`);
      else if (j.ok) toast(`${st.name} 알림 미구독 — 직원 화면에서 "알림 켜기" 필요`);
      else toast("전송 실패: " + (j.error || "알 수 없는 오류"));
    } catch (e) {
      toast("전송 실패 — 인터넷 확인");
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

  // 연간 근무일수 집계 (올해, 근무기록 있는 직원만)
  const year = String(new Date().getFullYear());
  const today = todayStr();
  const dayRows = (data.staff||[])
    .filter(st => st.empType !== "mini") // 미니잡 직원은 70일 한도 대상이 아님
    .map(st => ({ st, ...yearDayStats(data.shifts, st.id, year, today, st.kurzStart) }))
    .filter(r => r.used + r.future > 0)
    .sort((a, b) => b.used - a.used);

  // 지급 관리 정렬: 미지급 → 준비완료 → 지급완료 (아직 줄 돈이 있는 사람이 위로)
  const payStatusOf = (r) => {
    const pay = (data.payments||[]).find(p => p.staffId===r.st.id && p.ym===salYM);
    return pay ? (pay.status || (pay.paid ? "paid" : "none")) : "none";
  };
  const PAY_ORDER = { none: 0, ready: 1, paid: 2 };
  const payRows = [...visRows].sort((a, b) => PAY_ORDER[payStatusOf(a)] - PAY_ORDER[payStatusOf(b)]);

  // lexware/엑셀 입력용 복사 (탭 구분 → 붙여넣으면 표로 들어감)
  const copyLexware = () => {
    const head = "직원\t근무일\t시간\t시급(€)\t총액 브루토(€)";
    const lines = visRows.map(r => `${r.st.name}\t${r.cnt}\t${r.h}\t${fmtE(r.st.wage)}\t${fmtE(r.pay)}`);
    navigator.clipboard.writeText([head, ...lines].join("\n"))
      .then(() => toast(`${salYM} 정산 ${visRows.length}명 복사됨 — lexware/엑셀에 붙여넣기`))
      .catch(() => toast("복사 실패"));
  };

  return (
    <div className="salary-compact">
      <style>{`
        .salary-compact .card{padding:10px 12px;margin-bottom:8px}
        .salary-compact .ct{margin-bottom:8px}
        .salary-compact .tbl{font-size:11px}
        .salary-compact .tbl th{padding:4px 6px;font-size:9px}
        .salary-compact .tbl td{padding:4px 6px}
        .salary-compact .chip{padding:6px 9px;border-radius:6px}
        .salary-compact .chip .vl{font-size:13px}
        .salary-compact .chip .lb{margin-bottom:1px}
        .salary-compact .chip .sb{font-size:9px;margin-top:0}
        .salary-compact .btn.sm{padding:3px 8px;font-size:10px}
        .salary-compact .badge{font-size:9px;padding:2px 6px}
      `}</style>
      <div className="fr" style={{marginBottom:8}}>
        <div>
          <label>조회 월</label>
          <input type="month" value={salYM} onChange={e=>setSalYM(e.target.value)} style={{width:150,padding:"5px 8px",fontSize:12}} />
        </div>
      </div>
      {pending.length > 0 ? (
        <div style={{borderRadius:8,padding:"8px 10px",marginBottom:8,background:"rgba(255,107,53,.12)",border:"1px solid rgba(255,107,53,.4)"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#d94c1a",marginBottom:5}}>이번달 반영할 조정금액</div>
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
      <div className="card">
        <table className="tbl">
          <thead><tr><th>직원</th><th>급여</th><th>시간</th><th>횟수</th></tr></thead>
          <tbody>
            {visRows.map(r => (
              <tr key={r.st.id}>
                <td><span className="dot" style={{background:r.st.color}} /><strong>{r.st.name}</strong></td>
                <td className="mn" style={{fontWeight:600}}>€{fmtE(r.pay)}</td>
                <td style={{color:"#888"}}>{r.h}h</td>
                <td style={{color:"#888"}}>{r.cnt}회</td>
              </tr>
            ))}
            <tr style={{borderTop:"2px solid #e0e0e0"}}>
              <td style={{fontWeight:700}}>전체 ({salYM})</td>
              <td className="mn" style={{fontWeight:700,color:"#b8860b"}}>€{fmtE(total)}</td>
              <td style={{color:"#888"}}>{visRows.reduce((t,r)=>t+r.h,0)}h</td>
              <td style={{color:"#888"}}>{visRows.reduce((t,r)=>t+r.cnt,0)}회</td>
            </tr>
          </tbody>
        </table>
      </div>
      {dayRows.length > 0 ? (
        <div className="card" style={{border:"1px solid rgba(245,197,24,.35)"}}>
          <div className="ct" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>{year} 근무일수 — 단기고용 70일 관리</span>
            <span style={{fontSize:10,color:"#888",fontWeight:400,textTransform:"none",letterSpacing:0}}>미니잡 설정 직원 제외</span>
          </div>
          <table className="tbl">
            <thead><tr><th>직원</th><th>사용</th><th>예정</th><th>페이스</th><th>연말 예상</th><th>상태</th></tr></thead>
            <tbody>
              {dayRows.map(r => {
                const over = r.used >= KURZ_LIMIT;
                const red = !over && r.used >= 67;
                const ylw = !over && !red && r.used >= 60;
                const estOver = r.yearEndEst > KURZ_LIMIT;
                const col = over || red ? "#e03131" : ylw ? "#e8590c" : "#2f9e44";
                return (
                  <tr key={r.st.id}>
                    <td>
                      <span className="dot" style={{background:r.st.color}} /><strong>{r.st.name}</strong>
                      {r.st.kurzStart ? <div style={{fontSize:9,color:"#999"}}>{r.st.kurzStart}부터</div> : null}
                    </td>
                    <td className="mn" style={{color:col,fontWeight:700}}>{r.used}/{KURZ_LIMIT}일</td>
                    <td className="mn" style={{color:"#888"}}>{r.future > 0 ? `+${r.future}일` : "—"}</td>
                    <td className="mn" style={{color:"#888"}}>주 {r.pace.toFixed(1)}회</td>
                    <td className="mn" style={{color: estOver ? "#e03131" : "#888"}}>~{r.yearEndEst}일</td>
                    <td>
                      {over ? <span className="badge bred">70일 초과 — 미니잡 전환</span>
                        : red ? <span className="badge bred">임박 — 시프트 조절</span>
                        : ylw ? <span className="badge bylw">주의</span>
                        : estOver ? <span className="badge bylw">초과 예상</span>
                        : <span className="badge bgrn">여유</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{fontSize:10,color:"#999",margin:"6px 0 0"}}>
            근무기록 기준 자동 집계 (다른 곳 단기 알바 일수는 별도 합산). 60일·67일 경고 — 넘을 것 같으면 시프트를 나누거나 해당 직원만 미니잡으로 전환.
          </p>
        </div>
      ) : null}
      <div className="card" style={{border:"1px solid rgba(77,171,247,.3)"}}>
        <div className="ct" style={{color:"#1971c2",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>{salYM} 지급 관리</span>
          <span style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:10,color:"#888",fontWeight:400,textTransform:"none",letterSpacing:0}}>
              {(() => {
                let paidCnt = 0, readyCnt = 0;
                visRows.forEach(r => {
                  const pay = (data.payments||[]).find(p => p.staffId===r.st.id && p.ym===salYM);
                  if (!pay) return;
                  const status = pay.status || (pay.paid ? "paid" : "none");
                  if (status === "paid") paidCnt++;
                  else if (status === "ready") readyCnt++;
                });
                return `완료 ${paidCnt} · 준비 ${readyCnt} / ${visRows.length}`;
              })()}
            </span>
            <button className="btn bs sm" onClick={copyLexware} title="탭 구분 텍스트로 복사 — lexware/엑셀에 붙여넣기">lexware 복사</button>
          </span>
        </div>
        {visRows.length === 0 ? (
          <p style={{color:"#888",fontSize:12}}>이 달에 근무한 직원 없음</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>직원</th>
                <th>지급액</th>
                <th>상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {payRows.map(r => {
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
                const isOpen = expanded === r.st.id;
                return (
                  <Fragment key={r.st.id}>
                    <tr onClick={()=>setExpanded(isOpen ? null : r.st.id)} style={{cursor:"pointer"}}>
                      <td>
                        <span className="dot" style={{background:r.st.color}} />
                        <strong>{r.st.name}</strong>
                      </td>
                      <td className="mn" style={{color:paid?"#888":"#1971c2",fontWeight:600,textDecoration:paid?"line-through":"none"}}>
                        €{pay ? fmtE(pay.amount || finalPay) : fmtE(finalPay)}
                        <span style={{fontSize:9,color:"#bbb",marginLeft:5}}>{isOpen ? "▲" : "▼"}</span>
                      </td>
                      <td>
                        {paid ? (
                          <span className="badge bgrn">지급완료</span>
                        ) : ready ? (
                          <span className="badge bylw">준비완료</span>
                        ) : (
                          <span className="badge bred">미지급</span>
                        )}
                      </td>
                      <td style={{whiteSpace:"nowrap"}} onClick={e=>e.stopPropagation()}>
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
                          {paid ? "수정" : ready ? "완료" : "지급"}
                        </button>
                        <button
                          className="btn bs sm"
                          style={{marginLeft:3}}
                          disabled={notifying === r.st.id}
                          title="월급 준비 푸시 알림 보내기"
                          onClick={()=>sendPayNotify(r.st, pay ? (pay.amount || finalPay) : finalPay)}>
                          {notifying === r.st.id ? "전송중" : "알림"}
                        </button>
                        <button
                          className="btn bs sm"
                          style={{marginLeft:3}}
                          title="현금 수령확인서 인쇄 (자동 채움)"
                          onClick={()=>printQuittung(r.st, salYM, r.h, pay ? (pay.amount || finalPay) : finalPay)}>
                          수령증
                        </button>
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr>
                        <td colSpan={4} style={{background:"#f8f9fa",fontSize:11,color:"#666",lineHeight:1.9,padding:"8px 12px"}}>
                          <div>방법 {pay && pay.method ? pay.method : "—"} · 지급일 {pay && pay.paidDate ? pay.paidDate : "—"} · 근무 {r.h}h {r.cnt}회 · 시급 €{fmtE(r.st.wage)} (기본 €{fmtE(r.pay)})</div>
                          {hasActual ? (
                            <div>확정 <strong style={{color:"#4ecdc4"}}>€{fmtE(baseConfirm)}</strong> · 실정산 <strong style={{color:"#1971c2"}}>€{fmtE(settleNow)}</strong></div>
                          ) : null}
                          {adjustment ? (
                            <div>지난달 {isAdd?"추가지급":"차감"} <span style={{color: isAdd ? "#20a060" : "#e63946",fontWeight:600}}>{isAdd?"+":"-"}€{fmtE(adjAmt)}</span> 반영{adjustment.adjDesc ? ` · ${adjustment.adjDesc}` : ""}</div>
                          ) : null}
                          {carryOut != null && Math.abs(carryOut) > 0 ? (
                            <div>{nextYM(salYM)} 이월 <span style={{color: carryOut>=0 ? "#e63946" : "#20a060",fontWeight:600}}>{carryOut>=0 ? "-" : "+"}€{fmtE(Math.abs(carryOut))}</span></div>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="card" style={{border:"1px solid rgba(78,205,196,.3)"}}>
        <div className="ct" style={{color:"#4ecdc4",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>회계사 리포트</span>
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
