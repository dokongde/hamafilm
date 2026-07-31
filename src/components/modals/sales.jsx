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

function CashOutModal({ modal, data, persist, close, toast }) {
  const sh = modal.shift;
  const isOpening = sh.slotType === "오프닝";
  const [cash, setCash] = useState(sh.cashCount != null ? String(sh.cashCount) : "");
  const [memo, setMemo] = useState(sh.cashMemo || "");
  // 무료/할인/재촬영 자가기록
  const [report, setReport] = useState(Array.isArray(sh.report) ? sh.report : []);
  const [rKind, setRKind] = useState("free");
  const [rFull, setRFull] = useState("");
  const [rPaid, setRPaid] = useState("");
  const [rNote, setRNote] = useState("");
  const addReport = () => {
    const full = parseFloat(rFull) || 0;
    const paid = parseFloat(rPaid) || 0;
    setReport([...report, { kind: rKind, full, paid, note: (rNote || "").trim() }]);
    setRFull(""); setRPaid(""); setRNote(""); setRKind("free");
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
        if (j && j.ok && j.sumup && j.lucent && !sErr && !lErr && typeof j.gap === "number") {
          setCheck({ loaded: true, sumup: j.sumup, lucent: j.lucent, gap: j.gap });
        } else {
          setCheck({ error: true });
        }
      })
      .catch(() => { if (alive) setCheck({ error: true }); });
    return () => { alive = false; };
  }, []);
  // 리포트로 설명된 금액 → 미설명 = gap − 설명 (실시간)
  const reportExplained = report.reduce((a, r) => a + Math.max((Number(r.full)||0) - (Number(r.paid)||0), 0), 0);
  const gap = (check && check.loaded) ? check.gap : null;
  const unexplained = gap != null ? (gap - reportExplained) : null;
  const cState = check == null ? "loading" : check.error ? "error"
    : (unexplained >= 5 ? "red" : unexplained >= 1 ? "orange" : "green");
  const cColor = cState === "red" ? "#e03131" : cState === "orange" ? "#e8590c" : cState === "green" ? "#2f9e44" : "#888";

  const save = async () => {
    const amt = cash === "" ? null : (parseFloat(cash) || 0);
    const updated = { ...sh, cashCount: amt, cashMemo: (memo || "").trim(), report };
    if (check && check.loaded) {
      updated.checkGap = check.gap;
      updated.checkUnexplained = unexplained;
      updated.checkConfirmed = !!checkConfirmed;
      updated.checkLucentEur = check.lucent.eur;
      updated.checkSumupEur = check.sumup.eur;
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
    toast(`✅ 퇴근 완료 (${modal.outTime})`);
    close();
  };
  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>🔴 퇴근 · 서랍 현금 입력</h3>
        <div style={{fontSize:12,color:"#555",marginBottom:8}}>
          <span className={"badge " + (isOpening ? "bylw" : "bgrn")} style={{marginRight:6}}>{sh.slotType}</span>
          {sh.date} · 퇴근 {modal.outTime}
        </div>
        <div style={{fontSize:11,color:"#666",background:"#f5f5f7",borderRadius:8,padding:10,marginBottom:12}}>
          {isOpening
            ? "🔑 지금 서랍의 현금 총액을 세서 입력하세요. (클로징에게 넘기는 인계 금액)"
            : "🌙 마감 서랍의 현금 총액을 세서 입력하세요. (오늘 마감 금액)"}
        </div>

        {/* 실시간 대사 (오늘 루센트 vs 결제) */}
        {cState === "loading" ? (
          <div style={{fontSize:11,color:"#888",background:"#f5f5f7",borderRadius:8,padding:10,marginBottom:12}}>⏳ 오늘 루센트↔결제 실시간 대조 확인 중…</div>
        ) : cState === "error" ? (
          <div style={{fontSize:11,color:"#1971c2",background:"rgba(77,171,247,.08)",border:"1px solid rgba(77,171,247,.3)",borderRadius:8,padding:10,marginBottom:12}}>ℹ️ 실시간 확인 준비중 — 야간 대조로 잡혀요. 서랍 현금·기록은 그대로 입력하세요.</div>
        ) : (
          <div style={{border:`1.5px solid ${cColor}`, background: cState==="green"?"rgba(47,158,68,.06)":cState==="orange"?"rgba(232,89,12,.06)":"rgba(255,107,107,.06)", borderRadius:8, padding:10, marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:700,color:cColor,marginBottom:3}}>
              {cState==="green" ? "🟢 결제와 맞아요" : cState==="orange" ? "🟠 살짝 차이 (참고)" : "🔴 결제와 안 맞아요"}
            </div>
            <div style={{fontSize:11,color:"#555",marginBottom:unexplained>=1?6:0}}>
              루센트 €{fmtE(check.lucent.eur)} ({check.lucent.count}건) vs 결제 €{fmtE(check.sumup.eur)} ({check.sumup.count}건)
              {reportExplained>0 ? ` · 기록설명 €${fmtE(reportExplained)}` : ""}
            </div>
            {unexplained >= 1 ? (
              <>
                <div style={{fontSize:11,fontWeight:600,color:cColor,marginBottom:6}}>
                  ❓ €{fmtE(unexplained)} 안 맞아요 — {cState==="red" ? "안 넣은 결제/무료/재촬영이 있나요? 아래에 기록하면 줄어들어요." : "가격 추정 오차일 수 있어요. 확인만 해주세요."}
                </div>
                <label style={{fontSize:11,display:"flex",alignItems:"center",gap:5,cursor:"pointer"}}>
                  <input type="checkbox" checked={checkConfirmed} onChange={e=>setCheckConfirmed(e.target.checked)} />
                  확인했습니다 (더 없음 / 사유 기록함)
                </label>
              </>
            ) : (
              <div style={{fontSize:11,color:"#2f9e44"}}>기록 설명까지 반영해 맞습니다 👍</div>
            )}
          </div>
        )}

        <div className="fr">
          <div>
            <label>서랍 현금 총액 €</label>
            <input type="number" inputMode="decimal" autoFocus value={cash} onChange={e=>setCash(e.target.value)} placeholder="지금 센 금액" />
          </div>
        </div>
        <div className="fr">
          <div>
            <label>메모 (선택)</label>
            <input type="text" value={memo} onChange={e=>setMemo(e.target.value)} placeholder="예: 거스름돈 부족 / 재촬영 2건 등" />
          </div>
        </div>
        <div style={{fontSize:10,color:"#aaa",marginBottom:12}}>* 금액 없이 완료해도 퇴근은 처리돼요. (관리자 대사에서 확인)</div>

        {/* 무료/할인/재촬영 자가기록 */}
        <div style={{borderTop:"1px solid #eee",paddingTop:10}}>
          <div style={{fontSize:12,fontWeight:700,color:"#b8860b",marginBottom:2}}>📸 오늘 무료/할인/재촬영 기록 (선택)</div>
          <div style={{fontSize:10,color:"#888",marginBottom:8}}>사진은 찍혔는데 SumUp 결제가 €0이거나 일부만 된 경우를 적어주세요. (원가 → 실제 받은 금액)</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}>
            {REPORT_KINDS.map(x => (
              <button key={x.k} onClick={()=>setRKind(x.k)}
                style={{padding:"4px 8px",borderRadius:12,fontSize:11,cursor:"pointer",
                  border: rKind===x.k ? "1px solid #4dabf7" : "1px solid #ddd",
                  background: rKind===x.k ? "rgba(77,171,247,.12)" : "#fff",
                  color: rKind===x.k ? "#1971c2" : "#666", fontWeight: rKind===x.k ? 700 : 400}}>
                {x.label}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:8}}>
            <input type="number" value={rFull} onChange={e=>setRFull(e.target.value)} placeholder="원가 €" style={{width:78}} />
            <span style={{color:"#888"}}>→</span>
            <input type="number" value={rPaid} onChange={e=>setRPaid(e.target.value)} placeholder="받은 €" style={{width:78}} />
            <input type="text" value={rNote} onChange={e=>setRNote(e.target.value)} placeholder="메모(선택)" style={{width:110}} />
            <button className="btn bp sm" onClick={addReport}>+ 추가</button>
          </div>
          {report.length > 0 ? (
            <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:4}}>
              {report.map((r, i) => (
                <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:12,background:"#f5f5f7",borderRadius:6,padding:"4px 8px"}}>
                  <span>{reportKindLabel(r.kind)} · €{fmtE(r.full)}→€{fmtE(r.paid)} <span style={{color:"#2f9e44"}}>(할인 €{fmtE(Math.max((Number(r.full)||0)-(Number(r.paid)||0),0))})</span>{r.note ? ` · ${r.note}` : ""}</span>
                  <button className="btn bd sm" onClick={()=>removeReport(i)}>삭제</button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mf">
          <button className="btn bs" onClick={close}>취소</button>
          <button className="btn bp" onClick={save}>퇴근 완료</button>
        </div>
      </div>
    </div>
  );
}

export { AddSalesModal, CashOutModal };
