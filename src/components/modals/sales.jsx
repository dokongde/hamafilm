import { useState, useEffect } from "react";
import { todayStr, fmtE, nid, REPORT_KINDS, reportKindLabel } from "../../lib/utils";
import { GAS_URL } from "../../data/gas";

function AddSalesModal({ data, persist, close, toast }) {
  const [date, setDate] = useState(todayStr());
  const [v, setV] = useState({pc:0,pk:0,mc:0,mk:0,ac:0,ak:0,nc:0,nk:0,jc:0,jk:0,sk:0});
  const upd = (k, val) => setV(p => ({...p, [k]: parseInt(val) || 0}));
  const save = async () => {
    if (!date) { toast("날짜 입력"); return; }
    await persist({...data, sales: [...(data.sales||[]), {id: nid(data.sales||[]), date, ...v}]});
    close();
    toast("매출 저장!");
  };
  const groups = [
    {title:"💳 SUMUP", k1:"pc", l1:"현금", k2:"pk", l2:"카드"},
    {title:"🖨 기계", k1:"mc", l1:"현금", k2:"mk", l2:"카드"},
    {title:"💍 악세서리", k1:"ac", l1:"현금", k2:"ak", l2:"카드"},
    {title:"💅 네일", k1:"nc", l1:"현금", k2:"nk", l2:"카드"},
    {title:"💎 조이스보물", k1:"jc", l1:"현금", k2:"jk", l2:"카드"}
  ];
  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>매출 입력</h3>
        <div className="fr">
          <div>
            <label>날짜</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
          </div>
        </div>
        {groups.map(g => (
          <div key={g.title} style={{background:"#f5f5f7",borderRadius:8,padding:11,marginBottom:8}}>
            <div style={{fontSize:12,fontWeight:700,color:"#f5c518",marginBottom:8}}>{g.title}</div>
            <div className="fr fc2">
              <div>
                <label>{g.l1}</label>
                <input type="number" value={v[g.k1]} onChange={e=>upd(g.k1, e.target.value)} />
              </div>
              <div>
                <label>{g.l2}</label>
                <input type="number" value={v[g.k2]} onChange={e=>upd(g.k2, e.target.value)} />
              </div>
            </div>
          </div>
        ))}
        <div style={{background:"#f5f5f7",borderRadius:8,padding:11,marginBottom:8}}>
          <div style={{fontSize:12,fontWeight:700,color:"#888",marginBottom:8}}>🔒 슈킹</div>
          <div>
            <label>금액</label>
            <input type="number" value={v.sk} onChange={e=>upd("sk", e.target.value)} />
          </div>
        </div>
        <div className="mf">
          <button className="btn bs" onClick={close}>취소</button>
          <button className="btn bp" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

// 오프닝 출근: 시작 시재(floatStart) 입력(선택) → actualStart와 함께 저장 + 출근 푸시.
// kiosk의 doCheckIn(오프닝)이 이 모달로 넘김. 시재를 입력해두면 퇴근 때 서랍 비교가 가능해짐.
function CashInModal({ modal, data, persist, close, toast }) {
  const sh = modal.shift; // {...shift, actualStart: time}
  const [cash, setCash] = useState(sh.floatStart != null ? String(sh.floatStart) : "");
  const save = async () => {
    const amt = cash === "" ? null : (parseFloat(cash) || 0);
    const updated = { ...sh };
    if (amt != null) updated.floatStart = amt;
    await persist({ ...data, shifts: (data.shifts||[]).map(x => x.id === sh.id ? updated : x) });
    // 관리자 폰 출근 푸시 (fire-and-forget)
    try {
      fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({ pushAction: "clockEvent", staffId: modal.staffId, staffName: modal.staffName || "", type: "in", time: modal.inTime, planned: modal.planned || "" }),
        headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow"
      }).catch(() => {});
    } catch (e) { /* 무시 */ }
    toast(`출근 완료 (${modal.inTime})`);
    close();
  };
  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" style={{maxWidth:360}}>
        <h3>출근 · 시작 시재</h3>
        <div style={{fontSize:12,color:"#555",marginBottom:8}}>
          <span className="badge bylw" style={{marginRight:6}}>오프닝</span>
          {sh.date} · 출근 {modal.inTime}
        </div>
        <div style={{fontSize:11,color:"#666",background:"#f5f5f7",borderRadius:8,padding:10,marginBottom:12,lineHeight:1.5}}>
          지금 서랍에 있는 현금 총액(시작 시재)을 세서 입력하세요. <strong>선택사항</strong>이지만, 입력해두면 퇴근 때 서랍이 맞는지 자동으로 비교해줘요.
        </div>
        <div className="fr">
          <div>
            <label>시작 시재 € (선택)</label>
            <input type="number" inputMode="decimal" autoFocus value={cash} onChange={e=>setCash(e.target.value)} placeholder="지금 서랍에 있는 금액" />
          </div>
        </div>
        <div style={{fontSize:10,color:"#aaa",marginBottom:12}}>* 비워두고 출근해도 돼요 (그 경우 퇴근 때 서랍 비교는 생략).</div>
        <div className="mf">
          <button className="btn bs" onClick={close}>취소 (출근 안 함)</button>
          <button className="btn bp" onClick={save}>출근 완료</button>
        </div>
      </div>
    </div>
  );
}

function CashOutModal({ modal, data, persist, close, toast }) {
  const sh = modal.shift;
  const isOpening = sh.slotType === "오프닝";
  const [cash, setCash] = useState(sh.cashCount != null ? String(sh.cashCount) : "");
  const [memo, setMemo] = useState(sh.cashMemo || "");
  const [diffReason, setDiffReason] = useState(sh.cashDiffReason || ""); // 서랍 부족 이유

  // ===== 인정직원 슈킹 자진신고: "오늘 만든 현금(안 찍은 현금)" — sanctioned 직원에게만 노출 =====
  // 안 찍고 손님 현금을 직접 받은 금액. 서랍을 거치지 않으므로 서랍 기대값 계산과는 완전 무관.
  // 사진구멍(미설명) 설명과 대사의 인정몫 확정에만 쓰임 (shift.skMade / skMadeMemo).
  const staffRec = (data.staff||[]).find(s => s.id == modal.staffId);
  const isSanctioned = !!(staffRec && staffRec.sanctioned);
  const [skMade, setSkMade] = useState(sh.skMade != null ? String(sh.skMade) : "");
  const [skMadeMemo, setSkMadeMemo] = useState(sh.skMadeMemo || "");
  const skMadeNum = (isSanctioned && skMade !== "") ? (parseFloat(skMade) || 0) : null;
  // 무료/할인/재촬영 자가기록 — 종류 + 금액(원래 가격) 한 칸. '일부 받음'일 때만 받은€ 칸 추가.
  const [report, setReport] = useState(Array.isArray(sh.report) ? sh.report : []);
  const [rKind, setRKind] = useState("reshoot");
  const [rFull, setRFull] = useState("");
  const [rPaid, setRPaid] = useState("");
  const [rPartial, setRPartial] = useState(false);
  const [rNote, setRNote] = useState("");
  const addReport = () => {
    const full = parseFloat(rFull) || 0;
    if (full <= 0) { toast("금액(€)을 먼저 넣어주세요"); return; }
    const paid = rPartial ? (parseFloat(rPaid) || 0) : 0;
    setReport([...report, { kind: rKind, full, paid, note: (rNote || "").trim() }]);
    setRFull(""); setRPaid(""); setRNote(""); setRPartial(false);
  };
  const removeReport = (i) => setReport(report.filter((_, ix) => ix !== i));

  // ===== 실시간 대사 (오늘 루센트€ vs SumUp€) =====
  // null=로딩중, {loaded, sumup, lucent, gap}=성공, {error:true}=준비중/실패
  const [check, setCheck] = useState(null);
  const [checkConfirmed, setCheckConfirmed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/today-check", { headers: { Accept: "application/json" } })
      .then(r => r.ok ? r.json() : Promise.reject(new Error("http " + r.status)))
      .then(j => {
        if (!alive) return;
        const sErr = j && j.sumup && j.sumup.error;
        const lErr = j && j.lucent && j.lucent.error;
        // 오늘 현금매출 전체(전 카테고리, CASH) — 서랍 기대액 계산용. 사진 대조와 별개로 sumup만 살아있으면 사용.
        const cEur = (j && j.sumup && !sErr && typeof j.sumup.cashEur === "number") ? j.sumup.cashEur : null;
        if (j && j.ok && j.sumup && j.lucent && !sErr && !lErr && typeof j.gap === "number") {
          setCheck({ loaded: true, sumup: j.sumup, lucent: j.lucent, gap: j.gap, cashEur: cEur });
        } else {
          setCheck({ error: true, cashEur: cEur });
        }
      })
      .catch(() => { if (alive) setCheck({ error: true }); });
    return () => { alive = false; };
  }, []);
  // 리포트 + 슈킹 신고(skMade)로 설명된 금액 → 미설명 = gap − 설명 (실시간)
  const reportExplained = report.reduce((a, r) => a + Math.max((Number(r.full)||0) - (Number(r.paid)||0), 0), 0);
  const gap = (check && check.loaded) ? check.gap : null;
  const unexplained = gap != null ? (gap - reportExplained - (skMadeNum || 0)) : null;
  const cState = check == null ? "loading" : check.error ? "error"
    : (unexplained >= 5 ? "red" : unexplained >= 1 ? "orange" : "green");
  const cColor = cState === "red" ? "#e03131" : cState === "orange" ? "#e8590c" : cState === "green" ? "#2f9e44" : "#888";

  // ===== 서랍 현금 실시간 비교 (기대 서랍액 vs 지금 센 금액) =====
  // 오프닝 퇴근: 기대 = 시작시재(floatStart) + 오늘 현금매출(cashEur 지금)
  // 클로징 퇴근: 기대 = 오프닝 인계(cashCount) + (cashEur 지금 − 오프닝 퇴근 시점 cashEur 스냅샷)
  // 계산 불가(API 실패·시재/인계 없음)면 조용히 생략 — 퇴근은 막지 않는다.
  const r2c = n => Math.round(n * 100) / 100;
  const cashEurNow = (check && typeof check.cashEur === "number") ? check.cashEur : null;
  let drawerExpected = null, drawerBasis = "";
  if (cashEurNow != null) {
    if (isOpening) {
      if (sh.floatStart != null) {
        drawerExpected = r2c(Number(sh.floatStart) + cashEurNow);
        drawerBasis = `시작 시재 €${fmtE(sh.floatStart)} + 오늘 현금매출 €${fmtE(cashEurNow)}`;
      }
    } else {
      const openSh = (data.shifts||[]).find(x => x.date === sh.date && x.slotType === "오프닝" && x.cashCount != null && typeof x.checkCashEur === "number");
      if (openSh) {
        const later = r2c(cashEurNow - openSh.checkCashEur);
        drawerExpected = r2c(Number(openSh.cashCount) + later);
        drawerBasis = `오프닝 인계 €${fmtE(openSh.cashCount)} + 이후 현금매출 €${fmtE(later)}`;
      }
    }
  }
  const cashNum = cash === "" ? null : (parseFloat(cash) || 0);
  const drawerDiff = (drawerExpected != null && cashNum != null) ? r2c(cashNum - drawerExpected) : null;
  const dState = drawerDiff == null ? null : (drawerDiff <= -2 ? "short" : (drawerDiff >= 2 ? "over" : "ok"));
  const DIFF_REASONS = ["거스름돈 실수", "사장님·인정직원 인출", "모름"];

  // ── 기록 폼 (경고 박스 안 / 하단 공용) — 종류 누르고 금액 하나만 넣으면 끝 ──
  const recordInBox = !!(check && check.loaded && (unexplained >= 1 || report.length > 0));
  const recordUI = (
    <div>
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}>
        {REPORT_KINDS.map(x => (
          <button key={x.k} onClick={()=>setRKind(x.k)}
            style={{padding:"5px 9px",borderRadius:12,fontSize:11,cursor:"pointer",
              border: rKind===x.k ? "1px solid #4dabf7" : "1px solid #ddd",
              background: rKind===x.k ? "rgba(77,171,247,.12)" : "#fff",
              color: rKind===x.k ? "#1971c2" : "#666", fontWeight: rKind===x.k ? 700 : 400}}>
            {rKind===x.k ? "✓ " : ""}{x.label}
          </button>
        ))}
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:6}}>
        <input type="number" inputMode="decimal" value={rFull} onChange={e=>setRFull(e.target.value)} placeholder="금액 €" style={{width:84}} />
        {recordInBox && unexplained >= 1 ? (
          <button className="btn bs sm" onClick={()=>setRFull(String(Math.round(unexplained * 100) / 100))}>€{fmtE(unexplained)} 전부</button>
        ) : null}
        <label style={{fontSize:11,display:"flex",alignItems:"center",gap:4,cursor:"pointer",whiteSpace:"nowrap"}}>
          <input type="checkbox" checked={rPartial} onChange={e=>{ setRPartial(e.target.checked); if (!e.target.checked) setRPaid(""); }} />
          일부 받음
        </label>
        {rPartial ? <input type="number" inputMode="decimal" value={rPaid} onChange={e=>setRPaid(e.target.value)} placeholder="받은 €" style={{width:78}} /> : null}
        <input type="text" value={rNote} onChange={e=>setRNote(e.target.value)} placeholder="메모(선택)" style={{width:100}} />
        <button className="btn bp sm" onClick={addReport}>+ 기록</button>
      </div>
      {report.length > 0 ? (
        <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:4}}>
          {report.map((r, i) => (
            <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:12,background:"#fff",border:"1px solid #eee",borderRadius:6,padding:"4px 8px"}}>
              <span>{reportKindLabel(r.kind)} · €{fmtE(r.full)}{(Number(r.paid)||0)>0?`→받음 €${fmtE(r.paid)}`:""} <span style={{color:"#2f9e44"}}>(설명 €{fmtE(Math.max((Number(r.full)||0)-(Number(r.paid)||0),0))})</span>{r.note ? ` · ${r.note}` : ""}</span>
              <button className="btn bd sm" onClick={()=>removeReport(i)}>삭제</button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  const save = async () => {
    // 차이가 남아 있으면 기록하거나 '확인' 체크를 해야 퇴근 완료 (퇴근 자체를 막지 않되 한 번은 응답)
    if (check && check.loaded && unexplained >= 1 && !checkConfirmed) {
      toast(`€${fmtE(unexplained)} 차이를 기록하거나 '확인했습니다'에 체크해주세요`);
      return;
    }
    const amt = cash === "" ? null : (parseFloat(cash) || 0);
    const updated = { ...sh, cashCount: amt, cashMemo: (memo || "").trim(), report };
    if (check && check.loaded) {
      updated.checkGap = check.gap;
      updated.checkUnexplained = unexplained;
      updated.checkConfirmed = !!checkConfirmed;
      updated.checkLucentEur = check.lucent.eur;
      updated.checkSumupEur = check.sumup.eur;
    }
    // 퇴근 시점 현금매출 스냅샷 + 서랍 차이 (계산 가능할 때만)
    if (cashEurNow != null) updated.checkCashEur = cashEurNow;
    if (drawerDiff != null) {
      updated.cashDiff = drawerDiff;
      updated.cashDiffReason = dState === "short" ? (diffReason || "") : "";
    }
    // 인정직원 슈킹 자진신고 (오늘 만든 현금 — 안 찍은 현금)
    if (isSanctioned) {
      updated.skMade = skMadeNum;
      updated.skMadeMemo = skMadeNum != null ? (skMadeMemo || "").trim() : "";
    }
    const newShifts = (data.shifts||[]).map(x => x.id === sh.id ? updated : x);
    await persist({ ...data, shifts: newShifts });
    // 관리자 폰 퇴근 푸시 (fire-and-forget)
    try {
      fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({ pushAction: "clockEvent", staffId: modal.staffId, staffName: modal.staffName || "", type: "out", time: modal.outTime, planned: modal.planned || "" }),
        headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow"
      }).catch(() => {});
    } catch (e) { /* 무시 */ }
    toast(`퇴근 완료 (${modal.outTime})`);
    close();
  };
  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>퇴근 · 서랍 현금 입력</h3>
        <div style={{fontSize:12,color:"#555",marginBottom:8}}>
          <span className={"badge " + (isOpening ? "bylw" : "bgrn")} style={{marginRight:6}}>{sh.slotType}</span>
          {sh.date} · 퇴근 {modal.outTime}
        </div>
        <div style={{fontSize:11,color:"#666",background:"#f5f5f7",borderRadius:8,padding:10,marginBottom:12}}>
          {isOpening
            ? "지금 서랍의 현금 총액을 세서 입력하세요. (클로징에게 넘기는 인계 금액)"
            : "마감 서랍의 현금 총액을 세서 입력하세요. (오늘 마감 금액)"}
        </div>

        {/* 실시간 대사 (오늘 루센트 vs 결제) */}
        {cState === "loading" ? (
          <div style={{fontSize:11,color:"#888",background:"#f5f5f7",borderRadius:8,padding:10,marginBottom:12}}>오늘 루센트↔결제 실시간 대조 확인 중…</div>
        ) : cState === "error" ? (
          <div style={{fontSize:11,color:"#1971c2",background:"rgba(77,171,247,.08)",border:"1px solid rgba(77,171,247,.3)",borderRadius:8,padding:10,marginBottom:12}}>실시간 확인 준비중 — 야간 대조로 잡혀요. 서랍 현금·기록은 그대로 입력하세요.</div>
        ) : (
          <div style={{border:`1.5px solid ${cColor}`, background: cState==="green"?"rgba(47,158,68,.06)":cState==="orange"?"rgba(232,89,12,.06)":"rgba(255,107,107,.06)", borderRadius:8, padding:10, marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:700,color:cColor,marginBottom:3}}>
              {cState==="green" ? "결제와 맞아요" : cState==="orange" ? "살짝 차이 (참고)" : "결제와 안 맞아요"}
            </div>
            <div style={{fontSize:11,color:"#555",marginBottom:unexplained>=1?6:0}}>
              루센트 €{fmtE(check.lucent.eur)} ({check.lucent.count}건) vs 결제 €{fmtE(check.sumup.eur)} ({check.sumup.count}건)
              {reportExplained>0 ? ` · 기록설명 €${fmtE(reportExplained)}` : ""}{skMadeNum>0 ? ` · 슈킹신고 €${fmtE(skMadeNum)}` : ""}
            </div>
            {unexplained >= 1 ? (
              <>
                <div style={{fontSize:11,fontWeight:600,color:cColor,marginBottom:6}}>
                  €{fmtE(unexplained)} 안 맞아요 — {cState==="red" ? "재촬영·무료 있었죠? 종류 누르고 금액만 넣으면 초록불로 바뀌어요." : "가격 추정 오차일 수 있어요. 기록할 게 없으면 아래 확인만 체크해주세요."}
                </div>
                {recordUI}
                <label style={{fontSize:11,fontWeight:700,display:"flex",alignItems:"center",gap:6,cursor:"pointer",marginTop:6,padding:"7px 9px",background:"rgba(0,0,0,.05)",borderRadius:6}}>
                  <input type="checkbox" checked={checkConfirmed} onChange={e=>setCheckConfirmed(e.target.checked)} />
                  확인했습니다 — 더 기록할 것 없어요
                </label>
              </>
            ) : (
              <>
                <div style={{fontSize:11,color:"#2f9e44"}}>기록 설명까지 반영해 맞습니다</div>
                {report.length > 0 ? <div style={{marginTop:6}}>{recordUI}</div> : null}
              </>
            )}
          </div>
        )}

        <div className="fr">
          <div>
            <label>서랍 현금 총액 €</label>
            <input type="number" inputMode="decimal" autoFocus value={cash} onChange={e=>setCash(e.target.value)} placeholder="지금 센 금액" />
          </div>
        </div>

        {/* 서랍 실시간 비교: 입력 즉시 기대액과 대조 */}
        {drawerDiff != null ? (
          dState === "short" ? (
            <div style={{border:"1.5px solid #e03131",background:"rgba(255,107,107,.06)",borderRadius:8,padding:10,marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:700,color:"#e03131",marginBottom:3}}>
                기대 €{fmtE(drawerExpected)} vs 센 금액 €{fmtE(cashNum)} — €{fmtE(-drawerDiff)} 부족해요. 이유를 알려주세요
              </div>
              <div style={{fontSize:10,color:"#888",marginBottom:8}}>기대 = {drawerBasis}</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {DIFF_REASONS.map(r => (
                  <button key={r} onClick={()=>setDiffReason(diffReason === r ? "" : r)}
                    style={{padding:"4px 10px",borderRadius:12,fontSize:11,cursor:"pointer",
                      border: diffReason===r ? "1px solid #e03131" : "1px solid #ddd",
                      background: diffReason===r ? "rgba(255,107,107,.12)" : "#fff",
                      color: diffReason===r ? "#e03131" : "#666", fontWeight: diffReason===r ? 700 : 400}}>
                    {diffReason===r ? "✓ " : ""}{r}
                  </button>
                ))}
              </div>
              <div style={{fontSize:10,color:"#888",marginTop:6}}>자세한 상황은 아래 메모에 적어주세요.</div>
            </div>
          ) : dState === "over" ? (
            <div style={{border:"1.5px solid #e8590c",background:"rgba(232,89,12,.06)",borderRadius:8,padding:10,marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:700,color:"#e8590c",marginBottom:3}}>
                기대 €{fmtE(drawerExpected)}보다 €{fmtE(drawerDiff)} 많아요
              </div>
              <div style={{fontSize:10,color:"#888"}}>미기입 현금이 서랍에 있을 수 있어요 (기대 = {drawerBasis}).</div>
            </div>
          ) : (
            <div style={{border:"1.5px solid #2f9e44",background:"rgba(47,158,68,.06)",borderRadius:8,padding:10,marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:700,color:"#2f9e44"}}>서랍 맞아요 (기대 €{fmtE(drawerExpected)})</div>
            </div>
          )
        ) : (isOpening && cashEurNow != null && sh.floatStart == null ? (
          <div style={{fontSize:10,color:"#888",background:"#f5f5f7",borderRadius:8,padding:8,marginBottom:10}}>
            시작 시재가 입력 안 돼 서랍 비교는 생략해요. 다음 출근 때 시재를 입력하면 자동으로 비교해줘요.
          </div>
        ) : null)}

        <div className="fr">
          <div>
            <label>메모 (선택)</label>
            <input type="text" value={memo} onChange={e=>setMemo(e.target.value)} placeholder="예: 거스름돈 부족 / 재촬영 2건 등" />
          </div>
        </div>
        <div style={{fontSize:10,color:"#aaa",marginBottom:12}}>* 금액 없이 완료해도 퇴근은 처리돼요. (관리자 대사에서 확인)</div>

        {/* 인정직원 슈킹 자진신고 — 오늘 만든 현금(안 찍은 현금). 서랍과 무관. */}
        {isSanctioned ? (
          <div style={{borderTop:"1px solid #eee",paddingTop:10,marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:700,color:"#1971c2",marginBottom:2}}>오늘 만든 현금(안 찍은 현금) € (선택)</div>
            <div style={{fontSize:10,color:"#888",marginBottom:8}}>
              SumUp에 안 찍고 손님 현금으로 직접 받은 금액을 기록하세요. 서랍 계산과는 무관하고, 사장님 대사에서 인정몫으로 잡혀요.
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <input type="number" inputMode="decimal" value={skMade} onChange={e=>setSkMade(e.target.value)} placeholder="오늘 만든 €" style={{width:100}} />
              <input type="text" value={skMadeMemo} onChange={e=>setSkMadeMemo(e.target.value)} placeholder="메모(선택)" style={{width:150}} />
            </div>
          </div>
        ) : null}

        {/* 무료/할인/재촬영 자가기록 — 차이 경고 박스에 이미 들어가 있으면 여기선 숨김 */}
        {!recordInBox ? (
          <div style={{borderTop:"1px solid #eee",paddingTop:10}}>
            <div style={{fontSize:12,fontWeight:700,color:"#b8860b",marginBottom:2}}>오늘 무료/할인/재촬영 기록 (선택)</div>
            <div style={{fontSize:10,color:"#888",marginBottom:8}}>사진 찍혔는데 결제가 안 됐거나 덜 된 경우 — 종류 누르고 금액(원래 가격)만 넣으면 돼요.</div>
            {recordUI}
          </div>
        ) : null}

        <div className="mf">
          <button className="btn bs" onClick={close}>취소</button>
          <button className="btn bp" onClick={save}>퇴근 완료</button>
        </div>
      </div>
    </div>
  );
}

export { AddSalesModal, CashInModal, CashOutModal };
