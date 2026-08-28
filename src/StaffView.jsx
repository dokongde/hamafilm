import { hessenHols, DOW_KO, getSlots, dowKo, todayStr, curYM, getCarryIn, fmtE, nid, shiftHours, openVertrag } from "./lib/utils";
import { GAS_URL, saveSession, clearSession, notifyLoginEvent, splitData } from "./data/gas";
import { StaffPushCard } from "./components/push-cards";

  // ─── 직원 화면 ───
function StaffView({ adminDevice, data, gSt, isVac, lastError, manualRefresh, persist, setModal, setSvCalM, setSvCalY, setSvDate, setSvSel, setSvSid, showToast, storageMode, svCalM, svCalY, svDate, svSel, svSid, vacName }) {
    const hols = hessenHols(new Date(svDate).getFullYear());
    const dow = new Date(svDate).getDay();
    const holName = hols[svDate] || "";
    const vacN = vacName(svDate);
    const slots = getSlots(svDate);
    // 같은 날짜+같은 타입은 한 명만: 누가 이미 잡았는지 (본인 포함 전 직원 기준)
    const takenBy = {};
    (data.shifts||[]).filter(s => s.date===svDate && (s.slotType==="오프닝" || s.slotType==="클로징"))
      .forEach(s => { if (takenBy[s.slotType] === undefined) takenBy[s.slotType] = s.staffId; });
    const taken = Object.keys(takenBy);
    const fixedTypes = (data.fixed||[]).filter(f => f.staffId===svSid && f.dows.includes(dow)).map(f => f.type);
    // 직원이 보고 있는 달력의 월
    const viewYM = `${svCalY}-${String(svCalM+1).padStart(2,"0")}`;
    // 그 달 + 미래 모든 달의 자기 스케줄을 다 보여줌 (취소도 미래 모두 가능)
    const today = todayStr();
    const myS = (data.shifts||[])
      .filter(s => s.staffId===svSid && s.date >= today)  // 오늘부터의 모든 미래 스케줄
      .sort((a,b) => a.date.localeCompare(b.date));
    const allS = (data.shifts||[])
      .filter(s => s.date.startsWith(viewYM))
      .sort((a,b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

    const doSave = async () => {
      if (!svSid || !svSel) return;
      const slot = slots.find(s => s.type === svSel);
      if (!slot) return;
      // 같은 날짜+같은 타입(오프닝/클로징)은 한 명만
      const dup = (data.shifts||[]).find(s => s.date===svDate && s.slotType===svSel);
      if (dup) {
        showToast(dup.staffId === svSid
          ? "이미 등록됨"
          : `❌ ${svSel}은 이미 ${gSt(dup.staffId)?.name || "다른 직원"}님이 등록했어요`);
        setSvSel(null);
        return;
      }
      const ok = await persist({...data, shifts: [...(data.shifts||[]), {
        id: nid(data.shifts||[]),
        staffId: svSid, date: svDate,
        start: slot.start, end: slot.end,
        slotType: slot.type, hours: slot.hours,
        memo: "", source: "share"
      }]});
      setSvSel(null);
      // 저장 실패 시 persist가 띄운 실패 안내를 성공 토스트로 덮지 않는다
      if (ok) showToast("✅ 등록 완료!");
    };

    const doCancel = async (id) => {
      const shift = (data.shifts||[]).find(s => s.id === id);
      if (!shift) return;
      const reason = prompt(
        `${shift.date} ${shift.slotType} 스케줄 취소\n\n` +
        `사장님께 전할 취소 사유를 적어주세요:\n` +
        `(예: 갑자기 일이 생김, 몸이 안 좋음, 다른 알바생과 교환)`,
        ""
      );
      if (reason === null) return;
      const me = gSt(svSid);
      const cancelRecord = {
        id: Date.now(),
        staffId: shift.staffId,
        staffName: me?.name || "?",
        date: shift.date,
        slotType: shift.slotType,
        start: shift.start,
        end: shift.end,
        reason: reason.trim() || "(사유 없음)",
        cancelledAt: new Date().toISOString(),
        viewed: false
      };
      const ok = await persist({
        ...data,
        shifts: (data.shifts||[]).filter(s => s.id !== id),
        cancellations: [...(data.cancellations||[]), cancelRecord]
      });
      if (ok) showToast("취소 완료 — 사장님께 전달됨");
    };

    return (
      <div>
        <div className="tb">
          <div className="logo">💙 HAMAFILM<small>스케줄</small></div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span
              onClick={async()=>{
                let info = "📊 저장소 상태\n\n";
                info += "모드: " + storageMode + "\n";
                info += "에러: " + (lastError || "(없음)") + "\n\n";
                info += "🔍 읽기(GET) 테스트 중...\n";
                try {
                  const res = await fetch(GAS_URL, { method: "GET" });
                  info += "응답코드: " + res.status + "\n";
                  const txt = await res.text();
                  info += "응답내용 (처음 100자):\n" + txt.slice(0, 100);
                } catch(e) {
                  info += "❌ 에러: " + (e.message || String(e));
                }
                // 저장(POST) 경로도 따로 테스트 — 데이터는 안 건드리는 ping
                // (GET은 되는데 POST만 막히는 경우를 구분하기 위함)
                info += "\n\n📤 저장(POST) 테스트 중...\n";
                try {
                  const res2 = await fetch(GAS_URL, {
                    method: "POST",
                    body: JSON.stringify({ pushAction: "ping" }),
                    headers: { "Content-Type": "text/plain;charset=utf-8" },
                    redirect: "follow"
                  });
                  info += "응답코드: " + res2.status + "\n";
                  const txt2 = await res2.text();
                  info += "응답내용 (처음 100자):\n" + txt2.slice(0, 100);
                } catch(e) {
                  info += "❌ 에러: " + (e.message || String(e));
                }
                // 버킷별 데이터 크기 — 구글 시트는 셀당 5만 자 한도라 초과하면 저장이 거부됨
                try {
                  const sizes = Object.entries(splitData(data))
                    .map(([k, v]) => {
                      const len = JSON.stringify(v).length;
                      return k + ": " + (len / 1000).toFixed(1) + "k" + (len > 45000 ? " ⚠️" : "");
                    })
                    .join("\n");
                  info += "\n\n📦 데이터 크기 (시트당 한도 50k):\n" + sizes;
                } catch(e) {}
                alert(info);
              }}
              style={{
                fontSize:10,
                padding:"3px 7px",
                borderRadius:10,
                background: storageMode==="shared" ? "rgba(46,213,115,.15)" : storageMode==="local" ? "rgba(255,71,87,.15)" : "rgba(255,255,255,.08)",
                color: storageMode==="shared" ? "#2ed573" : storageMode==="local" ? "#ff4757" : "#aaa",
                fontWeight:600,
                cursor: "pointer"
              }}>
              {storageMode==="shared" ? "공유됨" : storageMode==="local" ? "저장 대기중" : "연결중"}
            </span>
            <button className="btn bs sm" onClick={manualRefresh} title="새로고침">🔄</button>
            <button className="btn bs sm" onClick={()=>setModal({type:"pin"})}>🔐 관리자</button>
          </div>
        </div>
        <div className="pg">
          {!svSid && adminDevice ? (
            <div style={{textAlign:"center",padding:"48px 16px"}}>
              <div style={{fontSize:34,marginBottom:10}}>🔐</div>
              <div style={{fontSize:16,fontWeight:700,marginBottom:6}}>관리자 전용 기기</div>
              <div style={{fontSize:12,color:"#888",marginBottom:18}}>이 기기는 관리자 전용으로 고정되어 있어요.<br/>관리자 PIN을 입력하세요.</div>
              <button className="btn bp" onClick={()=>setModal({type:"pin"})}>🔐 관리자 PIN 입력</button>
            </div>
          ) : !svSid ? (
            <div>
              <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>안녕하세요 👋</div>
              <div style={{fontSize:12,color:"#888",marginBottom:14}}>이름을 선택하세요.</div>
              <div className="spc">
                {(data.staff||[]).map(s => (
                  <div key={s.id} className="sc" onClick={()=>{
                    if (s.pin) {
                      // PIN 설정된 경우 → PIN 입력 모달
                      setModal({type:"staffPin", staffId: s.id});
                    } else {
                      setSvSid(s.id);
                      setSvDate(todayStr());
                      setSvSel(null);
                      saveSession(s.id); // 로그인 유지
                      notifyLoginEvent(s.id, s.name, "in");
                    }
                  }}>
                    <div className="sav" style={{background:s.color}}>{s.name.slice(0, 1)}</div>
                    <div className="snm">
                      {s.name}
                      {s.pin ? <span style={{fontSize:9,marginLeft:3,color:"#888"}}>🔒</span> : null}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{marginTop:18,textAlign:"center"}}>
                <button className="btn bs sm" style={{fontSize:11,color:"#888"}} onClick={()=>setModal({type:"kioskGate", intent:"lock"})}>🏪 매장 기기 설정</button>
                <div style={{fontSize:9,color:"#bbb",marginTop:4}}>매장 아이패드를 출퇴근 전용 모드로 잠글 때만 사용</div>
              </div>
            </div>
          ) : (
            <div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                <button className="btn bs sm" onClick={()=>{
                  const me = gSt(svSid);
                  clearSession(); // 저장된 세션 삭제 — 다음에 열면 이름 선택 화면
                  notifyLoginEvent(svSid, me?.name || "", "out");
                  setSvSid(null);
                  setSvSel(null);
                }}>🚪 로그아웃</button>
                <div style={{fontSize:14,fontWeight:700}}>{gSt(svSid)?.name} 님</div>
              </div>
              <div className="card">
                <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>📅 날짜 선택</div>
                <input type="date" value={svDate} onChange={e=>{setSvDate(e.target.value); setSvSel(null);}} style={{maxWidth:200,marginBottom:12}} />
                {holName ? (
                  <div className="notice n-red">🎌 공휴일: {holName}</div>
                ) : null}
                {vacN && !holName ? (
                  <div className="notice n-grn">🏖 {vacN} 기간</div>
                ) : null}
                {dow === 0 && !holName ? (
                  <div className="notice n-red">🚫 일요일 휴무</div>
                ) : null}
                {/* 선택한 날짜의 배정 현황 (달력 날짜 탭 → 여기서 확인) */}
                {slots.length > 0 ? (
                  <div style={{background:"#f5f5f7",borderRadius:8,padding:"9px 11px",marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:5}}>
                      👥 {svDate} ({dowKo(svDate)}) 배정 현황
                    </div>
                    {["오프닝", "클로징"].map(tp => {
                      const assigned = (data.shifts||[]).filter(s => s.date===svDate && s.slotType===tp);
                      return (
                        <div key={tp} style={{display:"flex",alignItems:"center",gap:6,padding:"2px 0",fontSize:12}}>
                          <span className={"badge " + (tp==="오프닝"?"bylw":"bgrn")}>{tp==="오프닝"?"🌅":"🌆"} {tp}</span>
                          {assigned.length === 0 ? (
                            <span style={{color:"#aaa"}}>미배정</span>
                          ) : assigned.map(s => {
                            const st = gSt(s.staffId);
                            return (
                              <span key={s.id} style={{fontWeight:700,color:st?.color||"#666"}}>
                                <span className="dot" style={{background:st?.color||"#999"}} />
                                {st?.name || "?"}{s.staffId===svSid ? " (나)" : ""}
                              </span>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                <div style={{fontSize:12,fontWeight:700,marginBottom:7}}>⏰ 근무 타입</div>
                {slots.length === 0 ? (
                  <div style={{color:"#888",fontSize:12}}>근무 없음</div>
                ) : (
                  slots.map(sl => {
                    const isTaken = taken.includes(sl.type);
                    const isFixed = fixedTypes.includes(sl.type);
                    let cls = "slb";
                    if (isTaken) cls += " taken";
                    else if (isFixed) cls += " fxd";
                    if (svSel === sl.type) cls += " sel";
                    return (
                      <button key={sl.type} className={cls} onClick={()=>{ if (!isTaken) setSvSel(sl.type); }}>
                        <div className="sln">
                          {sl.type === "오프닝" ? "🌅" : "🌆"} {sl.type}
                          {isTaken ? (
                            <span style={{fontSize:10,color:takenBy[sl.type]===svSid?"#2ed573":"#888",marginLeft:6}}>
                              {takenBy[sl.type]===svSid ? "✓ 등록됨" : `✓ ${gSt(takenBy[sl.type])?.name || "?"} 등록`}
                            </span>
                          ) : null}
                          {isFixed && !isTaken ? <span style={{fontSize:10,color:"#c47ff5",marginLeft:6}}>📌 고정</span> : null}
                        </div>
                        <div className="slt">{sl.start}~{sl.end} {sl.hours}h</div>
                      </button>
                    );
                  })
                )}
                {svSel ? (
                  <button className="btn bp" style={{width:"100%",marginTop:4}} onClick={doSave}>✅ 저장하기</button>
                ) : null}
              </div>

              {/* 출근 알림 카드 (푸시 설정 완료 전에는 미노출) */}
              <StaffPushCard staffId={svSid} staffName={gSt(svSid)?.name} toast={showToast} />

              {/* 체크리스트 + 매뉴얼 카드 */}
              <div className="card">
                <div style={{fontSize:13,fontWeight:700,marginBottom:9}}>📋 일일 체크리스트</div>
                {(() => {
                  const today = todayStr();
                  // 오늘 내 시프트 가져오기
                  const myTodayShifts = (data.shifts||[]).filter(s => s.date === today && s.staffId === svSid);
                  const hasOpening = myTodayShifts.some(s => s.slotType === "오프닝");
                  const hasClosing = myTodayShifts.some(s => s.slotType === "클로징");

                  // 시간대 필터링
                  const allLists = (data.checklists||[]).sort((a,b)=>(a.order||0)-(b.order||0));
                  const filtered = allLists.filter(cl => {
                    const t = cl.type || "all";
                    if (t === "all") return true;
                    if (t === "opening" && hasOpening) return true;
                    if (t === "closing" && hasClosing) return true;
                    return false;
                  });

                  // 안내 메시지
                  let hint = null;
                  if (myTodayShifts.length === 0) {
                    hint = (
                      <div style={{fontSize:11,color:"#888",padding:"8px 10px",background:"#f5f5f7",borderRadius:6,marginBottom:8}}>
                        💡 오늘 등록된 시프트가 없어요. 모든 체크리스트를 표시합니다.
                      </div>
                    );
                  } else {
                    const types = [];
                    if (hasOpening) types.push("🌅 오프닝");
                    if (hasClosing) types.push("🌙 클로징");
                    hint = (
                      <div style={{fontSize:11,color:"#1971c2",padding:"8px 10px",background:"rgba(77,171,247,.1)",borderRadius:6,marginBottom:8}}>
                        ✨ 오늘 {types.join(" + ")} 시프트 — 해당 체크리스트만 표시됩니다
                      </div>
                    );
                  }

                  // 시프트 없으면 모두 표시, 있으면 필터링
                  const toShow = myTodayShifts.length === 0 ? allLists : filtered;

                  if (allLists.length === 0) {
                    return <p style={{color:"#888",fontSize:12}}>체크리스트가 아직 없습니다</p>;
                  }
                  if (toShow.length === 0) {
                    return (
                      <>
                        {hint}
                        <p style={{color:"#888",fontSize:12,textAlign:"center",padding:10}}>
                          오늘 시프트에 해당하는 체크리스트가 없습니다
                        </p>
                      </>
                    );
                  }

                  return (
                    <>
                      {hint}
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        {toShow.map(cl => {
                          const myCompletion = (data.completions||[]).find(c =>
                            c.checklistId === cl.id &&
                            c.staffId === svSid &&
                            c.date === today
                          );
                          const checkedCount = myCompletion?.checkedItems?.length || 0;
                          const total = cl.items.length;
                          const isComplete = myCompletion?.complete;
                          const inProgress = !isComplete && checkedCount > 0;
                          return (
                            <button
                              key={cl.id}
                              onClick={()=>setModal({type:"checklistRun", checklistId: cl.id, staffId: svSid})}
                              style={{
                                background: isComplete
                                  ? "linear-gradient(135deg, rgba(46,213,115,.15), rgba(77,171,247,.1))"
                                  : inProgress
                                    ? "rgba(245,197,24,.15)"
                                    : "#f5f5f7",
                                border: isComplete
                                  ? "1.5px solid #2ed573"
                                  : inProgress
                                    ? "1.5px solid #f5c518"
                                    : "1px solid #e0e0e0",
                                borderRadius: 9,
                                padding: "12px 10px",
                                cursor: "pointer",
                                textAlign: "left",
                                fontFamily: "'Noto Sans KR', sans-serif"
                              }}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                                <span style={{fontSize:18}}>{cl.icon}</span>
                                {isComplete ? (
                                  <span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:"#2ed573",color:"#fff",fontWeight:700}}>✓ 완료</span>
                                ) : inProgress ? (
                                  <span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:"#f5c518",color:"#000",fontWeight:700}}>진행중</span>
                                ) : null}
                              </div>
                              <div style={{fontSize:13,fontWeight:700,color:"#1a1a1a"}}>{cl.name}</div>
                              <div style={{fontSize:11,color:"#666",marginTop:3}}>
                                {checkedCount} / {total}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}

                {/* 매뉴얼 링크 */}
                {data.settings?.manualUrl ? (
                  <a
                    href={data.settings.manualUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display:"block",
                      marginTop:10,
                      padding:"10px 12px",
                      background:"linear-gradient(135deg, rgba(77,171,247,.12), rgba(165,94,234,.1))",
                      border:"1px solid #4dabf7",
                      borderRadius:8,
                      textDecoration:"none",
                      color:"#1971c2",
                      fontSize:13,
                      fontWeight:600,
                      textAlign:"center"
                    }}>
                    📘 직원 매뉴얼 보기 →
                  </a>
                ) : null}
              </div>

              <div className="card">
                <div style={{fontSize:13,fontWeight:700,marginBottom:9}}>📌 내 앞으로 스케줄</div>
                {(() => {
                  const me = gSt(svSid);
                  const wage = me?.wage || 0;

                  // 월별 급여 계산 함수
                  const calcMonthSalary = (ym) => {
                    const monthShifts = (data.shifts||[]).filter(s =>
                      s.staffId === svSid && s.date.startsWith(ym)
                    );
                    let h = 0;
                    monthShifts.forEach(s => { h += shiftHours(s); });
                    const basePay = h * wage;

                    // 이번달 급여 레코드(확정/실근무)
                    const myRec = (data.payrollRecords||[]).find(p => p.staffId===svSid && p.ym===ym);
                    // 지난달의 조정이 이 달에 반영 (carry-in: 차감 음수 / 추가 양수)
                    const ci = getCarryIn(data.payrollRecords, svSid, ym);
                    const adj = ci.rec;
                    const isAdd = ci.isAdd;
                    const adjAmt = Math.abs(ci.amount);
                    // 확정값(명세서)이 있으면 그걸 지급액으로, 없으면 스케줄급여±carry-in
                    const baseConfirm = (myRec && myRec.amount != null) ? myRec.amount : basePay;
                    const finalPay = myRec ? baseConfirm : (basePay + ci.amount);

                    const payment = (data.payments||[]).find(p =>
                      p.staffId === svSid && p.ym === ym
                    );
                    const status = payment
                      ? (payment.status || (payment.paid ? "paid" : "none"))
                      : "none";

                    return {
                      ym, hours: h, basePay, finalPay,
                      adjustment: adj ? {isAdd, amount: adjAmt, desc: adj.desc} : null,
                      payment,
                      status,
                      isPaid: status === "paid",
                      isReady: status === "ready",
                      shiftCount: monthShifts.length
                    };
                  };

                  // 이전달, 이번달, 다음달
                  const ymNow = curYM();
                  const [yN, mN] = ymNow.split("-").map(Number);
                  const ymPrev = mN === 1 ? `${yN-1}-12` : `${yN}-${String(mN-1).padStart(2,"0")}`;
                  const ymNext = mN === 12 ? `${yN+1}-01` : `${yN}-${String(mN+1).padStart(2,"0")}`;

                  const months = [
                    { label: "지난달", ym: ymPrev, color: "#888" },
                    { label: "이번달", ym: ymNow, color: "#1971c2", main: true },
                    { label: "다음달 (예정)", ym: ymNext, color: "#7950f2" }
                  ];

                  const monthsData = months.map(m => ({ ...m, ...calcMonthSalary(m.ym) }));

                  return (
                    <div style={{marginBottom:12}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                        <span style={{fontSize:11,color:"#666",fontWeight:600}}>
                          💰 내 급여 (시급 €{fmtE(wage)}/h)
                        </span>
                        <button
                          onClick={()=>openVertrag(me)}
                          title="내 근로계약서 (급여 자동 채움) 열기"
                          style={{fontSize:10,fontWeight:700,padding:"5px 10px",border:"1px solid #a5d8ff",borderRadius:6,background:"#e7f5ff",color:"#1971c2",cursor:"pointer",fontFamily:"'Noto Sans KR',sans-serif"}}>
                          📄 내 계약서
                        </button>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1.5fr 1fr",gap:8}}>
                        {monthsData.map(m => (
                          <div key={m.ym} style={{
                            background: m.main ? "linear-gradient(135deg, rgba(77,171,247,.15), rgba(165,94,234,.1))" : "#f8f9fa",
                            border: m.main ? `2px solid ${m.color}` : `1px solid #e0e0e0`,
                            borderRadius: 10,
                            padding: m.main ? "12px 12px" : "10px 10px"
                          }}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                              <span style={{fontSize:10,color:m.color,fontWeight:700}}>{m.label}</span>
                              {m.isPaid ? (
                                <span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:"rgba(46,213,115,.2)",color:"#20a060",fontWeight:700}}>✓지급완료</span>
                              ) : m.isReady ? (
                                <span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:"rgba(245,197,24,.25)",color:"#b8860b",fontWeight:700}}>📦준비완료</span>
                              ) : m.shiftCount > 0 ? (
                                <span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:"rgba(255,71,87,.15)",color:"#e63946",fontWeight:700}}>미지급</span>
                              ) : null}
                            </div>
                            <div style={{fontSize:9,color:"#888",marginBottom:3}}>{m.ym}</div>
                            <div style={{
                              fontSize: m.main ? 22 : 16,
                              fontWeight: 700,
                              color: m.color,
                              fontFamily: "'Space Mono', monospace",
                              lineHeight: 1.1
                            }}>
                              €{fmtE(m.finalPay)}
                            </div>
                            <div style={{fontSize:10,color:"#666",marginTop:4}}>
                              {m.hours}h · {m.shiftCount}회
                            </div>
                            {m.adjustment ? (
                              <div style={{
                                fontSize: 10,
                                color: m.adjustment.isAdd ? "#20a060" : "#e63946",
                                marginTop: 5,
                                padding: "3px 5px",
                                background: "#fff",
                                borderRadius: 3,
                                fontWeight: 600
                              }}>
                                {m.adjustment.isAdd ? "+" : "-"}€{fmtE(m.adjustment.amount)} 조정
                              </div>
                            ) : null}
                            {m.isPaid && m.payment.method ? (
                              <div style={{fontSize:9,color:"#666",marginTop:3}}>
                                {m.payment.method} · {m.payment.paidDate || ""}
                              </div>
                            ) : null}
                            {/* 준비완료 → 직원이 "받았어요" 버튼 누름 */}
                            {m.isReady ? (
                              <button
                                onClick={async () => {
                                  if (!confirm(`${m.ym} 급여를 받으셨다고 표시할까요?\n(€${fmtE(m.payment.amount || m.finalPay)})`)) return;
                                  const newPayments = (data.payments||[]).map(p =>
                                    p.id === m.payment.id
                                      ? {...p, status:"paid", paid:true, paidDate: todayStr()}
                                      : p
                                  );
                                  const ok = await persist({...data, payments: newPayments});
                                  if (ok) showToast("✅ 받음으로 표시!");
                                }}
                                style={{
                                  marginTop: 6,
                                  width: "100%",
                                  padding: "6px",
                                  background: "#2ed573",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: 5,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  fontFamily: "'Noto Sans KR', sans-serif"
                                }}>
                                💰 받았어요!
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      <div style={{fontSize:9,color:"#aaa",marginTop:6,textAlign:"center"}}>
                        💡 다음달은 현재까지 등록된 스케줄 기준 예상치입니다
                      </div>
                    </div>
                  );
                })()}
                {myS.length === 0 ? (
                  <p style={{color:"#888",fontSize:12}}>등록된 스케줄 없음 (오늘 이후)</p>
                ) : (
                  <table className="tbl">
                    <thead><tr><th>날짜</th><th>타입</th><th>예정</th><th>실제</th><th>출퇴근</th><th>급여</th><th></th></tr></thead>
                    <tbody>
                      {myS.map(s => {
                        const me = gSt(svSid);
                        const h = shiftHours(s);
                        const pay = h * (me?.wage || 0);
                        const today = todayStr();
                        const isToday = s.date === today;
                        const isPast = s.date < today;
                        const checkedIn = !!s.actualStart;
                        const checkedOut = !!s.actualEnd;

                        // 관리자 폰 출퇴근 푸시 (fire-and-forget — 실패해도 체크인/아웃에 영향 없음)
                        const notifyClockEvent = (type, time, planned) => {
                          try {
                            fetch(GAS_URL, {
                              method: "POST",
                              body: JSON.stringify({
                                pushAction: "clockEvent",
                                staffId: svSid,
                                staffName: me?.name || "",
                                type, time, planned: planned || ""
                              }),
                              headers: { "Content-Type": "text/plain;charset=utf-8" },
                              redirect: "follow"
                            }).catch(() => {});
                          } catch (e) { /* 무시 */ }
                        };

                        const doCheckIn = async () => {
                          const now = new Date();
                          const hh = String(now.getHours()).padStart(2,"0");
                          const mm = String(now.getMinutes()).padStart(2,"0");
                          const time = `${hh}:${mm}`;
                          const newShifts = (data.shifts||[]).map(sh =>
                            sh.id === s.id ? {...sh, actualStart: time} : sh
                          );
                          const ok = await persist({...data, shifts: newShifts});
                          if (ok) showToast(`✅ 출근 완료 (${time})`);
                          notifyClockEvent("in", time, s.start);
                        };

                        const doCheckOut = async () => {
                          const now = new Date();
                          const hh = String(now.getHours()).padStart(2,"0");
                          const mm = String(now.getMinutes()).padStart(2,"0");
                          const time = `${hh}:${mm}`;
                          // 차이 계산 (분)
                          const [psh, psm] = s.start.split(":").map(Number);
                          const [peh, pem] = s.end.split(":").map(Number);
                          const plannedMin = (peh*60+pem) - (psh*60+psm);
                          const [ash, asm] = (s.actualStart || s.start).split(":").map(Number);
                          const actualMin = (now.getHours()*60+now.getMinutes()) - (ash*60+asm);
                          const diffMin = actualMin - plannedMin;

                          let updatedShift = {...s, actualEnd: time};
                          // 30분 이상 차이나면 사유 입력 받기
                          if (Math.abs(diffMin) >= 30) {
                            const more = diffMin > 0;
                            const absMin = Math.abs(diffMin);
                            const hh2 = Math.floor(absMin / 60);
                            const mm2 = absMin % 60;
                            const diffText = (hh2 > 0 ? `${hh2}시간` : "") + (mm2 > 0 ? `${mm2}분` : "");
                            const reason = prompt(
                              `⚠️ 예정보다 ${diffText} ${more ? "더" : "덜"} 일하셨네요.\n` +
                              `사장님께 전할 메모를 남겨주세요:\n` +
                              `(예: "추가 근무 요청받음", "조기 퇴근 허락받음")`,
                              s.memo || ""
                            );
                            if (reason !== null) {
                              updatedShift.memo = reason || "";
                            } else {
                              // 취소 누름 — 퇴근 체크 안 함
                              return;
                            }
                          }

                          // 서랍 현금 입력 모달로 넘김 — 모달에서 최종 persist + 퇴근 푸시 + 토스트 처리
                          setModal({ type: "cashOut", shift: updatedShift, staffId: svSid, staffName: me?.name || "", outTime: time, planned: s.end });
                        };

                        return (
                          <tr key={s.id}>
                            <td style={{fontSize:11,whiteSpace:"nowrap"}}>
                              {s.date.slice(5)} <span style={{color:"#888"}}>({dowKo(s.date)})</span>
                            </td>
                            <td><span className={"badge " + (s.slotType === "오프닝" ? "bylw" : "bgrn")}>{s.slotType}</span></td>
                            <td className="mn" style={{fontSize:10,color:"#888"}}>{s.start}~{s.end}</td>
                            <td className="mn" style={{fontSize:10}}>
                              {checkedIn ? (
                                <span style={{color:"#20a060"}}>{s.actualStart}~{s.actualEnd || "..."}</span>
                              ) : isPast ? (
                                <span style={{color:"#aaa"}}>—</span>
                              ) : (
                                <span style={{color:"#bbb"}}>—</span>
                              )}
                            </td>
                            <td>
                              {checkedOut ? (
                                <span style={{fontSize:10,color:"#20a060",fontWeight:600}}>✓ 완료</span>
                              ) : checkedIn ? (
                                <span style={{fontSize:10,color:"#e8590c",fontWeight:600}}>근무중</span>
                              ) : (
                                <span style={{fontSize:9,color:"#aaa"}} title="출퇴근은 매장 기기(kiosk)에서만 가능합니다">🏪 매장기기</span>
                              )}
                            </td>
                            <td className="mn" style={{color:"#1971c2",fontSize:11}}>€{fmtE(pay)}</td>
                            <td><button className="btn bd sm" onClick={()=>doCancel(s.id)}>취소</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
          <div className="card">
            <div style={{fontSize:13,fontWeight:700,marginBottom:9}}>📋 {viewYM} 전체 스케줄</div>
            {(() => {
              // 보고 있는 달 부족한 날 계산
              const [y, m] = viewYM.split("-").map(Number);
              const dim = new Date(y, m, 0).getDate();
              const hols = hessenHols(y);
              const understaffed = [];
              for (let d = 1; d <= dim; d++) {
                const ds = `${viewYM}-${String(d).padStart(2,"0")}`;
                const dow = new Date(ds).getDay();
                if (dow === 0 || hols[ds] || isVac(ds)) continue;
                const cnt = (data.shifts||[]).filter(s => s.date === ds).length;
                if (cnt < 2) understaffed.push({date:ds, day:d, count:cnt});
              }
              if (understaffed.length === 0) return null;
              return (
                <div style={{
                  background: "rgba(255, 212, 0, 0.25)",
                  border: "1.5px solid #ffd400",
                  borderRadius: 8,
                  padding: "10px 12px",
                  marginBottom: 10,
                  fontSize: 12
                }}>
                  <div style={{color:"#b8860b", fontWeight:700, marginBottom:5}}>
                    ⚠️ 사람이 부족한 날 ({understaffed.length}일) — 도와주세요!
                  </div>
                  <div style={{display:"flex", gap:5, flexWrap:"wrap"}}>
                    {understaffed.map(u => (
                      <span
                        key={u.date}
                        onClick={()=>{ setSvDate(u.date); setSvSel(null); }}
                        style={{
                          background:"rgba(255,212,0,.4)",
                          color:"#b8860b",
                          padding:"3px 8px",
                          borderRadius:5,
                          fontWeight:600,
                          fontSize:11,
                          cursor:"pointer"
                        }}>
                        {u.day}일 ({u.count}/2)
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
            {/* 달력 — 직원 화면용 */}
            {(() => {
              const hols = hessenHols(svCalY);
              const first = new Date(svCalY, svCalM, 1).getDay();
              const dim = new Date(svCalY, svCalM+1, 0).getDate();
              const dprev = new Date(svCalY, svCalM, 0).getDate();
              const cells = [];
              for (let i = first - 1; i >= 0; i--) cells.push({ d: dprev - i, other: true });
              for (let i = 1; i <= dim; i++) cells.push({ d: i, other: false });
              while (cells.length % 7 !== 0) cells.push({ d: cells.length - first - dim + 1, other: true });
              const td = todayStr();

              const prevM = () => {
                if (svCalM === 0) { setSvCalY(y => y-1); setSvCalM(11); }
                else setSvCalM(m => m-1);
              };
              const nextM = () => {
                if (svCalM === 11) { setSvCalY(y => y+1); setSvCalM(0); }
                else setSvCalM(m => m+1);
              };

              return (
                <div style={{marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{fontSize:14,fontWeight:700}}>{svCalY}년 {svCalM+1}월</div>
                    <div style={{display:"flex",gap:5}}>
                      <button className="btn bs sm" onClick={prevM}>◀</button>
                      <button className="btn bs sm" onClick={nextM}>▶</button>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,marginBottom:6,fontSize:10,color:"#888",flexWrap:"wrap"}}>
                    <span>📅 날짜 클릭 → 등록</span>
                    <span style={{color:"#b8860b"}}>⚠️ 노란색 = 인원 부족</span>
                  </div>
                  <div className="cg">
                    {DOW_KO.map((d, i) => (
                      <div key={d} className="cdow" style={{color: i===0 ? "#e63946" : ""}}>{d}</div>
                    ))}
                    {cells.map((c, idx) => {
                      const ds = `${svCalY}-${String(svCalM+1).padStart(2,"0")}-${String(c.d).padStart(2,"0")}`;
                      const dow = new Date(ds).getDay();
                      const isH = !c.other && !!hols[ds];
                      const isV = !c.other && isVac(ds);
                      const isT = ds === td && !c.other;
                      const isSelected = ds === svDate && !c.other;
                      const shifts = (data.shifts||[]).filter(s => s.date === ds);
                      const isBusinessDay = !c.other && dow !== 0 && !isH && !isV;
                      const isUnderstaffed = isBusinessDay && shifts.length < 2;
                      const myRegistered = svSid && shifts.some(s => s.staffId === svSid);
                      let nc = "#666";
                      if ((dow === 0 || isH) && !c.other) nc = "#e63946";
                      else if (isV && !c.other) nc = "#20a060";
                      else if (isUnderstaffed) nc = "#b8860b";
                      let cls = "cday";
                      if (c.other) cls += " other";
                      if (isH) cls += " hol";
                      if (isV && !isH) cls += " vac";
                      if (isUnderstaffed) cls += " understaffed";
                      if (isT) cls += " today";
                      const handleClick = () => {
                        if (c.other) return;
                        setSvDate(ds);
                        setSvSel(null);
                        // 달력 클릭 시 위로 스크롤해서 날짜 선택 카드 보이게
                        try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch(e) {}
                      };
                      const cellStyle = isSelected ? {
                        outline: "2.5px solid #4dabf7",
                        outlineOffset: "-2px"
                      } : {};
                      return (
                        <div key={idx} className={cls} onClick={handleClick} style={cellStyle}>
                          <div className="dn" style={{color:nc, display:"flex", alignItems:"center", gap:3}}>
                            {c.d}
                            {myRegistered ? <span style={{fontSize:8, color:"#4dabf7"}}>★</span> : null}
                            {isUnderstaffed ? <span style={{fontSize:9, color:"#b8860b"}}>⚠️</span> : null}
                          </div>
                          {(() => {
                            const openings = shifts.filter(s => s.slotType === "오프닝");
                            const closings = shifts.filter(s => s.slotType !== "오프닝");
                            const chip = (sh, cls) => {
                              const st = gSt(sh.staffId);
                              const bg = st ? (st.color + "28") : "#ddd";
                              const fg = st ? st.color : "#888";
                              const nm = st ? st.name.slice(0, 3) : "?";
                              return <div key={sh.id} className={"sp " + cls} style={{background:bg, color:fg}}>{nm}</div>;
                            };
                            return (
                              <>
                                {/* 오프닝 = 위 */}
                                <div className="spgrp">
                                  {openings.slice(0, 3).map(sh => chip(sh, "sp-open"))}
                                  {openings.length > 3 ? <div style={{fontSize:7,color:"#888"}}>+{openings.length-3}</div> : null}
                                </div>
                                {/* 클로징 = 아래 */}
                                <div className="spgrp spgrp-bottom">
                                  {closings.slice(0, 3).map(sh => chip(sh, "sp-close"))}
                                  {closings.length > 3 ? <div style={{fontSize:7,color:"#888"}}>+{closings.length-3}</div> : null}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            {allS.length === 0 ? (
              <p style={{color:"#888",fontSize:12}}>없음</p>
            ) : (
              <table className="tbl">
                <thead><tr><th>날짜</th><th>요일</th><th>직원</th><th>타입</th><th>시간</th></tr></thead>
                <tbody>
                  {allS.map(s => {
                    const st = gSt(s.staffId);
                    return (
                      <tr key={s.id}>
                        <td>{s.date}</td>
                        <td>{dowKo(s.date)}</td>
                        <td><span className="dot" style={{background:st?.color||"#666"}} />{st?.name||"?"}</td>
                        <td><span className={"badge " + (s.slotType === "오프닝" ? "bylw" : "bgrn")}>{s.slotType}</span></td>
                        <td className="mn" style={{fontSize:11}}>{s.start}~{s.end}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
}

export { StaffView };
