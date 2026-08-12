import { useState } from "react";
import { dowKo, todayStr, fmtE } from "../lib/utils";
import { GAS_URL } from "../data/gas";

// ─── 매장 기기(kiosk) 코드 설정 (관리자 직원관리 화면) ───
// settings.kioskCode 에 저장. 이 코드로 매장 아이패드를 '출퇴근 전용 모드'로 잠그고/해제.
function KioskCodeSetting({ data, persist, toast }) {
  const cur = (data.settings && data.settings.kioskCode) || "";
  const [code, setCode] = useState(cur);
  const save = async () => {
    await persist({ ...data, settings: { ...(data.settings||{}), kioskCode: (code||"").trim() } });
    toast("🏪 kiosk 코드 저장됨");
  };
  return (
    <div>
      <div style={{fontSize:11,color:"#888",marginBottom:8,lineHeight:1.5}}>
        매장 아이패드를 이 코드로 <strong>출퇴근 전용 모드</strong>로 잠급니다. 잠금 해제도 이 코드가 필요해요 (직원이 못 빠져나가 매출·대사 등 못 봄).
        <br/><span style={{color:"#b8860b"}}>⚠️ localStorage 토큰이라 100% 철벽은 아님 — 브라우저 데이터를 지우면 재설정 필요하고, 작정하면 우회 가능. 일반 직원 원격 출근 차단엔 충분합니다.</span>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <input type="text" value={code} onChange={e=>setCode(e.target.value)} placeholder="예: 4자리 이상" style={{maxWidth:170}} />
        <button className="btn bp sm" onClick={save}>저장</button>
        {cur ? <span style={{fontSize:10,color:"#2f9e44"}}>✓ 설정됨</span> : <span style={{fontSize:10,color:"#aaa"}}>미설정</span>}
      </div>
    </div>
  );
}

// ─── kiosk 잠금/해제 코드 입력 모달 ───
// intent="lock": 로그인화면에서 이 기기를 kiosk로 잠금 / intent="unlock": kiosk에서 빠져나가기
function KioskGateModal({ modal, data, close, onSuccess, toast }) {
  const isLock = modal.intent === "lock";
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const submit = () => {
    const set = (data.settings && data.settings.kioskCode) || "";
    if (!set) { setErr("사장님이 아직 kiosk 코드를 설정하지 않았어요 (관리자 → 직원 화면에서 설정)"); return; }
    if ((code||"").trim() === set) {
      onSuccess();
      close();
      toast(isLock ? "🏪 출퇴근 전용 모드로 잠금" : "🔓 기기 잠금 해제");
    } else {
      setErr("코드가 틀렸습니다");
    }
  };
  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" style={{maxWidth:340}}>
        <h3>{isLock ? "🏪 매장 기기로 잠그기" : "🔓 기기 잠금 해제"}</h3>
        <div style={{fontSize:11,color:"#666",background:"#f5f5f7",borderRadius:8,padding:10,marginBottom:12,lineHeight:1.5}}>
          {isLock
            ? "이 기기를 출퇴근 전용 화면으로 잠급니다. 매출·스케줄·대사 등 민감 정보는 안 보이고, 해제하려면 이 코드가 필요합니다."
            : "출퇴근 전용 모드를 해제합니다. 사장님만 아는 코드를 입력하세요."}
        </div>
        <div className="fr">
          <div>
            <label>kiosk 코드</label>
            <input type="password" autoFocus value={code} onChange={e=>{setCode(e.target.value); setErr("");}}
              onKeyDown={e=>{ if(e.key==="Enter") submit(); }} placeholder="사장님 설정 코드" />
          </div>
        </div>
        {err ? <div style={{color:"#e03131",fontSize:11,marginBottom:8}}>{err}</div> : null}
        <div className="mf">
          <button className="btn bs" onClick={close}>취소</button>
          <button className="btn bp" onClick={submit}>{isLock ? "잠그기" : "해제"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── 출퇴근 전용 화면(kiosk) ───
// 매장 아이패드 전용. 오직 직원 선택 → 본인 PIN → 출근/퇴근(+서랍 현금). 민감정보 전혀 없음.
// 출퇴근·현금입력은 이 화면(잠긴 기기)에서만 가능.
function KioskView({ data, persist, setModal, toast, onExit }) {
  const [selId, setSelId] = useState(null);
  const [authed, setAuthed] = useState(false);
  const [pinBuf, setPinBuf] = useState("");
  const [pinErr, setPinErr] = useState("");

  const staff = (data.staff||[]);
  const sel = staff.find(s => s.id === selId);
  const today = todayStr();
  const myShifts = (data.shifts||[])
    .filter(s => s.staffId === selId && s.date === today && (s.slotType==="오프닝" || s.slotType==="클로징"))
    .sort((a,b) => (a.slotType==="오프닝"?0:1) - (b.slotType==="오프닝"?0:1));

  const notifyClock = (staffName, type, time, planned) => {
    try {
      fetch(GAS_URL, { method:"POST", body: JSON.stringify({ pushAction:"clockEvent", staffId: selId, staffName, type, time, planned: planned||"" }),
        headers:{"Content-Type":"text/plain;charset=utf-8"}, redirect:"follow" }).catch(()=>{});
    } catch(e){}
  };
  const nowHM = () => { const n=new Date(); return `${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`; };

  const pickStaff = (s) => { setSelId(s.id); setPinErr(""); setPinBuf(""); setAuthed(!s.pin); };
  const back = () => { setSelId(null); setAuthed(false); setPinBuf(""); setPinErr(""); };
  const doPin = (d) => {
    if (pinBuf.length >= 4) return;
    const nb = pinBuf + d; setPinBuf(nb); setPinErr("");
    if (nb.length === 4) {
      if (sel && nb === sel.pin) { setAuthed(true); setPinBuf(""); }
      else { setPinErr("PIN 오류"); setTimeout(()=>setPinBuf(""), 600); }
    }
  };

  const doCheckIn = (s) => {
    const time = nowHM();
    // 오프닝: 시작 시재 입력 / 클로징: 오프닝 인계액 인수 확인 — 둘 다 cashIn 모달이 최종 persist + 출근 푸시 처리
    setModal({ type:"cashIn", shift:{...s, actualStart:time}, staffId: selId, staffName: sel?.name||"", inTime: time, planned: s.start });
  };
  const doCheckOut = (s) => {
    const time = nowHM();
    // 서랍 현금 입력 모달로 넘김 (cash 모달이 최종 persist + 퇴근 푸시 처리)
    setModal({ type:"cashOut", shift:{...s, actualEnd:time}, staffId: selId, staffName: sel?.name||"", outTime: time, planned: s.end });
  };

  return (
    <div>
      <div className="tb">
        <div className="logo">💙 HAMAFILM<small>출퇴근</small></div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:10,color:"#2f9e44",fontWeight:600,padding:"3px 8px",borderRadius:10,background:"rgba(46,213,115,.12)"}}>매장 기기</span>
          <button className="btn bs sm" onClick={onExit} title="사장님 코드 필요">나가기</button>
        </div>
      </div>
      <div className="pg">
        {!selId ? (
          <div>
            <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>출근 · 퇴근</div>
            <div style={{fontSize:12,color:"#888",marginBottom:16}}>본인 이름을 선택하세요.</div>
            <div className="spc">
              {staff.map(s => (
                <div key={s.id} className="sc" onClick={()=>pickStaff(s)}>
                  <div className="sav" style={{background:s.color}}>{s.name.slice(0,1)}</div>
                  <div className="snm">{s.name}</div>
                </div>
              ))}
            </div>
          </div>
        ) : !authed ? (
          <div style={{maxWidth:320,margin:"0 auto"}}>
            <div className="pb" style={{boxShadow:"none",padding:0}}>
              <div className="sav" style={{background: sel?.color || "#4dabf7", margin:"0 auto 8px"}}>{sel?.name?.slice(0,1)||"?"}</div>
              <div style={{fontSize:15,fontWeight:700,marginBottom:4,textAlign:"center"}}>{sel?.name} 님</div>
              <div style={{fontSize:12,color:"#888",marginBottom:14,textAlign:"center"}}>PIN을 입력하세요</div>
              <div className="pds">
                {[0,1,2,3].map(i => <div key={i} className={"pde" + (i < pinBuf.length ? " f" : "")} />)}
              </div>
              {pinErr ? <div style={{color:"#ff4757",fontSize:12,marginBottom:8,textAlign:"center"}}>{pinErr}</div> : null}
              <div className="ppd">
                {[1,2,3,4,5,6,7,8,9].map(d => <button key={d} className="pb2" onClick={()=>doPin(String(d))}>{d}</button>)}
                <button className="pb2" onClick={()=>doPin("0")} style={{gridColumn:2}}>0</button>
                <button className="pb2" style={{fontSize:14,color:"#888"}} onClick={()=>setPinBuf(b=>b.slice(0,-1))}>⌫</button>
              </div>
              <button style={{background:"none",border:"none",color:"#888",fontSize:12,cursor:"pointer",display:"block",margin:"0 auto"}} onClick={back}>← 뒤로</button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <button className="btn bs sm" onClick={back}>← 뒤로</button>
              <div style={{fontSize:16,fontWeight:700}}>{sel?.name} 님 · 오늘 근무</div>
            </div>
            <div className="card">
              <div style={{fontSize:11,color:"#888",marginBottom:10}}>{today} ({dowKo(today)}) — 출근/퇴근을 눌러주세요.</div>
              {myShifts.length === 0 ? (
                <div style={{color:"#888",fontSize:13,padding:16,textAlign:"center"}}>오늘 배정된 근무가 없어요.</div>
              ) : myShifts.map(s => {
                const checkedIn = !!s.actualStart;
                const checkedOut = !!s.actualEnd;
                return (
                  <div key={s.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 6px",borderBottom:"1px solid #eee",flexWrap:"wrap",gap:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span className={"badge " + (s.slotType==="오프닝"?"bylw":"bgrn")}>{s.slotType}</span>
                      <span className="mn" style={{fontSize:12,color:"#888"}}>{s.start}~{s.end}</span>
                      {checkedIn ? <span className="mn" style={{fontSize:11,color:"#20a060"}}>{s.actualStart}~{s.actualEnd||"..."}</span> : null}
                      {s.cashCount != null ? <span style={{fontSize:11,color:"#1971c2"}}>€{fmtE(s.cashCount)}</span> : null}
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      {!checkedIn ? (
                        <button className="btn bp" onClick={()=>doCheckIn(s)}>출근</button>
                      ) : !checkedOut ? (
                        <>
                          <button className="btn bs" onClick={()=>setModal({ type:"quickReport", shift:s, staffId:selId, staffName: sel?.name||"" })}>
                            일 기록{Array.isArray(s.report) && s.report.length ? ` ${s.report.length}건` : ""}
                          </button>
                          <button className="btn bp" onClick={()=>doCheckOut(s)}>퇴근</button>
                        </>
                      ) : (
                        <span style={{fontSize:13,color:"#20a060",fontWeight:700}}>✓ 완료</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{fontSize:10,color:"#aaa",textAlign:"center",marginTop:12}}>오프닝 출근 시 시작 시재, 퇴근 시 서랍 현금 총액을 입력합니다 (오프닝=인계 / 클로징=마감).</div>
          </div>
        )}
      </div>
    </div>
  );
}

export { KioskCodeSetting, KioskGateModal, KioskView };
