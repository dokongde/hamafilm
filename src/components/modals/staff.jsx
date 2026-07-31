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
  const colors = ["#5352ed","#ff6b35","#4ecdc4","#f5c518","#ff4757","#2ed573","#a55eea","#ff6b9d","#00d2d3","#ff9ff3"];
  const save = async () => {
    if (!name) { toast("이름 입력"); return; }
    if (pin && !/^\d{4}$/.test(pin)) { toast("PIN은 4자리 숫자"); return; }
    let nd;
    if (ed) {
      nd = {...data, staff: data.staff.map(s => s.id===ed.id ? {...s, name, phone, wage: parseFloat(wage), color, pin} : s)};
    } else {
      nd = {...data, staff: [...data.staff, {id: nid(data.staff), name, phone, wage: parseFloat(wage), color, pin}]};
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
        <div className="mf">
          <button className="btn bs" onClick={close}>취소</button>
          <button className="btn bp" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

export { PinChange, AddStaffModal };
