import { useState, useEffect, useRef } from "react";
import { dstr, getSlots, dowKo, todayStr, fmtE, nid, reportKindLabel, REPORT_KINDS } from "../lib/utils";
import { attributeGap } from "../lib/recon";

// ===== 매출 대사 (Reconciliation) — "하루 한 장" =====
// 하루 카드: 매출 / 사진 구멍(sk = 쿠폰−SumUp사진−상품권) / 설명됨(리포트+나약스+과거마킹) / ❓미설명 / 서랍(kd.diff) / 근무.
// 상세(접힘): 인정직원·마감표·사진구멍 세션·직원 리포트·인계사슬·메모.
// 데이터 계약(읽기전용: rc/kd/nx, 이 앱 저장: note/report/cashCount/adm, 레거시 보존: fs/cc)은 그대로 — 표시만 재구성.
// 미설명은 attributeGap(lib/recon.js)으로 누락(비인정 몫=매출 아님)과 인정 몫(슈킹)으로 분해 — 판정은 누락 기준.
function ReconTab({ data, persist }) {
  // 날짜 기본값: 카세북(kd) 있는 최신 날 → 없으면 rc 최신 날 → 오늘
  const kdDates = (data.sales||[]).filter(s => s.kd).map(s => s.date).sort();
  const rcDates = (data.sales||[]).filter(s => s.rc).map(s => s.date).sort();
  const defaultDate = kdDates.length ? kdDates[kdDates.length-1]
    : (rcDates.length ? rcDates[rcDates.length-1] : todayStr());
  const [rcDate, setRcDate] = useState(defaultDate);
  const [noteInput, setNoteInput] = useState(""); // 그날 메모(재촬영·특이사항)
  const [admForm, setAdmForm] = useState({ kind: "reshoot", full: "", paid: "", note: "" }); // 관리자 사후 설명 입력폼
  const [admEdit, setAdmEdit] = useState(null); // 수정 중인 설명 index (null = 새로 추가)
  const detailsRef = useRef(null); // 상세 접힘
  const admRef = useRef(null);     // 확인된 설명 추가 카드
  // 하루 카드의 "➕ 설명 추가" → 상세 펼치고 입력폼으로 스크롤
  const goAddExplain = () => {
    if (detailsRef.current) detailsRef.current.open = true;
    setTimeout(() => { admRef.current && admRef.current.scrollIntoView({ behavior: "smooth", block: "center" }); }, 60);
  };

  const rec = (data.sales||[]).find(s => s.date === rcDate);
  const rc = rec && rec.rc ? rec.rc : null;
  const kd = rec && rec.kd ? rec.kd : null; // 카세북 실제 서랍 차액 (읽기전용)
  const fs = (rec && Array.isArray(rec.fs)) ? rec.fs : []; // 과거 프리샷 마킹 (읽기전용 — UI 제거, 데이터 호환용)

  // 날짜가 바뀌면 메모를 그 날 레코드 값으로 동기화
  useEffect(() => {
    const r = (data.sales||[]).find(s => s.date === rcDate);
    setNoteInput(r && r.note ? String(r.note) : "");
    setAdmEdit(null);
    setAdmForm({ kind: "reshoot", full: "", paid: "", note: "" });
  }, [rcDate]);

  const shiftDay = (delta) => { const d = new Date(rcDate); d.setDate(d.getDate()+delta); setRcDate(dstr(d)); };
  const toMin = t => { const [h,m] = String(t||"").split(":").map(Number); return (h||0)*60+(m||0); };

  // 과거 fs 마킹 여부 (레거시 — 설명됨 합산에만 반영, 새 마킹 UI는 리포트로 일원화)
  const isMarked = (t, v) => fs.some(f => f.t === t && Number(f.v) === Number(v));
  // 직원 인정(사장님측) 여부 — 슈킹 등 회사 현금관리 담당
  const isSanctioned = (id) => { const st = (data.staff||[]).find(x => x.id == id); return !!(st && st.sanctioned); };

  // 해당 날짜 레코드에 patch 병합 저장 (rc/kd/nx/fs/cc/sk 등 기존 필드는 spread로 보존)
  const patchRec = async (patch) => {
    let newSales = [...(data.sales||[])];
    const idx = newSales.findIndex(s => s.date === rcDate);
    if (idx >= 0) {
      newSales[idx] = { ...newSales[idx], ...patch };
    } else {
      newSales.push({ id: nid(newSales), date: rcDate, pc:0,pk:0,mc:0,mk:0,ac:0,ak:0,nc:0,nk:0,jc:0,jk:0,sk:0, ...patch });
    }
    await persist({ ...data, sales: newSales });
  };
  const saveNote = (txt) => patchRec({ note: txt });

  // 직원 인정 토글 (staff 레코드 spread — 다른 필드 보존)
  const toggleSanctioned = async (staffId) => {
    const newStaff = (data.staff||[]).map(s => s.id === staffId ? { ...s, sanctioned: !s.sanctioned } : s);
    await persist({ ...data, staff: newStaff });
  };

  // ===== 사진 구멍 세션 (루센트 쿠폰인데 SumUp 미결제) =====
  const un = rc && Array.isArray(rc.un) ? rc.un : [];
  const unSum = un.reduce((a, s) => a + (Number(s.v)||0), 0); // 미매칭 세션 추정가 합 (sk와 다를 수 있음)
  const markedUnSum = un.filter(s => isMarked(s.t, s.v)).reduce((a, s) => a + (Number(s.v)||0), 0); // 과거 프리샷 마킹 합

  // 근무자 매핑: 세션 시각 → 시프트(오프닝/클로징) → 그날 배정된 직원
  const slots = getSlots(rcDate); // 방학 여부는 getSlots가 자동 감지
  const dayShifts = (data.shifts||[]).filter(s => s.date === rcDate);
  const staffName = (id) => { const st = (data.staff||[]).find(x => x.id == id); return st ? st.name : "?"; };
  const mapSession = (t) => {
    const min = toMin(t);
    const slot = slots.find(sl => min >= toMin(sl.start) && min < toMin(sl.end));
    if (!slot) return { slotType: null, name: "시간대 외", cls: "", staffId: null };
    const sh = dayShifts.find(x => x.slotType === slot.type);
    return {
      slotType: slot.type,
      name: sh ? staffName(sh.staffId) : "미배정",
      cls: slot.type === "오프닝" ? "bylw" : "bgrn",
      staffId: sh ? sh.staffId : null
    };
  };

  const closingStaff = dayShifts.filter(s => s.slotType === "클로징").map(s => ({ id: s.staffId, name: staffName(s.staffId), sanctioned: isSanctioned(s.staffId), cashCount: s.cashCount }));
  const openingStaff = dayShifts.filter(s => s.slotType === "오프닝").map(s => ({ id: s.staffId, name: staffName(s.staffId), sanctioned: isSanctioned(s.staffId), cashCount: s.cashCount }));

  // ===== 카세북 (실제 서랍) =====
  const kdDiff = kd ? (Number(kd.diff)||0) : null;
  const closes = (kd && Array.isArray(kd.closes)) ? kd.closes : [];

  // ===== 인계 사슬: 직원이 퇴근 시 입력한 서랍 현금(cashCount) =====
  const mapCount = s => ({
    name: staffName(s.staffId), cash: Number(s.cashCount)||0, memo: s.cashMemo || "",
    diff: s.cashDiff != null ? Number(s.cashDiff) : null,          // 퇴근 시 실시간 서랍 비교 (입력 − 기대)
    reason: s.cashDiffReason || "",                                 // 부족 이유 (직원 선택)
    floatStart: s.floatStart != null ? Number(s.floatStart) : null  // 오프닝 시작 시재
  });
  const openCounts = dayShifts.filter(s => s.slotType === "오프닝" && s.cashCount != null).map(mapCount);
  const closeCounts = dayShifts.filter(s => s.slotType === "클로징" && s.cashCount != null).map(mapCount);
  const hasChain = openCounts.length > 0 || closeCounts.length > 0;
  const empClose = closeCounts.length ? closeCounts.reduce((a, c) => a + c.cash, 0) : null;
  const empOpen = openCounts.length ? openCounts.reduce((a, c) => a + c.cash, 0) : null;
  const lastClose = closes.length ? closes[closes.length - 1] : null;
  const kdAct = lastClose && lastClose.act != null ? (Number(lastClose.act)||0) : null;
  const kdExp = lastClose && lastClose.exp != null ? (Number(lastClose.exp)||0) : null;
  const empVsAct = (empClose != null && kdAct != null) ? (empClose - kdAct) : null;
  let chainVerdict = null;
  if (empClose == null) {
    chainVerdict = { icon:"⚪", color:"#888", text:"직원 마감액 미입력 — 퇴근 시 입력 유도" };
  } else if (kdAct == null) {
    chainVerdict = { icon:"⚪", color:"#888", text:"카세북 마감(실제) 없음 — 직원 입력만 있음" };
  } else if (Math.abs(empVsAct) <= 1) {
    chainVerdict = { icon:"🟢", color:"#2f9e44", text:"직원 마감액 = 카세북 실제 (일치)" };
  } else {
    chainVerdict = { icon:"🔴", color:"#e03131", text:`직원 마감액과 카세북 실제 불일치 (${empVsAct>=0?"+":"−"}€${fmtE(Math.abs(empVsAct))}) — 오카운트/누락 확인` };
  }

  // ===== 직원 리포트(무료/할인/재촬영) =====
  const reportByStaff = {};
  dayShifts.forEach(s => {
    if (Array.isArray(s.report) && s.report.length) {
      const key = s.staffId;
      if (!reportByStaff[key]) reportByStaff[key] = { staffId: s.staffId, name: staffName(s.staffId), slotType: s.slotType, sanctioned: isSanctioned(s.staffId), items: [], explained: 0 };
      s.report.forEach(r => {
        reportByStaff[key].items.push(r);
        reportByStaff[key].explained += Math.max((Number(r.full)||0) - (Number(r.paid)||0), 0);
      });
    }
  });
  const reportList = Object.values(reportByStaff);
  const checkShifts = dayShifts.filter(s => s.checkGap != null); // 퇴근 시 실시간 대조 스냅샷
  const reportExplainedTotal = reportList.reduce((a, r) => a + r.explained, 0);
  // 인정직원 슈킹 자진신고 ("오늘 만든 현금") — 표시용 목록. rec(sales 레코드) 없는 날도 시프트에서 직접 집계.
  const skReports = dayShifts.filter(s => s.skMade != null && Number(s.skMade) > 0)
    .map(s => ({ name: staffName(s.staffId), v: Number(s.skMade)||0, memo: s.skMadeMemo || "" }));
  const skReportedTotal = skReports.reduce((a, r) => a + r.v, 0);

  // ===== 나약스(사진기계 카드결제) 초과 = max(0, nx − mk) — 기계꺼짐 재촬영이 나약스로 결제됨 =====
  const nx = rec && rec.nx != null ? (Number(rec.nx)||0) : null;
  const mkVal = rec ? (Number(rec.mk)||0) : 0;
  const naaxOverflow = nx != null ? Math.max(0, nx - mkVal) : 0;

  // ===== 관리자 사후 설명 (adm) — 사장님이 나중에 확인한 재촬영·무료쿠폰 =====
  const adm = (rec && Array.isArray(rec.adm)) ? rec.adm : [];
  const admSum = adm.reduce((a, r) => a + Math.max((Number(r.full)||0) - (Number(r.paid)||0), 0), 0);
  const addAdm = async () => {
    const full = parseFloat(admForm.full) || 0;
    const paid = parseFloat(admForm.paid) || 0;
    if (full <= 0) { alert("원가(€)를 입력하세요"); return; }
    const entry = { kind: admForm.kind, full, paid, note: admForm.note || "" };
    await patchRec({ adm: admEdit != null ? adm.map((r, i) => i === admEdit ? entry : r) : [...adm, entry] });
    setAdmForm({ kind: "reshoot", full: "", paid: "", note: "" });
    setAdmEdit(null);
  };
  const startEditAdm = (i) => {
    const r = adm[i];
    setAdmForm({ kind: r.kind || "reshoot", full: r.full != null ? String(r.full) : "", paid: r.paid != null ? String(r.paid) : "", note: r.note || "" });
    setAdmEdit(i);
  };
  const cancelEditAdm = () => { setAdmEdit(null); setAdmForm({ kind: "reshoot", full: "", paid: "", note: "" }); };
  const delAdm = async (idx) => {
    await patchRec({ adm: adm.filter((_, i) => i !== idx) });
    if (admEdit === idx) cancelEditAdm();
    else if (admEdit != null && idx < admEdit) setAdmEdit(admEdit - 1);
  };

  // ===== 사진 구멍 & 미설명 — 귀속 계산은 attributeGap으로 일원화 (매출/통계 탭과 동일 값) =====
  // 사진 구멍 = sk (파이썬이 사진 기준 재계산: 쿠폰 − SumUp사진 − 상품권)
  const photoGap = rc && rec ? (Number(rec.sk)||0) : null;
  const gap = attributeGap(data, rec || null); // { explained, unexplained, sukking, nurak, ... }
  const explainedTotal = gap.explained; // 리포트 + 관리자 + 나약스초과 + 과거마킹
  const unexplained = photoGap != null ? gap.unexplained : null; // ← 오늘 확인할 것
  const noReport = unexplained > 0 && reportList.length === 0 && admSum === 0; // 구멍은 있는데 설명이 하나도 없음 → 알바 미입력 의심

  // ===== 매출 =====
  const machineSales = rec ? ((rec.mc||0)+(rec.mk||0)) : 0;
  const counterSales = rec ? ((rec.pc||0)+(rec.pk||0)+(rec.ac||0)+(rec.ak||0)+(rec.nc||0)+(rec.nk||0)+(rec.jc||0)+(rec.jk||0)) : 0;
  const totalSales = machineSales + counterSales;

  // ===== 하루 판정: 누락>€5 or 서랍부족<−€2 → 🔴 / 소액 이상 → 🟠 / 정상 → ✅ =====
  // 판정 기준은 누락(비인정 몫) — 인정직원 몫(슈킹)만 있으면 ✅
  let day;
  const hasSignal = (unexplained != null) || (kdDiff != null);
  if (!hasSignal) {
    day = { icon:"⏳", label:"데이터 대기", color:"#888", bd:"#ccc", bg:"#fafafa" };
  } else if ((unexplained != null && gap.nurak > 5) || (kdDiff != null && kdDiff < -2)) {
    day = { icon:"🔴", label:"확인 필요", color:"#e03131", bd:"#ff6b6b", bg:"rgba(255,107,107,.05)" };
  } else if ((unexplained != null && gap.nurak > 1) || (kdDiff != null && kdDiff < -1)) {
    day = { icon:"🟠", label:"소액 차이", color:"#e8590c", bd:"#e8590c", bg:"rgba(232,89,12,.05)" };
  } else {
    day = { icon:"✅", label:"정상", color:"#2f9e44", bd:"#2f9e44", bg:"rgba(47,158,68,.05)" };
  }

  const [y, mo, dnum] = rcDate.split("-").map(Number);
  const dayTitle = `${mo}월 ${dnum}일 (${dowKo(rcDate)})`;

  // 하루 카드 한 줄 (라벨 + 값)
  const Row = ({ label, main, sub, color, strong, indent }) => (
    <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:8,padding:"5px 0",borderBottom:"1px solid rgba(0,0,0,.04)",paddingLeft:indent?14:0}}>
      <div style={{fontSize:strong?13:12,color:strong?(color||"#1a1a1a"):"#666",fontWeight:strong?700:500,flexShrink:0}}>{label}</div>
      <div style={{textAlign:"right"}}>
        <span className="mn" style={{fontSize:strong?17:14,fontWeight:strong?800:700,color:color||"#1a1a1a"}}>{main}</span>
        {sub ? <div style={{fontSize:10,color:"#999",marginTop:1}}>{sub}</div> : null}
      </div>
    </div>
  );

  return (
    <div>
      {/* 날짜 네비게이션 */}
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
        <button className="btn bs sm" onClick={()=>shiftDay(-1)}>◀</button>
        <input type="date" value={rcDate} onChange={e=>setRcDate(e.target.value)} style={{width:160}} />
        <button className="btn bs sm" onClick={()=>shiftDay(1)}>▶</button>
      </div>

      {/* ===== 하루 카드 (이것만 보면 끝) ===== */}
      <div className="card" style={{border:`2px solid ${day.bd}`, background:day.bg, marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:8}}>
          <div style={{fontSize:16,fontWeight:800}}>{dayTitle}</div>
          <div style={{fontSize:15,fontWeight:800,color:day.color}}>{day.icon} {day.label}</div>
        </div>

        <Row label="매출" main={`€${fmtE(totalSales)}`} sub={`기계 €${fmtE(machineSales)} + 카운터 €${fmtE(counterSales)}`} />

        {rc ? (
          <>
            <Row label="❓ 미설명" main={`€${fmtE(unexplained)}`}
              sub={unexplained > 0 ? (
                <>
                  <div>사진구멍 €{fmtE(photoGap)} − 설명됨 €{fmtE(explainedTotal)}{explainedTotal>0 ? ` (리포트 €${fmtE(reportExplainedTotal)}${admSum>0?` + 관리자 €${fmtE(admSum)}`:""}${naaxOverflow>0?` + 나약스 €${fmtE(naaxOverflow)}`:""}${markedUnSum>0?` + 과거 €${fmtE(markedUnSum)}`:""})` : ""}</div>
                  {noReport ? <div style={{color:"#e8590c",fontWeight:700,marginTop:2}}>⚠️ 직원 리포트 0건 — 퇴근 때 설명을 안 남겼을 수 있어요</div> : null}
                  {gap.sukking > 0 ? <div style={{marginTop:2}}><span style={{color:"#e03131",fontWeight:700}}>누락 €{fmtE(gap.nurak)}</span> · 인정몫 €{fmtE(gap.sukking)}{gap.skMade>0?" (신고 확정)":" (추정)"}</div> : null}
                </>
              ) : <span style={{color:"#2f9e44"}}>✅ 전부 설명됨 (구멍 €{fmtE(photoGap)})</span>}
              color={gap.nurak>5?"#e03131":(gap.nurak>1?"#e8590c":"#2f9e44")} strong />
            <div style={{display:"flex",justifyContent:"flex-end",padding:"6px 4px 2px"}}>
              <button className="btn bg2 sm" onClick={goAddExplain}>➕ 설명 추가·수정</button>
            </div>
          </>
        ) : (
          <Row label="❓ 미설명" main="야간 집계 대기" color="#999"
            sub={(reportExplainedTotal>0||naaxOverflow>0||admSum>0) ? `오늘 설명 입력 €${fmtE(reportExplainedTotal+naaxOverflow+admSum)}` : null} />
        )}

        {skReportedTotal > 0 ? (
          <Row indent label="🔒 슈킹 신고 (인정직원)" main={`€${fmtE(skReportedTotal)}`}
            sub={skReports.map(r=>`${r.name} €${fmtE(r.v)}`).join(" · ")}
            color="#1971c2" />
        ) : null}

        <Row label="서랍(카세북)"
          main={kdDiff != null ? `${kdDiff<0?"−":"+"}€${fmtE(Math.abs(kdDiff))}` : "카세북 대기"}
          sub={kd ? `마감 ${closes.length}회 · 현금매출 ${kd.cash_sales!=null?kd.cash_sales:"?"}건` : "월말 CSV 반영 후 표시"}
          color={kdDiff==null?"#999":(kdDiff<-2?"#e03131":(kdDiff<-1?"#e8590c":"#2f9e44"))} strong={kdDiff!=null} />

        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,paddingTop:7,flexWrap:"wrap"}}>
          <div style={{fontSize:12,color:"#666",fontWeight:500}}>근무</div>
          <div style={{fontSize:12,textAlign:"right"}}>
            <span className="badge bylw" style={{marginRight:3}}>오프닝</span>
            <strong>{openingStaff.length ? openingStaff.map(s=>s.name).join(", ") : "미배정"}</strong>
            <span style={{color:"#888",margin:"0 6px"}}>→</span>
            <span className="badge bgrn" style={{marginRight:3}}>클로징</span>
            <strong>{closingStaff.length ? closingStaff.map(s=>s.name).join(", ") : "미배정"}</strong>
            <span style={{fontSize:11,color:empClose!=null?"#2f9e44":"#e8590c",marginLeft:6}}>
              {empClose != null ? `(마감 €${fmtE(empClose)} 입력됨)` : "(마감 미입력)"}
            </span>
          </div>
        </div>
      </div>

      {/* ===== 상세 (접힘) ===== */}
      <details ref={detailsRef} style={{marginBottom:12}}>
        <summary style={{cursor:"pointer",fontSize:13,fontWeight:700,color:"#1971c2",padding:"8px 4px",userSelect:"none"}}>상세 ▾</summary>
        <div style={{marginTop:10}}>

          {/* 안내 */}
          <div className="card" style={{background:"rgba(77,171,247,.06)",border:"1px solid rgba(77,171,247,.35)",marginBottom:10,fontSize:11,color:"#555"}}>
            ℹ️ <strong>사진 구멍</strong> = 쿠폰(찍힌 사진) − SumUp사진 − 상품권. 무료·할인·재촬영·나약스로 설명하고 남는 <strong>미설명</strong>이 확인 대상.
            서랍 차이도 <strong>오카운트·거스름돈·시재착오</strong>일 수 있으니 종합 판단하세요.
          </div>

          {/* 인정(사장님측) 직원 */}
          <div className="card" style={{marginBottom:10}}>
            <div style={{fontWeight:700,color:"#1971c2",marginBottom:4,fontSize:12}}>🤝 인정(사장님측) 직원</div>
            <div style={{fontSize:10,color:"#888",marginBottom:8}}>
              슈킹 등 사장님측 현금관리를 맡은 직원. 켜면 그 직원 몫의 미설명은 <strong>빼돌림 아님</strong>으로 표시됩니다.
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {(data.staff||[]).length === 0 ? <span style={{fontSize:11,color:"#aaa"}}>직원 없음</span> :
                (data.staff||[]).map(st => (
                  <button key={st.id} onClick={()=>toggleSanctioned(st.id)}
                    style={{
                      padding:"4px 10px", borderRadius:14, cursor:"pointer", fontSize:12,
                      border: st.sanctioned ? "1px solid #4dabf7" : "1px solid #ddd",
                      background: st.sanctioned ? "rgba(77,171,247,.15)" : "#fff",
                      color: st.sanctioned ? "#1971c2" : "#888",
                      fontWeight: st.sanctioned ? 700 : 400
                    }}>
                    {st.sanctioned ? "✓ " : ""}{st.name}{st.sanctioned ? " · 인정" : ""}
                  </button>
                ))}
            </div>
          </div>

          {/* 마감 상세 (카세북) */}
          {closes.length ? (
            <div className="card" style={{marginBottom:10,overflowX:"auto"}}>
              <div style={{fontWeight:700,color:"#1971c2",marginBottom:8,fontSize:13}}>🧾 마감 상세 ({closes.length}회)</div>
              <table className="tbl">
                <thead><tr><th>마감시각</th><th>기대 €</th><th>실제 €</th><th>차액 €</th></tr></thead>
                <tbody>
                  {closes.map((c, i) => {
                    const cd = Number(c.diff)||0;
                    return (
                      <tr key={i}>
                        <td className="mn" style={{whiteSpace:"nowrap"}}>{c.t||"-"}</td>
                        <td className="mn">€{fmtE(c.exp)}</td>
                        <td className="mn">€{fmtE(c.act)}</td>
                        <td className="mn" style={{fontWeight:700,color: cd<-1?"#e03131":(cd>1?"#e8590c":"#2f9e44")}}>{cd>=0?"+":"−"}€{fmtE(Math.abs(cd))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {/* 사진 구멍 세션 (근무자 배지) */}
          {rc ? (
            <div className="card" style={{marginBottom:10,overflowX:"auto"}}>
              <div style={{fontWeight:700,color:"#b8860b",marginBottom:4,fontSize:13}}>📷 사진 구멍 세션 ({un.length}건 · 추정 합 €{fmtE(unSum)})</div>
              <div style={{fontSize:10,color:"#888",marginBottom:8}}>
                루센트 쿠폰 세션 중 SumUp 결제와 짝을 못 찾은 것. 가격이 추정치이고 묶음결제·시간차 때문에 짝이 어긋날 수 있어서,
                이 목록의 합이 위 <strong>미설명 €와 다른 게 정상</strong>이에요. 돈 계산은 하루 총액 기준(미설명)이 맞고, 이 목록은 "몇 시쯤·누구 근무 때였나" 참고용.
              </div>
              {un.length ? (
                <table className="tbl">
                  <thead><tr><th>시각</th><th>금액</th><th>근무자</th></tr></thead>
                  <tbody>
                    {un.map((s, i) => {
                      const m = mapSession(s.t);
                      const marked = isMarked(s.t, s.v); // 과거 마킹 표시(읽기전용)
                      return (
                        <tr key={i} style={marked ? {opacity:.55} : null}>
                          <td className="mn" style={{whiteSpace:"nowrap"}}>{marked ? "🎁 " : ""}{s.t}</td>
                          <td className="mn">€{fmtE(s.v)}</td>
                          <td>
                            {m.slotType ? <span className={"badge "+m.cls} style={{marginRight:4}}>{m.slotType}</span> : null}
                            <span style={{fontSize:12}}>{m.name}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : <div style={{fontSize:11,color:"#aaa"}}>세션 없음 — 전부 결제됨 👍</div>}
            </div>
          ) : null}

          {/* 직원 리포트 (무료/할인/재촬영) + 실시간 대조 + 나약스 */}
          <div className="card" style={{marginBottom:10}}>
            <div style={{fontWeight:700,color:"#b8860b",marginBottom:6,fontSize:13}}>📸 직원 리포트 (무료/할인/재촬영)</div>
            {reportList.length === 0 ? (
              <div style={{fontSize:12,color:"#aaa",padding:6,marginBottom:6}}>직원 기록 없음 (퇴근 시 kiosk에서 입력).</div>
            ) : reportList.map((rp, gi) => (
              <div key={gi} style={{marginBottom:8,paddingBottom:6,borderBottom:gi<reportList.length-1?"1px solid #f0f0f0":"none"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                  <span className={"badge "+(rp.slotType==="오프닝"?"bylw":"bgrn")}>{rp.slotType}</span>
                  <strong style={{fontSize:13}}>{rp.name}</strong>
                  {rp.sanctioned ? <span className="badge" style={{background:"rgba(77,171,247,.15)",color:"#1971c2"}}>🤝 인정</span> : null}
                  <span style={{fontSize:11,color:"#2f9e44"}}>설명 €{fmtE(rp.explained)} · {rp.items.length}건</span>
                </div>
                {rp.items.map((r, ri) => (
                  <div key={ri} style={{fontSize:11,color:"#555",padding:"2px 0 2px 10px"}}>
                    {reportKindLabel(r.kind)} · €{fmtE(r.full)}→€{fmtE(r.paid)} <span style={{color:"#b8860b"}}>(할인 €{fmtE(Math.max((Number(r.full)||0)-(Number(r.paid)||0),0))})</span>{r.note ? ` · ${r.note}` : ""}
                  </div>
                ))}
              </div>
            ))}
            {nx != null ? (
              <div style={{fontSize:11,color:"#1971c2",marginBottom:6,padding:"6px 8px",background:"rgba(77,171,247,.08)",borderRadius:6}}>
                🔌 나약스 결제(기계꺼짐 재촬영) <strong>€{fmtE(naaxOverflow)}</strong> — 사진 구멍 아님 (나약스 €{fmtE(nx)} − 루센트 기계카드 €{fmtE(mkVal)})
              </div>
            ) : null}
            {skReports.length ? (
              <div style={{fontSize:11,color:"#1971c2",marginBottom:6,padding:"6px 8px",background:"rgba(77,171,247,.08)",borderRadius:6}}>
                🔒 슈킹 신고(오늘 만든 현금) <strong>€{fmtE(skReportedTotal)}</strong>
                {rc ? <> — 신고 €{fmtE(skReportedTotal)} vs 추정 €{fmtE(gap.sukkingEst)}{Math.abs(skReportedTotal-gap.sukkingEst)>=5 ? <span style={{color:"#e8590c",fontWeight:700}}> 🟠 차이 확인</span> : null}</> : null}
                {skReports.map((r, i) => (
                  <div key={i} style={{fontSize:10,color:"#555",paddingLeft:10,marginTop:2}}>{r.name} €{fmtE(r.v)}{r.memo ? ` · ${r.memo}` : ""}</div>
                ))}
              </div>
            ) : null}
            {markedUnSum > 0 ? (
              <div style={{fontSize:10,color:"#888",marginBottom:6}}>🎁 과거 프리샷 마킹 €{fmtE(markedUnSum)} 설명에 포함 (과거 호환 — 새 기록은 리포트로)</div>
            ) : null}
            {checkShifts.length ? (
              <div style={{padding:"8px 10px",background:"#f5f5f7",borderRadius:8}}>
                <div style={{fontSize:11,fontWeight:700,color:"#1971c2",marginBottom:4}}>🔎 퇴근 시 실시간 대조 (직원이 본 값)</div>
                <div style={{fontSize:10,color:"#888",marginBottom:4}}>⏸ 퇴근 시점 스냅샷 — 나중에 추가한 관리자 설명은 여기엔 반영되지 않아요 (위 하루 카드가 최신).</div>
                {checkShifts.map((s, i) => {
                  const u = Number(s.checkUnexplained)||0;
                  return (
                    <div key={i} style={{fontSize:11,color:"#555",padding:"2px 0"}}>
                      <span className={"badge "+(s.slotType==="오프닝"?"bylw":"bgrn")} style={{marginRight:4}}>{s.slotType}</span>
                      {staffName(s.staffId)}: 루센트 €{fmtE(s.checkLucentEur)} vs 결제 €{fmtE(s.checkSumupEur)} · 미설명 <strong style={{color: u>=5?"#e03131":(u>=1?"#e8590c":"#2f9e44")}}>€{fmtE(u)}</strong>
                      {s.checkConfirmed ? <span style={{color:"#2f9e44"}}> · ✓ 직원확인</span> : (u>=1 ? <span style={{color:"#e8590c"}}> · ⚠️ 미확인</span> : null)}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* 관리자 사후 설명 추가 (adm) */}
          <div ref={admRef} className="card" style={{marginBottom:10}}>
            <div style={{fontWeight:700,color:"#2f9e44",marginBottom:4,fontSize:13}}>➕ 확인된 설명 추가·수정 (관리자)</div>
            <div style={{fontSize:10,color:"#888",marginBottom:8}}>
              직원이 퇴근 때 리포트를 못 남긴 재촬영·무료쿠폰을 나중에 확인했으면 여기에 추가하세요 — <strong>설명됨</strong>에 합산되어 누락이 줄어듭니다.
              이미 넣은 설명은 <strong>수정</strong> 버튼으로 고칠 수 있어요.
            </div>
            {adm.length ? adm.map((r, i) => (
              <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6,fontSize:11,color:"#555",padding:"3px 0",borderBottom:"1px solid #f5f5f5",background: admEdit===i ? "rgba(77,171,247,.08)" : "transparent"}}>
                <span>
                  {reportKindLabel(r.kind)} · €{fmtE(r.full)}→€{fmtE(r.paid)}
                  <span style={{color:"#2f9e44"}}> (설명 €{fmtE(Math.max((Number(r.full)||0)-(Number(r.paid)||0),0))})</span>
                  {r.note ? ` · ${r.note}` : ""}
                  {admEdit===i ? <span style={{color:"#1971c2",fontWeight:700}}> · 수정 중…</span> : null}
                </span>
                <span style={{display:"flex",gap:4,flexShrink:0}}>
                  <button className="btn bs sm" onClick={()=>startEditAdm(i)}>수정</button>
                  <button className="btn bd sm" onClick={()=>delAdm(i)}>삭제</button>
                </span>
              </div>
            )) : null}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginTop:8}}>
              <select value={admForm.kind} onChange={e=>setAdmForm({...admForm, kind:e.target.value})} style={{fontSize:12}}>
                {REPORT_KINDS.map(k => <option key={k.k} value={k.k}>{k.label}</option>)}
              </select>
              <input type="number" placeholder="원가 €" value={admForm.full} onChange={e=>setAdmForm({...admForm, full:e.target.value})} style={{width:72,fontSize:12}} />
              <input type="number" placeholder="받은 €" value={admForm.paid} onChange={e=>setAdmForm({...admForm, paid:e.target.value})} style={{width:72,fontSize:12}} />
              <input placeholder="메모" value={admForm.note} onChange={e=>setAdmForm({...admForm, note:e.target.value})} style={{width:130,fontSize:12}} />
              <button className="btn bp sm" onClick={addAdm}>{admEdit != null ? "저장" : "추가"}</button>
              {admEdit != null ? <button className="btn bs sm" onClick={cancelEditAdm}>취소</button> : null}
            </div>
          </div>

          {/* 인계 사슬 */}
          <div className="card" style={{marginBottom:10}}>
            <div style={{fontWeight:700,color:"#1971c2",marginBottom:6,fontSize:13}}>🔗 인계 사슬 (직원이 센 서랍 현금)</div>
            {!hasChain ? (
              <div style={{fontSize:12,color:"#aaa",padding:6}}>아직 직원이 입력한 서랍 현금이 없어요 (퇴근 시 입력).</div>
            ) : (
              <>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:10,fontSize:13}}>
                  <div style={{background:"rgba(255,212,0,.12)",borderRadius:8,padding:"8px 12px"}}>
                    <span className="badge bylw" style={{marginRight:6}}>오프닝 인계</span>
                    {openCounts.length ? openCounts.map((c,i)=>(
                      <span key={i} style={{marginRight:8}}>
                        {c.floatStart != null ? <span style={{fontSize:10,color:"#888"}}>시재 €{fmtE(c.floatStart)} → </span> : null}
                        <strong className="mn">€{fmtE(c.cash)}</strong> <span style={{fontSize:11,color:"#888"}}>({c.name}{c.memo?` · ${c.memo}`:""})</span>
                        {c.diff != null ? (
                          c.diff <= -2 ? <span style={{fontSize:11,fontWeight:700,color:"#e03131"}}> −€{fmtE(-c.diff)} 부족{c.reason?` (${c.reason})`:""}</span>
                          : c.diff >= 2 ? <span style={{fontSize:11,fontWeight:700,color:"#e8590c"}}> +€{fmtE(c.diff)} 초과</span>
                          : <span style={{fontSize:11,color:"#2f9e44"}}> ✓맞음</span>
                        ) : null}
                      </span>
                    )) : <span style={{fontSize:11,color:"#aaa"}}>미입력</span>}
                  </div>
                  <span style={{fontSize:18,color:"#888"}}>→</span>
                  <div style={{background:"rgba(47,158,68,.1)",borderRadius:8,padding:"8px 12px"}}>
                    <span className="badge bgrn" style={{marginRight:6}}>클로징 마감</span>
                    {closeCounts.length ? closeCounts.map((c,i)=>(
                      <span key={i} style={{marginRight:8}}>
                        <strong className="mn">€{fmtE(c.cash)}</strong> <span style={{fontSize:11,color:"#888"}}>({c.name}{c.memo?` · ${c.memo}`:""})</span>
                        {c.diff != null ? (
                          c.diff <= -2 ? <span style={{fontSize:11,fontWeight:700,color:"#e03131"}}> −€{fmtE(-c.diff)} 부족{c.reason?` (${c.reason})`:""}</span>
                          : c.diff >= 2 ? <span style={{fontSize:11,fontWeight:700,color:"#e8590c"}}> +€{fmtE(c.diff)} 초과</span>
                          : <span style={{fontSize:11,color:"#2f9e44"}}> ✓맞음</span>
                        ) : null}
                      </span>
                    )) : <span style={{fontSize:11,color:"#aaa"}}>미입력</span>}
                  </div>
                </div>
                <div className="g3" style={{marginBottom:10}}>
                  <div className="chip">
                    <div className="lb">🧑 직원 마감 (입력)</div>
                    <div className="vl">{empClose != null ? "€"+fmtE(empClose) : "—"}</div>
                  </div>
                  <div className="chip">
                    <div className="lb">📒 카세북 실제</div>
                    <div className="vl" style={{color: empVsAct!=null && Math.abs(empVsAct)>1 ? "#e03131":"#1a1a1a"}}>{kdAct != null ? "€"+fmtE(kdAct) : "—"}</div>
                  </div>
                  <div className="chip">
                    <div className="lb">🎯 기대 (Soll)</div>
                    <div className="vl" style={{color:"#888"}}>{kdExp != null ? "€"+fmtE(kdExp) : "—"}</div>
                  </div>
                </div>
                <div className="card" style={{border:`1px solid ${chainVerdict.color}`, background: chainVerdict.icon==="🔴"?"rgba(255,107,107,.06)":(chainVerdict.icon==="🟢"?"rgba(47,158,68,.06)":"#f5f5f7"), display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                  <div style={{fontSize:12,fontWeight:700,color:chainVerdict.color}}>{chainVerdict.icon} {chainVerdict.text}</div>
                </div>
                {empOpen != null ? (
                  <div style={{fontSize:10,color:"#888",marginTop:8}}>ℹ️ 오프닝이 인계한 €{fmtE(empOpen)}는 클로징이 이어받은 시재입니다.</div>
                ) : null}
              </>
            )}
          </div>

          {/* 메모 */}
          <div className="card" style={{marginBottom:10}}>
            <div style={{fontWeight:700,color:"#1971c2",marginBottom:6,fontSize:13}}>📝 메모 (재촬영·특이사항)</div>
            <textarea value={noteInput} onChange={e=>setNoteInput(e.target.value)} placeholder="예: 20:40 재촬영 2건 / 거스름돈 부족 / 단체 묶음결제 등" style={{width:"100%",minHeight:56,fontSize:12,padding:8,boxSizing:"border-box",resize:"vertical"}} />
            <div style={{display:"flex",gap:8,alignItems:"center",marginTop:6}}>
              <button className="btn bp sm" onClick={()=>saveNote(noteInput)}>메모 저장</button>
              {rec && rec.note ? <span style={{fontSize:10,color:"#2f9e44"}}>✓ 저장됨</span> : <span style={{fontSize:10,color:"#aaa"}}>미저장</span>}
            </div>
          </div>

        </div>
      </details>
    </div>
  );
}

export { ReconTab };
