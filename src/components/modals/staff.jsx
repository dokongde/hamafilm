import { useState } from "react";
import { nid } from "../../lib/utils";
import { savePin } from "../../data/gas";

function PinChange({ pin, setPin }) {
  const [np, setNp] = useState("");
  const [cp, setCp] = useState("");
  const [msg, setMsg] = useState("");
  const submit = async () => {
    if (np.length !== 4) { setMsg("4자리 입력"); return; }
    if (np !== cp) { setMsg("PIN 불일치"); return; }
    await savePin(np);
    setPin(np);
    setMsg("✅ 변경 완료!");
    setNp("");
    setCp("");
  };
  return (
    <div>
      <div className="fr fc2">
        <div>
          <label>새 PIN (4자리)</label>
          <input type="password" maxLength={4} value={np} onChange={e=>setNp(e.target.value)} placeholder="****" />
        </div>
        <div>
          <label>확인</label>
          <input type="password" maxLength={4} value={cp} onChange={e=>setCp(e.target.value)} placeholder="****" />
        </div>
      </div>
      {msg ? <div style={{fontSize:12,color:msg.includes("완료")?"#2ed573":"#ff4757",marginBottom:6}}>{msg}</div> : null}
      <button className="btn bp sm" onClick={submit}>변경</button>
    </div>
  );
}

function AddStaffModal({ modal, data, persist, close, toast }) {
  const ed = modal.edit;
  const [name, setName] = useState(ed?.name || "");
  const [phone, setPhone] = useState(ed?.phone || "");
  const [wage, setWage] = useState(ed?.wage || 14);
  const [color, setColor] = useState(ed?.color || "#5352ed");
  const [pin, setPin] = useState(ed?.pin || "");
  const [kurzStart, setKurzStart] = useState(ed?.kurzStart || "");
  const [empType, setEmpType] = useState(ed?.empType || "");
  const [contractSigned, setContractSigned] = useState(ed?.contractSigned || false);
  const [contractDate, setContractDate] = useState(ed?.contractDate || "");
  const [contractNote, setContractNote] = useState(ed?.contractNote || "");
  const colors = ["#5352ed","#ff6b35","#4ecdc4","#f5c518","#ff4757","#2ed573","#a55eea","#ff6b9d","#00d2d3","#ff9ff3"];
  const save = async () => {
    if (!name) { toast("이름 입력"); return; }
    if (pin && !/^\d{4}$/.test(pin)) { toast("PIN은 4자리 숫자"); return; }
    let nd;
    if (ed) {
      nd = {...data, staff: data.staff.map(s => s.id===ed.id ? {...s, name, phone, wage: parseFloat(wage), color, pin, kurzStart, empType, contractSigned, contractDate, contractNote} : s)};
    } else {
      nd = {...data, staff: [...data.staff, {id: nid(data.staff), name, phone, wage: parseFloat(wage), color, pin, kurzStart, empType, contractSigned, contractDate, contractNote}]};
    }
    await persist(nd);
    close();
    toast("저장!");
  };
  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>{ed ? "직원 수정" : "직원 추가"}</h3>
        <div className="fr fc2">
          <div>
            <label>이름</label>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="홍길동" />
          </div>
          <div>
            <label>연락처</label>
            <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="010-..." />
          </div>
        </div>
        <div className="fr fc2">
          <div>
            <label>시급 (€)</label>
            <input type="number" value={wage} onChange={e=>setWage(e.target.value)} step="0.01" />
          </div>
          <div>
            <label>색상</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
              {colors.map(c => (
                <div key={c} onClick={()=>setColor(c)} style={{width:22,height:22,borderRadius:"50%",background:c,cursor:"pointer",border: color===c ? "2px solid #4dabf7" : "2px solid transparent"}} />
              ))}
            </div>
          </div>
        </div>
        <div className="fr">
          <div>
            <label>🔒 개인 PIN (4자리, 선택사항)</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={e=>setPin(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="공란이면 PIN 없음"
              style={{fontFamily:"monospace",letterSpacing:4,textAlign:"center"}}
            />
            <div style={{fontSize:10,color:"#888",marginTop:3}}>
              💡 PIN 설정 시: 본인 이름 클릭하면 PIN 입력 필요
            </div>
          </div>
        </div>
        <div className="fr">
          <div>
            <label>📋 고용 형태</label>
            <select value={empType} onChange={e=>setEmpType(e.target.value)}>
              <option value="">미설정</option>
              <option value="kurz">단기고용 (kurzfristig · 연 70일)</option>
              <option value="mini">미니잡 (월 603€ 이내)</option>
            </select>
            <div style={{fontSize:10,color:"#888",marginTop:3}}>
              💡 미니잡으로 설정하면 급여 탭의 70일 카운터에서 빠집니다.
            </div>
          </div>
        </div>
        {empType !== "mini" ? (
          <div className="fr">
            <div>
              <label>🗓 단기고용 계약 시작일 (70일 카운트 시작)</label>
              <input type="date" value={kurzStart} onChange={e=>setKurzStart(e.target.value)} />
              <div style={{fontSize:10,color:"#888",marginTop:3}}>
                💡 공식 등록·계약 시작일부터 근무일을 셉니다. 같은 해에 다른 단기 알바로 일한 일수는 법적으로 합산되니 계약서에 기재해두세요.
              </div>
            </div>
          </div>
        ) : null}
        <div className="fr">
          <div>
            <label>✍️ 서명한 계약서 접수</label>
            <label style={{display:"flex",alignItems:"center",gap:8,fontWeight:400,fontSize:13,cursor:"pointer",marginTop:2}}>
              <input type="checkbox" checked={contractSigned} style={{width:"auto"}}
                onChange={e=>{
                  setContractSigned(e.target.checked);
                  if (e.target.checked && !contractDate) setContractDate(new Date().toISOString().slice(0,10));
                }} />
              서명한 계약서를 받았음
            </label>
          </div>
        </div>
        {contractSigned ? (
          <div className="fr fc2">
            <div>
              <label>받은 날짜</label>
              <input type="date" value={contractDate} onChange={e=>setContractDate(e.target.value)} />
            </div>
            <div>
              <label>보관 위치 (메모)</label>
              <input value={contractNote} onChange={e=>setContractNote(e.target.value)} placeholder="예: 드라이브 계약서폴더 / 캐비닛" />
            </div>
          </div>
        ) : null}
        <div style={{fontSize:10,color:"#888",margin:"2px 0 4px",lineHeight:1.5}}>
          💡 알바생이 서명 후 사진 찍어 보내면 구글 드라이브 등에 보관하고 여기 체크 — 누구 계약서를 받았는지 한눈에 관리돼요.
        </div>
        <div className="mf">
          <button className="btn bs" onClick={close}>취소</button>
          <button className="btn bp" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

export { PinChange, AddStaffModal };
