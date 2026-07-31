import { useState, useEffect } from "react";
import { hessenHols, getSlots, todayStr, curYM, fmtE, nid } from "../../lib/utils";

// 시프트 수정 모달 (관리자용 — 시간/실제출퇴근/메모 조정)
function EditShiftModal({ modal, data, persist, close, toast, gSt }) {
  const sh = modal.shift;
  const [start, setStart] = useState(sh.start || "");
  const [end, setEnd] = useState(sh.end || "");
  const [hours, setHours] = useState(sh.hours || 0);
  const [actualStart, setActualStart] = useState(sh.actualStart || "");
  const [actualEnd, setActualEnd] = useState(sh.actualEnd || "");
  const [memo, setMemo] = useState(sh.memo || "");
  const [autoCalc, setAutoCalc] = useState(true); // 시간 자동계산

  // 자동 계산
  useEffect(() => {
    if (autoCalc && start && end) {
      const [sh1, sm1] = start.split(":").map(Number);
      const [eh1, em1] = end.split(":").map(Number);
      const h = ((eh1*60+em1) - (sh1*60+sm1)) / 60;
      if (h > 0) setHours(h);
    }
  }, [start, end, autoCalc]);

  const st = gSt(sh.staffId);
  const pay = (parseFloat(hours) || 0) * (st?.wage || 0);

  const save = async () => {
    if (!start || !end) { toast("시간 입력"); return; }
    const newShifts = (data.shifts||[]).map(x =>
      x.id === sh.id ? {...x,
        start, end,
        hours: parseFloat(hours) || 0,
        actualStart: actualStart || null,
        actualEnd: actualEnd || null,
        memo
      } : x
    );
    await persist({...data, shifts: newShifts});
    close();
    toast("✅ 수정 완료");
  };

  const remove = async () => {
    if (!confirm("이 스케줄 삭제?")) return;
    await persist({...data, shifts: (data.shifts||[]).filter(x => x.id !== sh.id)});
    close();
    toast("삭제됨");
  };

  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>스케줄 수정</h3>
        <div style={{background:"#f5f5f7",borderRadius:7,padding:"8px 11px",fontSize:12,marginBottom:10}}>
          <span className="dot" style={{background:st?.color||"#666"}} />
          <strong>{st?.name}</strong> · {sh.date} · <span className={"badge " + (sh.slotType === "오프닝" ? "bylw" : "bgrn")}>{sh.slotType}</span>
        </div>

        <div style={{fontSize:11,fontWeight:700,color:"#1971c2",marginTop:8,marginBottom:6}}>📅 예정 시간 (급여 계산용)</div>
        <div className="fr fc2">
          <div>
            <label>시작</label>
            <input type="time" value={start} onChange={e=>setStart(e.target.value)} />
          </div>
          <div>
            <label>종료</label>
            <input type="time" value={end} onChange={e=>setEnd(e.target.value)} />
          </div>
        </div>
        <div className="fr fc2">
          <div>
            <label>시간(h) {autoCalc ? "(자동)" : "(수동)"}</label>
            <input
              type="number"
              step="0.5"
              value={hours}
              onChange={e=>{setAutoCalc(false); setHours(e.target.value);}}
              style={{
                background: !autoCalc ? "rgba(255,212,0,.1)" : ""
              }}
            />
          </div>
          <div style={{display:"flex",alignItems:"flex-end"}}>
            <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11,marginBottom:8,cursor:"pointer"}}>
              <input
                type="checkbox"
                checked={autoCalc}
                onChange={e=>setAutoCalc(e.target.checked)}
                style={{width:"auto"}}
              />
              자동 계산
            </label>
          </div>
        </div>
        <div style={{fontSize:11,color:"#888",marginBottom:10,padding:"6px 8px",background:"rgba(77,171,247,.08)",borderRadius:5}}>
          💡 자동 계산 끄면 30분 추가 같은 수동 조정 가능
        </div>

        <div style={{fontSize:11,fontWeight:700,color:"#7950f2",marginTop:8,marginBottom:6}}>⏱️ 실제 출퇴근 (선택)</div>
        <div className="fr fc2">
          <div>
            <label>실제 출근</label>
            <input type="time" value={actualStart} onChange={e=>setActualStart(e.target.value)} />
          </div>
          <div>
            <label>실제 퇴근</label>
            <input type="time" value={actualEnd} onChange={e=>setActualEnd(e.target.value)} />
          </div>
        </div>

        <div className="fr">
          <div>
            <label>메모</label>
            <input value={memo} onChange={e=>setMemo(e.target.value)} placeholder="예: 30분 추가 근무" />
          </div>
        </div>

        <div style={{background:"linear-gradient(135deg, rgba(77,171,247,.12), rgba(165,94,234,.1))",border:"1px solid #4dabf7",borderRadius:7,padding:"10px 12px",fontSize:12,marginTop:10}}>
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <span>예상 급여</span>
            <strong style={{color:"#1971c2",fontFamily:"monospace"}}>
              €{fmtE(pay)} <span style={{fontSize:10,color:"#888"}}>({hours}h × €{fmtE(st?.wage || 0)})</span>
            </strong>
          </div>
        </div>

        <div className="mf">
          <button className="btn bd" onClick={remove}>삭제</button>
          <button className="btn bs" onClick={close}>취소</button>
          <button className="btn bp" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

function AddShiftModal({ modal, data, persist, close, toast, gSt, isVac, vacName }) {
  const [sid, setSid] = useState(data.staff[0]?.id || 1);
  const [date, setDate] = useState(modal.date || todayStr());
  const [sel, setSel] = useState(null);
  const [memo, setMemo] = useState("");
  const [cs, setCs] = useState("13:00");
  const [ce, setCe] = useState("15:00");
  const hols = hessenHols(new Date(date).getFullYear());
  const dow = new Date(date).getDay();
  const slots = getSlots(date);
  const st = gSt(sid);
  const ch = (() => {
    const [sh, sm] = cs.split(":").map(Number);
    const [eh, em] = ce.split(":").map(Number);
    return ((eh*60+em) - (sh*60+sm)) / 60;
  })();
  const prev = sel === "custom"
    ? fmtE(Math.max(ch, 0) * (st?.wage || 0))
    : sel ? fmtE((slots.find(s=>s.type===sel)?.hours || 0) * (st?.wage || 0)) : "";

  const showWarn = hols[date] || dow === 0 || isVac(date);
  let warnText = "";
  if (hols[date]) warnText = "🚫 공휴일: " + hols[date];
  else if (isVac(date)) warnText = "🚫 방학 (" + vacName(date) + ")";
  else if (dow === 0) warnText = "🚫 일요일";

  const save = async () => {
    if (!sel) { toast("근무 타입 선택"); return; }
    let start, end, slotType, hours;
    if (sel === "custom") {
      if (ch <= 0) { toast("시간 확인"); return; }
      start = cs; end = ce; slotType = "직접입력"; hours = ch;
    } else {
      const slot = slots.find(s => s.type === sel);
      if (!slot) return;
      // 같은 날짜+같은 타입(오프닝/클로징)은 한 명만 — 이미 배정돼 있으면 차단
      const dup = (data.shifts||[]).find(s => s.date===date && s.slotType===sel);
      if (dup) {
        const who = gSt(dup.staffId)?.name || "다른 직원";
        toast(dup.staffId === sid ? "이미 등록됨" : `❌ ${date} ${sel}은 이미 ${who} 배정됨`);
        return;
      }
      start = slot.start; end = slot.end; slotType = slot.type; hours = slot.hours;
    }
    await persist({...data, shifts: [...(data.shifts||[]), {
      id: nid(data.shifts||[]), staffId: sid, date, start, end, slotType, hours, memo, source: "manual"
    }]});
    close();
    toast("✅ 저장!");
  };

  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>스케줄 추가</h3>
        <div className="fr fc2">
          <div>
            <label>직원</label>
            <select value={sid} onChange={e=>setSid(parseInt(e.target.value))}>
              {data.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label>날짜</label>
            <input type="date" value={date} onChange={e=>{setDate(e.target.value);setSel(null);}} />
          </div>
        </div>
        {showWarn ? <div className="notice n-red">{warnText}</div> : null}
        <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:6}}>근무 타입</div>
        {slots.map(sl => (
          <button key={sl.type} className={"slb" + (sel===sl.type ? " sel" : "")} onClick={()=>setSel(sl.type)}>
            <div className="sln">{sl.type === "오프닝" ? "🌅" : "🌆"} {sl.type}</div>
            <div className="slt">{sl.start}~{sl.end} {sl.hours}h</div>
          </button>
        ))}
        <button className={"slb" + (sel === "custom" ? " sel" : "")} onClick={()=>setSel("custom")}>
          <div className="sln">🕐 직접 입력</div>
          <div className="slt">자유 시간 설정</div>
        </button>
        {sel === "custom" ? (
          <div style={{background:"rgba(245,197,24,.06)",border:"2px solid #f5c518",borderRadius:8,padding:12,marginBottom:8}}>
            <div className="fr fc2">
              <div>
                <label>출근</label>
                <input type="time" value={cs} onChange={e=>setCs(e.target.value)} />
              </div>
              <div>
                <label>퇴근</label>
                <input type="time" value={ce} onChange={e=>setCe(e.target.value)} />
              </div>
            </div>
            {ch > 0 ? <div style={{fontSize:12,color:"#2ed573"}}>{ch}시간</div> : null}
          </div>
        ) : null}
        {sel ? (
          <div style={{background:"#f5f5f7",borderRadius:7,padding:9,fontSize:12,color:"#888",marginBottom:4}}>
            예상: <strong style={{color:"#f5c518"}}>€{prev}</strong>
          </div>
        ) : null}
        <div className="fr">
          <div>
            <label>메모</label>
            <input value={memo} onChange={e=>setMemo(e.target.value)} placeholder="선택사항" />
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

function AddFixedModal({ data, persist, close, toast }) {
  const [sid, setSid] = useState(data.staff[0]?.id || 1);
  const [type, setType] = useState("오프닝");
  const [dows, setDows] = useState([]);
  const DN = ["", "월", "화", "수", "목", "금", "토"];
  const toggle = (d) => {
    setDows(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };
  const save = async () => {
    if (!dows.length) { toast("요일 선택"); return; }
    await persist({...data, fixed: [...(data.fixed||[]), {
      id: nid(data.fixed||[]), staffId: sid, dows, type
    }]});
    close();
    toast("고정 스케줄 저장!");
  };
  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>고정 스케줄 추가</h3>
        <div className="fr fc2">
          <div>
            <label>직원</label>
            <select value={sid} onChange={e=>setSid(parseInt(e.target.value))}>
              {data.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label>타입</label>
            <select value={type} onChange={e=>setType(e.target.value)}>
              <option value="오프닝">🌅 오프닝</option>
              <option value="클로징">🌆 클로징</option>
            </select>
          </div>
        </div>
        <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:5}}>요일 선택</div>
        <div className="dp">
          {[1,2,3,4,5,6].map(d => (
            <div key={d} className={"dpl" + (dows.includes(d) ? " on" : "")} onClick={()=>toggle(d)}>{DN[d]}</div>
          ))}
        </div>
        <div className="notice n-blu" style={{marginTop:8}}>
          💡 월~목 오프닝 13~16 / 클로징 16~20:30 / 금 클로징 16~21 / 토 오프닝 11~16
        </div>
        <div className="mf">
          <button className="btn bs" onClick={close}>취소</button>
          <button className="btn bp" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

function AddVacModal({ data, persist, close, toast }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [name, setName] = useState("");
  const save = async () => {
    if (!start || !end) { toast("날짜 입력"); return; }
    if (start > end) { toast("날짜 오류"); return; }
    await persist({...data, vacations: [...(data.vacations||[]), {
      id: nid(data.vacations||[]), start, end, name: name || "방학"
    }]});
    close();
    toast("방학 기간 저장!");
  };
  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>방학 기간 추가</h3>
        <div className="fr fc2">
          <div>
            <label>시작일</label>
            <input type="date" value={start} onChange={e=>setStart(e.target.value)} />
          </div>
          <div>
            <label>종료일</label>
            <input type="date" value={end} onChange={e=>setEnd(e.target.value)} />
          </div>
        </div>
        <div className="fr">
          <div>
            <label>이름</label>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="여름방학" />
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

function GenFixedModal({ modal, data, persist, close, toast, isVac }) {
  const [ym, setYm] = useState(modal.ym || curYM());
  const gen = async () => {
    if (!(data.fixed||[]).length) { toast("고정 스케줄 먼저 등록하세요"); return; }
    const [y, m] = ym.split("-").map(Number);
    const hols = hessenHols(y);
    const dim = new Date(y, m, 0).getDate();
    let added = 0;
    const ns = [...(data.shifts||[])];
    for (let d = 1; d <= dim; d++) {
      const ds = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const dow = new Date(ds).getDay();
      if (dow === 0 || hols[ds] || isVac(ds)) continue;
      (data.fixed||[]).forEach(fx => {
        if (!fx.dows.includes(dow)) return;
        const slot = getSlots(ds).find(s => s.type === fx.type);
        if (!slot) return;
        // 같은 날짜+같은 타입에 누군가(본인 포함) 이미 배정돼 있으면 생성 안 함
        if (ns.find(s => s.date===ds && s.slotType===fx.type)) return;
        ns.push({
          id: nid(ns), staffId: fx.staffId, date: ds,
          start: slot.start, end: slot.end, slotType: slot.type,
          hours: slot.hours, memo: "", source: "fixed"
        });
        added++;
      });
    }
    await persist({...data, shifts: ns});
    close();
    toast("⚡ " + ym + " 스케줄 " + added + "개 생성!");
  };
  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>⚡ 고정 스케줄 자동 생성</h3>
        <div style={{fontSize:12,color:"#888",marginBottom:12}}>방학·공휴일·일요일 제외, 중복 생성 안 함</div>
        <div className="fr">
          <div>
            <label>생성할 월</label>
            <input type="month" value={ym} onChange={e=>setYm(e.target.value)} />
          </div>
        </div>
        <div className="mf">
          <button className="btn bs" onClick={close}>취소</button>
          <button className="btn bp" onClick={gen}>⚡ 생성</button>
        </div>
      </div>
    </div>
  );
}

export { EditShiftModal, AddShiftModal, AddFixedModal, AddVacModal, GenFixedModal };
