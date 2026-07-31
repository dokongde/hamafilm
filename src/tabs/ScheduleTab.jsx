import { hessenHols, DOW_KO, dowKo, todayStr, fmtE, shiftHours, timeDiff, needsAttention } from "../lib/utils";

  // ─── 달력 ───
function ScheduleTab({ calM, calY, data, gSt, isVac, persist, setCalM, setCalY, setModal, showToast }) {
    const hols = hessenHols(calY);
    const first = new Date(calY, calM, 1).getDay();
    const dim = new Date(calY, calM+1, 0).getDate();
    const dprev = new Date(calY, calM, 0).getDate();
    const cells = [];
    for (let i = first - 1; i >= 0; i--) cells.push({ d: dprev - i, other: true });
    for (let i = 1; i <= dim; i++) cells.push({ d: i, other: false });
    while (cells.length % 7 !== 0) cells.push({ d: cells.length - first - dim + 1, other: true });
    const td = todayStr();
    const pfx = `${calY}-${String(calM+1).padStart(2,"0")}`;
    const ms = (data.shifts||[]).filter(s => s.date.startsWith(pfx)).sort((a, b) => a.date.localeCompare(b.date));

    // 이번달 부족한 날(영업일이지만 스케줄 2개 미만) 계산
    const understaffedDays = [];
    for (let d = 1; d <= dim; d++) {
      const ds = `${calY}-${String(calM+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const dow = new Date(ds).getDay();
      const isH = !!hols[ds];
      const isV = isVac(ds);
      if (dow === 0 || isH || isV) continue; // 비영업일은 제외
      const shiftCount = (data.shifts||[]).filter(s => s.date === ds).length;
      if (shiftCount < 2) {
        understaffedDays.push({ date: ds, day: d, count: shiftCount });
      }
    }

    const prevMonth = () => {
      if (calM === 0) { setCalY(y => y-1); setCalM(11); }
      else setCalM(m => m-1);
    };
    const nextMonth = () => {
      if (calM === 11) { setCalY(y => y+1); setCalM(0); }
      else setCalM(m => m+1);
    };

    return (
      <div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{fontSize:16,fontWeight:700}}>{calY}년 {calM+1}월</div>
          <div style={{display:"flex",gap:5}}>
            <button className="btn bs sm" onClick={prevMonth}>◀</button>
            <button className="btn bs sm" onClick={nextMonth}>▶</button>
            <button className="btn bg2 sm" onClick={()=>setModal({type:"genFixed", ym:pfx})}>⚡고정</button>
            <button className="btn bp sm" onClick={()=>setModal({type:"addShift", date:todayStr()})}>+추가</button>
          </div>
        </div>
        {understaffedDays.length > 0 ? (
          <div style={{
            background: "rgba(255, 212, 0, 0.25)",
            border: "1.5px solid #ffd400",
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 10,
            fontSize: 12
          }}>
            <div style={{color:"#b8860b", fontWeight:700, marginBottom:5}}>
              ⚠️ 스케줄 부족: {understaffedDays.length}일
            </div>
            <div style={{display:"flex", gap:5, flexWrap:"wrap"}}>
              {understaffedDays.map(u => (
                <span
                  key={u.date}
                  onClick={()=>setModal({type:"dayDetail", date:u.date})}
                  style={{
                    background:"rgba(255,212,0,.4)",
                    color:"#b8860b",
                    padding:"3px 8px",
                    borderRadius:5,
                    fontWeight:600,
                    cursor:"pointer",
                    fontSize:11
                  }}>
                  {u.day}일 ({u.count}/2)
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {/* 오늘 체크리스트 진행상황 */}
        {(() => {
          const today = todayStr();
          const lists = data.checklists || [];
          if (lists.length === 0) return null;
          const todayCompletions = (data.completions||[]).filter(c => c.date === today);
          const withNotes = todayCompletions.filter(c => c.note && c.note.trim());

          // 오늘 매장에 등록된 시프트들로 어떤 type이 필요한지 판단
          const todayShifts = (data.shifts||[]).filter(s => s.date === today);
          const hasOpening = todayShifts.some(s => s.slotType === "오프닝");
          const hasClosing = todayShifts.some(s => s.slotType === "클로징");

          // 오늘 필요한 체크리스트만
          const relevantLists = lists.filter(cl => {
            const t = cl.type || "all";
            if (t === "all") return true;
            if (t === "opening" && hasOpening) return true;
            if (t === "closing" && hasClosing) return true;
            return false;
          });

          if (relevantLists.length === 0 && withNotes.length === 0) return null;

          return (
            <div style={{
              background: "rgba(77,171,247,.08)",
              border: "1px solid rgba(77,171,247,.3)",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 10,
              fontSize: 12
            }}>
              <div style={{color:"#1971c2", fontWeight:700, marginBottom:7}}>
                📋 오늘 체크리스트 ({today})
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {relevantLists.map(cl => {
                  const completions = todayCompletions.filter(c => c.checklistId === cl.id);
                  const completed = completions.filter(c => c.complete);
                  const inProgress = completions.filter(c => !c.complete && c.checkedItems.length > 0);
                  const status = completed.length > 0 ? "done" : inProgress.length > 0 ? "progress" : "none";
                  const typeLabel = cl.type === "opening" ? "🌅" : cl.type === "closing" ? "🌙" : "";
                  return (
                    <div key={cl.id} style={{
                      background: status === "done"
                        ? "rgba(46,213,115,.2)"
                        : status === "progress"
                          ? "rgba(245,197,24,.25)"
                          : "rgba(255,71,87,.1)",
                      border: status === "done"
                        ? "1px solid #2ed573"
                        : status === "progress"
                          ? "1px solid #f5c518"
                          : "1px solid rgba(255,71,87,.4)",
                      color: status === "done"
                        ? "#20a060"
                        : status === "progress"
                          ? "#b8860b"
                          : "#c92a3a",
                      padding:"4px 9px",
                      borderRadius:5,
                      fontWeight:600,
                      fontSize:11
                    }}>
                      {typeLabel}{cl.icon} {cl.name}: {completed.length > 0 ? `✓ ${completed.map(c=>c.staffName).join(", ")}` : inProgress.length > 0 ? `진행중 (${inProgress.map(c=>c.staffName).join(", ")})` : "미완료"}
                    </div>
                  );
                })}
              </div>
              {withNotes.length > 0 ? (
                <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid rgba(77,171,247,.2)"}}>
                  <div style={{fontSize:10,color:"#888",fontWeight:600,marginBottom:4}}>📝 직원 메모:</div>
                  {withNotes.map(c => {
                    const cl = lists.find(l => l.id === c.checklistId);
                    return (
                      <div key={c.id} style={{
                        fontSize:11,
                        background:"#fff",
                        borderRadius:5,
                        padding:"5px 8px",
                        marginBottom:3
                      }}>
                        <strong>{c.staffName}</strong>
                        <span style={{color:"#888",marginLeft:4}}>· {cl?.icon} {cl?.name}</span>
                        <div style={{color:"#1a1a1a",marginTop:2}}>💬 {c.note}</div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })()}

        {/* 직원 취소 알림 */}
        {(() => {
          const cancellations = (data.cancellations||[]).filter(c => !c.viewed)
            .sort((a, b) => b.cancelledAt.localeCompare(a.cancelledAt));
          if (cancellations.length === 0) return null;
          return (
            <div style={{
              background: "rgba(255, 71, 87, 0.12)",
              border: "1.5px solid #e63946",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 10,
              fontSize: 12
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                <div style={{color:"#c92a3a", fontWeight:700}}>
                  🔔 직원 취소 알림 ({cancellations.length}건)
                </div>
                <button
                  className="btn bs sm"
                  onClick={async () => {
                    if (!confirm("모든 취소 알림을 확인 처리할까요?")) return;
                    const updated = (data.cancellations||[]).map(c => ({...c, viewed: true}));
                    await persist({...data, cancellations: updated});
                    showToast("모두 확인됨");
                  }}>
                  모두 확인
                </button>
              </div>
              {cancellations.slice(0, 5).map(c => {
                const st = gSt(c.staffId);
                const time = new Date(c.cancelledAt).toLocaleString("ko-KR", {month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"});
                return (
                  <div key={c.id} style={{
                    background:"#fff",
                    border:"1px solid #ffc1c8",
                    borderRadius:6,
                    padding:"8px 10px",
                    marginBottom:5
                  }}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12}}>
                          <span className="dot" style={{background:st?.color || "#666"}} />
                          <strong>{c.staffName || st?.name || "?"}</strong>
                          <span style={{marginLeft:6,color:"#666"}}>
                            {c.date} <span className={"badge " + (c.slotType==="오프닝"?"bylw":"bgrn")} style={{marginLeft:3}}>{c.slotType}</span>
                          </span>
                        </div>
                        <div style={{fontSize:11,color:"#1a1a1a",marginTop:3,padding:"4px 7px",background:"#f5f5f7",borderRadius:4}}>
                          💬 {c.reason}
                        </div>
                        <div style={{fontSize:10,color:"#888",marginTop:3}}>{time}</div>
                      </div>
                      <button
                        className="btn bs sm"
                        onClick={async () => {
                          const updated = (data.cancellations||[]).map(x =>
                            x.id === c.id ? {...x, viewed: true} : x
                          );
                          await persist({...data, cancellations: updated});
                        }}>
                        확인
                      </button>
                    </div>
                  </div>
                );
              })}
              {cancellations.length > 5 ? (
                <div style={{fontSize:10,color:"#888",textAlign:"center",marginTop:3}}>
                  ... +{cancellations.length - 5}건 더 (모두 확인 또는 개별 확인)
                </div>
              ) : null}
            </div>
          );
        })()}

        {/* 30분 이상 추가/단축 근무 알림 */}
        {(() => {
          // 이번달 시프트 중 출퇴근 체크된 것에서 30분 이상 차이 찾기
          const flagged = (data.shifts||[])
            .filter(s => s.date.startsWith(pfx))
            .filter(s => s.actualStart && s.actualEnd)
            .filter(needsAttention)
            .sort((a,b) => b.date.localeCompare(a.date));

          if (flagged.length === 0) return null;
          return (
            <div style={{
              background: "rgba(165, 94, 234, 0.15)",
              border: "1.5px solid #a55eea",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 10,
              fontSize: 12
            }}>
              <div style={{color:"#7950f2", fontWeight:700, marginBottom:5}}>
                ⏰ 예정과 30분 이상 차이 — 확인 필요 ({flagged.length}건)
              </div>
              <div style={{display:"flex", gap:5, flexWrap:"wrap"}}>
                {flagged.slice(0, 12).map(s => {
                  const st = gSt(s.staffId);
                  const diff = timeDiff(s);
                  const more = diff > 0;
                  const absMin = Math.abs(diff);
                  const hh = Math.floor(absMin / 60);
                  const mm = absMin % 60;
                  const diffText = (hh > 0 ? `${hh}h` : "") + (mm > 0 ? `${mm}분` : "");
                  return (
                    <span
                      key={s.id}
                      onClick={()=>setModal({type:"editShift", shift: s})}
                      style={{
                        background: more ? "rgba(46,213,115,.25)" : "rgba(255,71,87,.2)",
                        color: more ? "#20a060" : "#e63946",
                        padding:"3px 8px",
                        borderRadius:5,
                        fontWeight:600,
                        cursor:"pointer",
                        fontSize:11,
                        display:"inline-flex",
                        alignItems:"center",
                        gap:4
                      }}>
                      <span className="dot" style={{background:st?.color||"#666",width:5,height:5}} />
                      {st?.name} · {s.date.slice(5)} {more ? "+" : "-"}{diffText}
                    </span>
                  );
                })}
                {flagged.length > 12 ? (
                  <span style={{fontSize:10,color:"#888",alignSelf:"center"}}>... +{flagged.length - 12}건</span>
                ) : null}
              </div>
              <div style={{fontSize:10,color:"#7950f2",marginTop:6}}>
                💡 클릭하면 시프트 수정 화면 → 인정 시 시간 조정으로 급여 반영
              </div>
            </div>
          );
        })()}
        <div className="cg">
          {DOW_KO.map((d, i) => (
            <div key={d} className="cdow" style={{color: i===0 ? "#ff4757" : ""}}>{d}</div>
          ))}
          {cells.map((c, idx) => {
            const ds = `${calY}-${String(calM+1).padStart(2,"0")}-${String(c.d).padStart(2,"0")}`;
            const dow = new Date(ds).getDay();
            const isH = !c.other && !!hols[ds];
            const isV = !c.other && isVac(ds);
            const isT = ds === td && !c.other;
            const shifts = (data.shifts||[]).filter(s => s.date === ds);
            // 영업일(공휴일·일요일·방학 아닌 날)인데 스케줄이 2개 미만이면 부족 경고
            const isBusinessDay = !c.other && dow !== 0 && !isH && !isV;
            const isUnderstaffed = isBusinessDay && shifts.length < 2;
            let nc = "#aaa";
            if ((dow === 0 || isH) && !c.other) nc = "#ff4757";
            else if (isV && !c.other) nc = "#2ed573";
            else if (isUnderstaffed) nc = "#b8860b";
            const cls = "cday" +
              (c.other ? " other" : "") +
              (isH ? " hol" : "") +
              (isV && !isH ? " vac" : "") +
              (isUnderstaffed ? " understaffed" : "") +
              (isT ? " today" : "");
            const handleClick = () => { if (!c.other) setModal({type:"dayDetail", date:ds}); };
            return (
              <div key={idx} className={cls} onClick={handleClick}>
                <div className="dn" style={{color:nc, display:"flex", alignItems:"center", gap:3}}>
                  {c.d}
                  {isUnderstaffed ? <span style={{fontSize:9, color:"#b8860b"}}>⚠️</span> : null}
                </div>
                {(() => {
                  const openings = shifts.filter(s => s.slotType === "오프닝");
                  const closings = shifts.filter(s => s.slotType !== "오프닝");
                  const chip = (sh, cls) => {
                    const st = gSt(sh.staffId);
                    const bg = st ? (st.color + "28") : "#333";
                    const fg = st ? st.color : "#aaa";
                    const nm = st ? st.name.slice(0, 3) : "?";
                    return <div key={sh.id} className={"sp " + cls} style={{background:bg, color:fg}}>{nm}</div>;
                  };
                  return (
                    <>
                      {/* 오프닝 = 위 */}
                      <div className="spgrp">
                        {openings.slice(0, 3).map(sh => chip(sh, "sp-open"))}
                        {openings.length > 3 ? <div style={{fontSize:7,color:"#888"}}>+{openings.length-3}</div> : null}
                        {isUnderstaffed && shifts.length === 0 ? (
                          <div style={{fontSize:8, color:"#b8860b", fontWeight:700, marginTop:1}}>비어있음</div>
                        ) : null}
                        {isUnderstaffed && shifts.length === 1 ? (
                          <div style={{fontSize:8, color:"#b8860b", fontWeight:700, marginTop:1}}>1명만</div>
                        ) : null}
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
        <div style={{marginTop:14}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:8}}>이번달 스케줄</div>
          <div className="card" style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead>
                <tr><th>직원</th><th>날짜</th><th>타입</th><th>시간</th><th>h</th><th>급여</th><th>출처</th><th></th></tr>
              </thead>
              <tbody>
                {ms.length === 0 ? (
                  <tr><td colSpan={8} style={{textAlign:"center",color:"#888",padding:14}}>없음</td></tr>
                ) : (
                  ms.map(sh => {
                    const st = gSt(sh.staffId);
                    const h = shiftHours(sh);
                    const pay = fmtE(h * (st?.wage || 0));
                    let srcCls = "bgry";
                    let srcLbl = "수동";
                    if (sh.source === "fixed") { srcCls = "bprp"; srcLbl = "고정"; }
                    else if (sh.source === "share") { srcCls = "bblu"; srcLbl = "직원"; }
                    let typeCls = "bgry";
                    if (sh.slotType === "오프닝") typeCls = "bylw";
                    else if (sh.slotType === "클로징") typeCls = "bgrn";
                    return (
                      <tr key={sh.id}>
                        <td><span className="dot" style={{background:st?.color||"#666"}} />{st?.name||"?"}</td>
                        <td>{sh.date}({dowKo(sh.date)})</td>
                        <td><span className={"badge " + typeCls}>{sh.slotType}</span></td>
                        <td className="mn" style={{fontSize:11}}>{sh.start}~{sh.end}</td>
                        <td>{h}h</td>
                        <td className="pos">€{pay}</td>
                        <td><span className={"badge " + srcCls}>{srcLbl}</span></td>
                        <td>
                          <button className="btn bd sm" onClick={async()=>{
                            await persist({...data, shifts:(data.shifts||[]).filter(s=>s.id!==sh.id)});
                            showToast("삭제");
                          }}>삭제</button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
}

export { ScheduleTab };
