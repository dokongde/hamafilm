import { useState, useEffect, useCallback } from "react";

// ═══ 헤센 공휴일 ═══
function easter(yr) {
  const a=yr%19,b=Math.floor(yr/100),c=yr%100,d=Math.floor(b/4),e=b%4,
    f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,
    i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),
    mo=Math.floor((h+l-7*m+114)/31),dy=((h+l-7*m+114)%31)+1;
  return new Date(yr,mo-1,dy);
}
function addD(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
function dstr(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function hessenHols(yr){
  const e=easter(yr),h={};
  h[`${yr}-01-01`]="Neujahr";
  h[`${yr}-05-01`]="Tag der Arbeit";
  h[`${yr}-10-03`]="Tag der deutschen Einheit";
  h[`${yr}-12-25`]="1. Weihnachtstag";
  h[`${yr}-12-26`]="2. Weihnachtstag";
  h[dstr(addD(e,-2))]="Karfreitag";
  h[dstr(addD(e,1))]="Ostermontag";
  h[dstr(addD(e,39))]="Christi Himmelfahrt";
  h[dstr(addD(e,50))]="Pfingstmontag";
  h[dstr(addD(e,60))]="Fronleichnam";
  return h;
}

const DOW_KO=["일","월","화","수","목","금","토"];

// 전역으로 vacations 참조 (getSlots에서 isVac 체크용)
let CURRENT_VACATIONS = [];
function isInVacation(ds) {
  return CURRENT_VACATIONS.some(v => ds >= v.start && ds <= v.end);
}

function getSlots(ds, isVacationOverride){
  const d=new Date(ds);
  const dow=d.getDay();
  const hols=hessenHols(d.getFullYear());
  if(dow===0||hols[ds]) return [];
  // 방학 여부 판단: override가 있으면 그것, 없으면 자동 감지
  const isVacation = (isVacationOverride !== undefined) ? isVacationOverride : isInVacation(ds);
  // 방학 기간 평일(월~목): 오프닝이 12시부터 시작
  if(isVacation && dow>=1 && dow<=4) return [
    {type:"오프닝",start:"12:00",end:"16:00",hours:4},
    {type:"클로징",start:"16:00",end:"20:30",hours:4.5}
  ];
  // 방학 기간 금요일도 12시부터
  if(isVacation && dow===5) return [
    {type:"오프닝",start:"12:00",end:"16:00",hours:4},
    {type:"클로징",start:"16:00",end:"21:00",hours:5}
  ];
  if(dow>=1&&dow<=4) return [
    {type:"오프닝",start:"13:00",end:"16:00",hours:3},
    {type:"클로징",start:"16:00",end:"20:30",hours:4.5}
  ];
  if(dow===5) return [
    {type:"오프닝",start:"13:00",end:"16:00",hours:3},
    {type:"클로징",start:"16:00",end:"21:00",hours:5}
  ];
  if(dow===6) return [
    {type:"오프닝",start:"11:00",end:"16:00",hours:5},
    {type:"클로징",start:"16:00",end:"21:00",hours:5}
  ];
  return [];
}

function dowKo(s){return DOW_KO[new Date(s).getDay()];}
function todayStr(){return dstr(new Date());}
function curYM(){const n=new Date();return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`;}
function nextYM(ym){const [y,m]=ym.split("-").map(Number);return m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,"0")}`;}
function fmtE(n){return Number(n||0).toFixed(2);}
function fmt(n){return Number(n||0).toLocaleString("ko-KR");}
function nid(arr){return arr.length?Math.max(...arr.map(x=>x.id))+1:1;}
function shiftHours(sh){return sh.hours||(getSlots(sh.date).find(s=>s.type===sh.slotType)||{hours:0}).hours;}

const DEFAULT_PIN = "1234";
const STORE_KEY = "hamafilm_v2";
const PIN_KEY = "hamafilm_pin_v2";

const DEFAULT_DATA = {
  staff: [
    {id:1,name:"유민",phone:"",wage:14.00,color:"#5352ed"},
    {id:2,name:"서희",phone:"",wage:14.00,color:"#ff6b35"},
    {id:3,name:"채현",phone:"",wage:14.00,color:"#4ecdc4"}
  ],
  shifts: [],
  fixed: [],
  vacations: [],
  sales: [],
  payrollRecords: [],
  payments: [],
  expenses: [],         // 지출 기록 [{id, date, category, amount, memo, recurring}]
  historicalData: []    // 과거 월별 직접 입력 데이터 [{ym, sales, expenses, labor, memo}]
};

// ═══ Google Apps Script 백엔드 ═══
const GAS_URL = "https://script.google.com/macros/s/AKfycbw48A5z_PANeJWD-GRZbNc0SPj2uZmurngM1TQiq3tx69VDR9zDC153IOsVcxGSGaV8/exec";

let STORAGE_MODE = "loading";
let LAST_ERROR = "";
let SAVING = false;
let LAST_SAVE_AT = 0;
let LAST_USER_INTERACTION = 0;  // 마지막 사용자 동작 시각
let LAST_SYNCED_JSON = "";       // 마지막으로 동기화한 데이터 (변경 감지용)

async function loadData(){
  try {
    const res = await fetch(GAS_URL, { method: "GET", redirect: "follow" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    STORAGE_MODE = "shared";
    LAST_ERROR = "";
    if (j && j.data) {
      try {
        const parsed = JSON.parse(j.data);
        return parsed[STORE_KEY] || null;
      } catch(e) { return null; }
    }
    return null;
  } catch(e) {
    LAST_ERROR = e.message || String(e);
    console.error("GAS load error", e);
  }
  try {
    STORAGE_MODE = "local";
    const r = localStorage.getItem(STORE_KEY);
    if (r) return JSON.parse(r);
  } catch(e) {}
  return null;
}

async function saveData(d){
  SAVING = true;
  try {
    const existing = await fetchAll();
    existing[STORE_KEY] = d;
    const body = JSON.stringify(existing);

    // POST로 보내기 (URL 길이 제한 회피). text/plain은 CORS preflight 안 일으킴.
    const res = await fetch(GAS_URL, {
      method: "POST",
      body: body,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow"
    });

    if (res.ok) {
      const txt = await res.text();
      try {
        const result = JSON.parse(txt);
        if (result.ok || result.data !== undefined) {
          STORAGE_MODE = "shared";
          LAST_ERROR = "";
          LAST_SAVE_AT = Date.now();
          try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch(e) {}
          return true;
        }
      } catch(e) {
        // 응답이 JSON 아님 — 저장 성공 여부 불확실
        LAST_ERROR = "응답 파싱 실패: " + txt.slice(0, 100);
      }
    } else {
      LAST_ERROR = "HTTP " + res.status;
    }
  } catch(e) {
    LAST_ERROR = e.message || String(e);
    console.error("GAS save error", e);
  } finally {
    SAVING = false;
  }
  // 폴백 — 로컬에라도 저장
  try {
    STORAGE_MODE = "local";
    localStorage.setItem(STORE_KEY, JSON.stringify(d));
  } catch(e) {}
  return false;
}

async function fetchAll() {
  try {
    const res = await fetch(GAS_URL, { method: "GET", redirect: "follow" });
    if (res.ok) {
      const j = await res.json();
      if (j && j.data) return JSON.parse(j.data);
    }
  } catch(e) {}
  return {};
}

async function loadPin(){
  try {
    const all = await fetchAll();
    if (all[PIN_KEY]) return all[PIN_KEY];
  } catch(e) {}
  try {
    const p = localStorage.getItem(PIN_KEY);
    if (p) return p;
  } catch(e) {}
  return DEFAULT_PIN;
}

async function savePin(p){
  try {
    const existing = await fetchAll();
    existing[PIN_KEY] = p;
    const body = JSON.stringify(existing);
    await fetch(GAS_URL, {
      method: "POST",
      body: body,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow"
    });
    try { localStorage.setItem(PIN_KEY, p); } catch(e) {}
    return;
  } catch(e) {}
  try { localStorage.setItem(PIN_KEY, p); } catch(e) {}
}

const css = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=Space+Mono:wght@400;700&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Noto Sans KR', sans-serif; background: #ffffff; color: #1a1a1a; min-height: 100vh; }
.tb { display: flex; align-items: center; justify-content: space-between; padding: 0 14px; height: 50px; background: #ffffff; border-bottom: 1px solid #e0e0e0; position: sticky; top: 0; z-index: 50; }
.logo { font-family: 'Noto Sans KR', sans-serif; font-size: 15px; font-weight: 700; color: #4dabf7; letter-spacing: 1px; }
.logo small { color: #888; font-size: 10px; font-family: 'Noto Sans KR', sans-serif; margin-left: 5px; font-weight: 400; letter-spacing: 0; }
.nav { display: flex; gap: 2px; overflow-x: auto; }
.nt { padding: 5px 8px; border-radius: 5px; cursor: pointer; font-size: 11px; font-weight: 500; color: #666; border: none; background: transparent; white-space: nowrap; }
.nt.on { color: #4dabf7; background: rgba(77,171,247,.12); }
.pg { padding: 14px; max-width: 900px; margin: 0 auto; }
.card { background: #ffffff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 14px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
.ct { font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
.g4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.chip { background: #f5f5f7; border-radius: 8px; padding: 12px; }
.chip .lb { font-size: 10px; color: #888; margin-bottom: 4px; }
.chip .vl { font-family: 'Space Mono', monospace; font-size: 16px; font-weight: 700; color: #1a1a1a; }
.chip .sb { font-size: 10px; color: #888; margin-top: 2px; }
input, select { background: #ffffff; border: 1px solid #d0d0d0; border-radius: 7px; color: #1a1a1a; font-family: 'Noto Sans KR', sans-serif; font-size: 13px; padding: 7px 10px; width: 100%; outline: none; }
input:focus, select:focus { border-color: #4dabf7; box-shadow: 0 0 0 2px rgba(77,171,247,.15); }
input::placeholder { color: #b0b0b0; }
label { font-size: 11px; color: #666; display: block; margin-bottom: 3px; }
.fr { display: grid; gap: 8px; margin-bottom: 8px; }
.fc2 { grid-template-columns: 1fr 1fr; }
.btn { padding: 7px 12px; border-radius: 7px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; font-family: 'Noto Sans KR', sans-serif; }
.bp { background: #4dabf7; color: #fff; }
.bp:hover { background: #339af0; }
.bs { background: #f5f5f7; color: #1a1a1a; border: 1px solid #d0d0d0; }
.bs:hover { background: #e8e8ed; }
.bd { background: rgba(255,71,87,.1); color: #e63946; border: 1px solid rgba(255,71,87,.3); }
.bg2 { background: rgba(46,213,115,.12); color: #20a060; border: 1px solid rgba(46,213,115,.3); }
.sm { padding: 3px 7px; font-size: 11px; }
.tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
.tbl th { padding: 7px 9px; text-align: left; color: #888; font-weight: 500; font-size: 10px; text-transform: uppercase; border-bottom: 1px solid #e0e0e0; }
.tbl td { padding: 7px 9px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
.tbl tr:last-child td { border-bottom: none; }
.tbl tr:hover td { background: #fafafa; }
.badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
.bgrn { background: rgba(46,213,115,.18); color: #20a060; }
.bylw { background: rgba(245,197,24,.2); color: #b8860b; }
.bred { background: rgba(255,71,87,.15); color: #e63946; }
.bblu { background: rgba(77,171,247,.18); color: #1971c2; }
.bgry { background: rgba(0,0,0,.06); color: #666; }
.bprp { background: rgba(165,94,234,.18); color: #7950f2; }
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 4px; }
.mn { font-family: 'Space Mono', monospace; }
.pos { color: #20a060; font-family: 'Space Mono', monospace; font-weight: 600; }
.cg { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.cdow { text-align: center; font-size: 10px; color: #888; padding: 4px 0; font-weight: 600; }
.cday { min-height: 60px; background: #f5f5f7; border-radius: 6px; padding: 4px; cursor: pointer; border: 1px solid transparent; overflow: hidden; }
.cday:hover { background: #ebebef; }
.cday.today { border-color: #4dabf7; box-shadow: 0 0 0 1px #4dabf7; }
.cday.understaffed { background: rgba(255, 212, 0, 0.25); border: 1.5px solid #ffd400; box-shadow: 0 0 8px rgba(255, 212, 0, 0.4); }
.cday.hol { background: #ffe8e8; }
.cday.vac { background: #e6f7e9; }
.cday.other { opacity: .35; }
.dn { font-size: 10px; font-weight: 600; margin-bottom: 1px; color: #666; }
.sp { font-size: 8px; font-weight: 600; padding: 1px 3px; border-radius: 2px; margin-bottom: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.4; }
.ov { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 12px; backdrop-filter: blur(2px); }
.modal { background: #ffffff; border: 1px solid #e0e0e0; border-radius: 12px; padding: 20px; width: 100%; max-width: 460px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,.15); }
.modal h3 { font-size: 15px; font-weight: 700; margin-bottom: 14px; color: #1a1a1a; }
.mf { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }
.slb { display: block; width: 100%; padding: 10px 12px; border-radius: 8px; border: 2px solid #e0e0e0; background: #ffffff; color: #1a1a1a; font-family: 'Noto Sans KR', sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; text-align: left; margin-bottom: 6px; }
.slb:hover { border-color: #b0b0b0; }
.slb.sel { border-color: #4dabf7; background: rgba(77,171,247,.08); color: #1971c2; }
.slb.taken { opacity: .55; cursor: default; border-color: #2ed573; background: rgba(46,213,115,.06); }
.slb.fxd { border-color: rgba(165,94,234,.5); }
.sln { font-weight: 700; margin-bottom: 1px; }
.slt { font-size: 11px; color: #888; font-family: 'Space Mono', monospace; }
.spc { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.sc { padding: 12px 8px; border-radius: 9px; border: 2px solid #e0e0e0; background: #ffffff; cursor: pointer; text-align: center; }
.sc:hover { border-color: #4dabf7; }
.sav { width: 38px; height: 38px; border-radius: 50%; margin: 0 auto 6px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: #fff; }
.snm { font-size: 12px; font-weight: 700; color: #1a1a1a; }
.dp { display: flex; gap: 5px; flex-wrap: wrap; margin: 6px 0; }
.dpl { padding: 4px 9px; border-radius: 16px; border: 1px solid #d0d0d0; background: #ffffff; cursor: pointer; font-size: 11px; font-weight: 600; color: #666; }
.dpl.on { border-color: #4dabf7; background: rgba(77,171,247,.1); color: #1971c2; }
.fxr { background: #f5f5f7; border-radius: 7px; padding: 9px 11px; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between; }
.pb { background: #ffffff; border: 1px solid #e0e0e0; border-radius: 14px; padding: 26px 20px; width: 100%; max-width: 280px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,.15); }
.pds { display: flex; gap: 9px; justify-content: center; margin-bottom: 16px; }
.pde { width: 13px; height: 13px; border-radius: 50%; border: 2px solid #d0d0d0; background: transparent; }
.pde.f { background: #4dabf7; border-color: #4dabf7; }
.ppd { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px; }
.pb2 { padding: 13px; border-radius: 9px; background: #f5f5f7; border: 1px solid #d0d0d0; color: #1a1a1a; font-size: 18px; font-weight: 700; cursor: pointer; font-family: 'Space Mono', monospace; }
.pb2:hover { background: #e8e8ed; }
.notice { border-radius: 7px; padding: 9px 12px; font-size: 12px; margin-bottom: 10px; }
.n-red { background: rgba(255,71,87,.1); border: 1px solid rgba(255,71,87,.3); color: #e63946; }
.n-grn { background: rgba(46,213,115,.1); border: 1px solid rgba(46,213,115,.3); color: #20a060; }
.n-blu { background: rgba(77,171,247,.1); border: 1px solid rgba(77,171,247,.3); color: #1971c2; }
@media (max-width: 480px) { .g4 { grid-template-columns: 1fr 1fr; } .g3 { grid-template-columns: 1fr; } }
`;

// ═══════════════════════════════════════════════════
// 모든 모달 컴포넌트는 최상위에 정의
// ═══════════════════════════════════════════════════

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
      if ((data.shifts||[]).find(s => s.date===date && s.staffId===sid && s.slotType===sel)) {
        toast("이미 등록됨"); return;
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

function AddStaffModal({ modal, data, persist, close, toast }) {
  const ed = modal.edit;
  const [name, setName] = useState(ed?.name || "");
  const [phone, setPhone] = useState(ed?.phone || "");
  const [wage, setWage] = useState(ed?.wage || 14);
  const [color, setColor] = useState(ed?.color || "#5352ed");
  const colors = ["#5352ed","#ff6b35","#4ecdc4","#f5c518","#ff4757","#2ed573","#a55eea","#ff6b9d","#00d2d3","#ff9ff3"];
  const save = async () => {
    if (!name) { toast("이름 입력"); return; }
    let nd;
    if (ed) {
      nd = {...data, staff: data.staff.map(s => s.id===ed.id ? {...s, name, phone, wage: parseFloat(wage), color} : s)};
    } else {
      nd = {...data, staff: [...data.staff, {id: nid(data.staff), name, phone, wage: parseFloat(wage), color}]};
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
                <div key={c} onClick={()=>setColor(c)} style={{width:22,height:22,borderRadius:"50%",background:c,cursor:"pointer",border: color===c ? "2px solid #f5c518" : "2px solid transparent"}} />
              ))}
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
    {title:"📸 사진", k1:"pc", l1:"현금", k2:"pk", l2:"카드"},
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
        if (ns.find(s => s.date===ds && s.staffId===fx.staffId && s.slotType===fx.type)) return;
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

function AddPayrollModal({ modal, data, persist, close, toast, gSt }) {
  const rec = modal.editRec;
  const [sid, setSid] = useState(rec?.staffId || data.staff[0]?.id || 1);
  const [ym, setYm] = useState(rec?.ym || modal.ym || curYM());
  const [amount, setAmount] = useState(rec?.amount || "");
  const [hours, setHours] = useState(rec?.hours || "");
  const [adjType, setAdjType] = useState(() => {
    const t = rec?.adjType || "없음";
    if (t === "추가") return "추가지급"; // 옛날 데이터 마이그레이션
    return t;
  });
  const [adjAmt, setAdjAmt] = useState(rec?.adjAmount || "");
  const [adjDesc, setAdjDesc] = useState(rec?.adjDesc || "");
  const shifts = (data.shifts||[]).filter(s => s.staffId===sid && s.date.startsWith(ym));
  let refH = 0;
  shifts.forEach(s => { refH += shiftHours(s); });
  const st = gSt(sid);
  const refPay = fmtE(refH * (st?.wage || 0));
  const hasAdj = adjType !== "없음" && parseFloat(adjAmt) > 0;
  const adjSign = adjType === "추가지급" ? "+" : "-";
  const adjCol = adjType === "추가지급" ? "#20a060" : "#e63946";

  const save = async () => {
    if (!amount) { toast("확정급여 입력"); return; }
    const entry = {
      id: rec ? rec.id : nid(data.payrollRecords||[]),
      staffId: sid, ym,
      amount: parseFloat(amount),
      hours: parseFloat(hours) || 0,
      adjType,
      adjAmount: parseFloat(adjAmt) || 0,
      adjDesc,
      savedAt: new Date().toISOString()
    };
    let nd;
    if (rec) {
      nd = {...data, payrollRecords: (data.payrollRecords||[]).map(r => r.id===rec.id ? entry : r)};
    } else {
      nd = {...data, payrollRecords: [...(data.payrollRecords||[]), entry]};
    }
    await persist(nd);
    close();
    toast("✅ " + (st?.name || "") + " " + ym + " 저장!");
  };
  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>{rec ? "급여 수정" : "급여 기록 추가"}</h3>
        <div className="fr fc2">
          <div>
            <label>직원</label>
            <select value={sid} onChange={e=>setSid(parseInt(e.target.value))}>
              {data.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label>월</label>
            <input type="month" value={ym} onChange={e=>setYm(e.target.value)} />
          </div>
        </div>
        <div style={{background:"#f5f5f7",borderRadius:7,padding:"8px 11px",fontSize:12,color:"#888",marginBottom:10}}>
          스케줄 기준: <strong>{refH}h</strong> · <strong style={{color:"#f5c518"}}>€{refPay}</strong>
          <span style={{fontSize:10,color:"#888",marginLeft:6}}>(참고)</span>
        </div>
        <div className="fr fc2">
          <div>
            <label>확정 급여 (€)</label>
            <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} step="0.01" placeholder={refPay} />
          </div>
          <div>
            <label>확정 시간 (h)</label>
            <input type="number" value={hours} onChange={e=>setHours(e.target.value)} step="0.5" placeholder={String(refH)} />
          </div>
        </div>
        <div style={{fontSize:11,fontWeight:700,color:"#d94c1a",margin:"8px 0 5px"}}>⚖️ 조정 (다음달 반영)</div>
        <div className="fr fc2">
          <div>
            <label>유형</label>
            <select value={adjType} onChange={e=>setAdjType(e.target.value)}>
              <option value="없음">없음</option>
              <option value="추가지급">➕ 추가지급 (이번달 더 일함 → 다음달 더 줌)</option>
              <option value="차감">➖ 차감 (이번달 덜 일함 → 다음달 덜 줌)</option>
            </select>
          </div>
          <div>
            <label>금액 (€)</label>
            <input type="number" value={adjAmt} onChange={e=>setAdjAmt(e.target.value)} step="0.01" placeholder="0.00" />
          </div>
        </div>
        <div className="fr">
          <div>
            <label>사유</label>
            <input value={adjDesc} onChange={e=>setAdjDesc(e.target.value)} placeholder="예: 미근무 차감" />
          </div>
        </div>
        {parseFloat(amount) > 0 ? (
          <div style={{background:"rgba(245,197,24,.08)",border:"1px solid rgba(245,197,24,.3)",borderRadius:7,padding:"8px 11px",fontSize:12}}>
            확정: <strong style={{color:"#4ecdc4"}}>€{fmtE(parseFloat(amount))}</strong>
            {hasAdj ? (
              <span style={{marginLeft:8}}>
                {nextYM(ym)} 조정: <strong style={{color:adjCol}}>{adjSign}€{fmtE(parseFloat(adjAmt))}</strong>
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="mf">
          <button className="btn bs" onClick={close}>취소</button>
          <button className="btn bp" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

// 지출 입력/수정 모달
function ExpenseModal({ modal, data, persist, close, toast }) {
  const ed = modal.edit;
  const [date, setDate] = useState(ed?.date || todayStr());
  const [category, setCategory] = useState(ed?.category || "임대료");
  const [amount, setAmount] = useState(ed?.amount || "");
  const [memo, setMemo] = useState(ed?.memo || "");
  const [recurring, setRecurring] = useState(ed?.recurring || false);

  const categories = [
    {v:"임대료", e:"🏢"},
    {v:"공과금", e:"💡"},
    {v:"재료비", e:"📦"},
    {v:"광고비", e:"📣"},
    {v:"수수료", e:"💳"},
    {v:"통신비", e:"📞"},
    {v:"보험", e:"🛡️"},
    {v:"세금", e:"📋"},
    {v:"수리/유지보수", e:"🔧"},
    {v:"기타", e:"📌"}
  ];

  const save = async () => {
    if (!amount || parseFloat(amount) <= 0) { toast("금액 입력"); return; }
    const entry = {
      id: ed?.id || nid(data.expenses||[]),
      date, category,
      amount: parseFloat(amount),
      memo,
      recurring,
      savedAt: new Date().toISOString()
    };
    let nd;
    if (ed) {
      nd = {...data, expenses: (data.expenses||[]).map(x => x.id===ed.id ? entry : x)};
    } else {
      nd = {...data, expenses: [...(data.expenses||[]), entry]};
    }
    await persist(nd);
    close();
    toast(ed ? "수정됨" : "지출 저장!");
  };

  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>{ed ? "지출 수정" : "지출 추가"}</h3>
        <div className="fr fc2">
          <div>
            <label>날짜</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
          </div>
          <div>
            <label>카테고리</label>
            <select value={category} onChange={e=>setCategory(e.target.value)}>
              {categories.map(c => <option key={c.v} value={c.v}>{c.e} {c.v}</option>)}
            </select>
          </div>
        </div>
        <div className="fr">
          <div>
            <label>금액 (€)</label>
            <input type="number" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <div className="fr">
          <div>
            <label>메모</label>
            <input value={memo} onChange={e=>setMemo(e.target.value)} placeholder="선택사항" />
          </div>
        </div>
        <label style={{display:"flex",alignItems:"center",gap:7,fontSize:12,color:"#666",cursor:"pointer",marginTop:4}}>
          <input type="checkbox" checked={recurring} onChange={e=>setRecurring(e.target.checked)} style={{width:"auto"}} />
          매월 정기 지출
        </label>
        <div className="mf">
          <button className="btn bs" onClick={close}>취소</button>
          <button className="btn bp" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

// 과거 데이터 입력 모달 (2024-08 ~ 2025-03)
function HistoricalModal({ modal, data, persist, close, toast }) {
  const ed = modal.edit;
  const [ym, setYm] = useState(ed?.ym || "2024-08");
  const [sales, setSales] = useState(ed?.sales || "");
  const [expenses, setExpenses] = useState(ed?.expenses || "");
  const [labor, setLabor] = useState(ed?.labor || "");
  const [memo, setMemo] = useState(ed?.memo || "");

  const save = async () => {
    if (!ym) { toast("월 입력"); return; }
    const entry = {
      ym,
      sales: parseFloat(sales) || 0,
      expenses: parseFloat(expenses) || 0,
      labor: parseFloat(labor) || 0,
      memo
    };
    let nd;
    const existing = (data.historicalData||[]).find(h => h.ym === ym);
    if (existing) {
      nd = {...data, historicalData: (data.historicalData||[]).map(h => h.ym===ym ? entry : h)};
    } else {
      nd = {...data, historicalData: [...(data.historicalData||[]), entry]};
    }
    await persist(nd);
    close();
    toast(ym + " 저장!");
  };

  const remove = async () => {
    if (!ed) return;
    if (!confirm(ed.ym + " 데이터 삭제?")) return;
    await persist({...data, historicalData: (data.historicalData||[]).filter(h => h.ym !== ed.ym)});
    close();
    toast("삭제됨");
  };

  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>{ed ? "과거 데이터 수정" : "과거 데이터 입력"}</h3>
        <div style={{fontSize:11,color:"#888",marginBottom:10}}>
          📌 시스템 도입 전(2024.08~2025.03)에 대한 월별 종합 데이터
        </div>
        <div className="fr">
          <div>
            <label>월 (YYYY-MM)</label>
            <input type="month" value={ym} onChange={e=>setYm(e.target.value)} disabled={!!ed} />
          </div>
        </div>
        <div className="fr fc2">
          <div>
            <label>총 매출 (€)</label>
            <input type="number" step="0.01" value={sales} onChange={e=>setSales(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label>총 비용 (€)</label>
            <input type="number" step="0.01" value={expenses} onChange={e=>setExpenses(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <div className="fr">
          <div>
            <label>인건비 (€) — 비용 중 인건비 부분</label>
            <input type="number" step="0.01" value={labor} onChange={e=>setLabor(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <div className="fr">
          <div>
            <label>메모</label>
            <input value={memo} onChange={e=>setMemo(e.target.value)} placeholder="선택사항" />
          </div>
        </div>
        {sales && expenses ? (
          <div style={{background:"rgba(77,171,247,.1)",border:"1px solid rgba(77,171,247,.3)",borderRadius:7,padding:"8px 11px",fontSize:12,marginTop:6}}>
            순수익: <strong style={{color:"#1971c2"}}>€{fmtE(parseFloat(sales)-parseFloat(expenses))}</strong>
          </div>
        ) : null}
        <div className="mf">
          {ed ? <button className="btn bd" onClick={remove}>삭제</button> : null}
          <button className="btn bs" onClick={close}>취소</button>
          <button className="btn bp" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

// 지급 관리 모달
function EditPaymentModal({ modal, data, persist, close, toast, gSt }) {
  const existing = (data.payments||[]).find(p => p.staffId===modal.staffId && p.ym===modal.ym);
  const st = gSt(modal.staffId);
  const [paid, setPaid] = useState(existing?.paid !== undefined ? existing.paid : true);
  const [paidDate, setPaidDate] = useState(existing?.paidDate || todayStr());
  const [method, setMethod] = useState(existing?.method || "회사통장");
  const [amount, setAmount] = useState(existing?.amount || modal.defaultAmount || 0);
  const [memo, setMemo] = useState(existing?.memo || "");

  const save = async () => {
    const entry = {
      id: existing?.id || nid(data.payments||[]),
      staffId: modal.staffId,
      ym: modal.ym,
      paid: paid,
      paidDate: paid ? paidDate : "",
      method: paid ? method : "",
      amount: parseFloat(amount) || 0,
      memo: memo,
      savedAt: new Date().toISOString()
    };
    let nd;
    if (existing) {
      nd = {...data, payments: (data.payments||[]).map(p => p.id===existing.id ? entry : p)};
    } else {
      nd = {...data, payments: [...(data.payments||[]), entry]};
    }
    await persist(nd);
    close();
    toast(paid ? "✅ 지급 처리됨" : "미지급으로 변경");
  };

  const remove = async () => {
    if (!existing) return;
    if (!confirm("지급 기록을 삭제할까요?")) return;
    await persist({...data, payments: (data.payments||[]).filter(p => p.id !== existing.id)});
    close();
    toast("기록 삭제됨");
  };

  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>💰 {st?.name} · {modal.ym} 급여 지급</h3>
        <div style={{background:"#f5f5f7",borderRadius:7,padding:"8px 11px",fontSize:12,color:"#666",marginBottom:12}}>
          예상 급여: <strong style={{color:"#1971c2"}}>€{fmtE(modal.defaultAmount || 0)}</strong>
        </div>

        {/* 지급 / 미지급 토글 */}
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <button
            className="btn"
            onClick={()=>setPaid(true)}
            style={{
              flex:1,
              background: paid ? "#2ed573" : "#f5f5f7",
              color: paid ? "#fff" : "#888",
              border: paid ? "none" : "1px solid #d0d0d0",
              padding:"10px"
            }}>
            ✓ 지급함
          </button>
          <button
            className="btn"
            onClick={()=>setPaid(false)}
            style={{
              flex:1,
              background: !paid ? "#e63946" : "#f5f5f7",
              color: !paid ? "#fff" : "#888",
              border: !paid ? "none" : "1px solid #d0d0d0",
              padding:"10px"
            }}>
            ✗ 미지급
          </button>
        </div>

        {/* 지급 정보 (지급함일 때만) */}
        {paid ? (
          <>
            <div className="fr fc2">
              <div>
                <label>지급일</label>
                <input type="date" value={paidDate} onChange={e=>setPaidDate(e.target.value)} />
              </div>
              <div>
                <label>지급 방법</label>
                <select value={method} onChange={e=>setMethod(e.target.value)}>
                  <option value="회사통장">🏦 회사통장</option>
                  <option value="현금">💵 현금</option>
                  <option value="계좌이체">💳 계좌이체</option>
                  <option value="기타">기타</option>
                </select>
              </div>
            </div>
            <div className="fr">
              <div>
                <label>실제 지급액 (€)</label>
                <input type="number" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} />
              </div>
            </div>
          </>
        ) : null}

        <div className="fr">
          <div>
            <label>메모</label>
            <input value={memo} onChange={e=>setMemo(e.target.value)} placeholder="선택사항" />
          </div>
        </div>

        <div className="mf">
          {existing ? (
            <button className="btn bd" onClick={remove}>기록 삭제</button>
          ) : null}
          <button className="btn bs" onClick={close}>취소</button>
          <button className="btn bp" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 탭 컴포넌트들 (각자 useState 사용)
// ═══════════════════════════════════════════════════

function SalaryTab({ data, persist, setModal, gSt }) {
  const [salYM, setSalYM] = useState(curYM());
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
  const pending = (data.payrollRecords||[]).filter(p =>
    p.adjType && p.adjType !== "없음" && p.adjAmount > 0 && nextYM(p.ym) === salYM
  );
  const prSorted = [...(data.payrollRecords||[])].sort((a, b) =>
    b.ym.localeCompare(a.ym) || a.staffId - b.staffId
  );

  return (
    <div>
      <div className="fr" style={{marginBottom:12}}>
        <div>
          <label>조회 월</label>
          <input type="month" value={salYM} onChange={e=>setSalYM(e.target.value)} style={{width:180}} />
        </div>
      </div>
      {pending.length > 0 ? (
        <div style={{borderRadius:9,padding:"12px 14px",marginBottom:12,background:"rgba(255,107,53,.12)",border:"1px solid rgba(255,107,53,.4)"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#d94c1a",marginBottom:7}}>⚠️ 이번달 반영할 조정금액!</div>
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
      <div className="g3" style={{marginBottom:12}}>
        {rows.map(r => (
          <div key={r.st.id} className="chip">
            <div className="lb"><span className="dot" style={{background:r.st.color}} />{r.st.name}</div>
            <div className="vl">€{fmtE(r.pay)}</div>
            <div className="sb">{r.h}h · {r.cnt}회</div>
          </div>
        ))}
        <div className="chip" style={{border:"1px solid #f5c518"}}>
          <div className="lb">전체</div>
          <div className="vl">€{fmtE(total)}</div>
          <div className="sb">{salYM}</div>
        </div>
      </div>
      <div className="card" style={{marginBottom:12}}>
        <div className="ct">급여 상세</div>
        <table className="tbl">
          <thead><tr><th>직원</th><th>시간</th><th>시급</th><th>급여</th><th>횟수</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.st.id}>
                <td><span className="dot" style={{background:r.st.color}} /><strong>{r.st.name}</strong></td>
                <td>{r.h}h</td>
                <td className="mn">€{fmtE(r.st.wage)}/h</td>
                <td className="pos">€{fmtE(r.pay)}</td>
                <td style={{color:"#888"}}>{r.cnt}회</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card" style={{border:"1px solid rgba(77,171,247,.3)", marginBottom:12}}>
        <div className="ct" style={{color:"#1971c2",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>💰 {salYM} 지급 관리</span>
          <span style={{fontSize:10,color:"#888",fontWeight:400,textTransform:"none",letterSpacing:0}}>
            {(() => {
              const paidCnt = rows.filter(r => {
                const pay = (data.payments||[]).find(p => p.staffId===r.st.id && p.ym===salYM);
                return pay && pay.paid;
              }).length;
              return `지급완료 ${paidCnt}/${rows.length}`;
            })()}
          </span>
        </div>
        {rows.length === 0 ? (
          <p style={{color:"#888",fontSize:12}}>이 달에 근무한 직원 없음</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>직원</th>
                <th>지급액</th>
                <th>방법</th>
                <th>지급일</th>
                <th>상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const pay = (data.payments||[]).find(p => p.staffId===r.st.id && p.ym===salYM);
                const paid = pay && pay.paid;
                return (
                  <tr key={r.st.id}>
                    <td><span className="dot" style={{background:r.st.color}} /><strong>{r.st.name}</strong></td>
                    <td className="mn" style={{color:paid?"#888":"#1971c2",fontWeight:600,textDecoration:paid?"line-through":"none"}}>
                      €{pay ? fmtE(pay.amount || r.pay) : fmtE(r.pay)}
                    </td>
                    <td>
                      {pay && pay.method ? (
                        <span className={"badge " + (
                          pay.method==="회사통장" ? "bblu" :
                          pay.method==="현금" ? "bgrn" :
                          pay.method==="계좌이체" ? "bprp" : "bgry"
                        )}>{pay.method}</span>
                      ) : <span style={{color:"#bbb",fontSize:11}}>—</span>}
                    </td>
                    <td className="mn" style={{fontSize:11,color:paid?"#666":"#bbb"}}>
                      {pay && pay.paidDate ? pay.paidDate : "—"}
                    </td>
                    <td>
                      {paid ? (
                        <span className="badge bgrn">✓ 지급완료</span>
                      ) : (
                        <span className="badge bred">미지급</span>
                      )}
                    </td>
                    <td>
                      <button
                        className={"btn " + (paid ? "bs" : "bp") + " sm"}
                        onClick={()=>setModal({type:"editPayment", staffId:r.st.id, ym:salYM, defaultAmount:r.pay})}>
                        {paid ? "수정" : "지급체크"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="card" style={{border:"1px solid rgba(78,205,196,.3)"}}>
        <div className="ct" style={{color:"#4ecdc4",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>📋 회계사 리포트</span>
          <button className="btn bs sm" onClick={()=>setModal({type:"addPayroll", ym:salYM})}>+ 추가</button>
        </div>
        {prSorted.length === 0 ? (
          <p style={{color:"#888",fontSize:12}}>없음</p>
        ) : (
          <table className="tbl">
            <thead><tr><th>직원</th><th>월</th><th>시간</th><th>확정급여</th><th>조정</th><th>반영월</th><th></th></tr></thead>
            <tbody>
              {prSorted.map(p => {
                const st = gSt(p.staffId);
                const ha = p.adjType && p.adjType !== "없음" && p.adjAmount > 0;
                const isAdd = p.adjType === "추가지급" || p.adjType === "추가";
                const ac = isAdd ? "#20a060" : "#e63946";
                const as = isAdd ? "+" : "-";
                return (
                  <tr key={p.id}>
                    <td><span className="dot" style={{background:st?.color||"#666"}} />{st?.name||"?"}</td>
                    <td style={{fontWeight:600}}>{p.ym}</td>
                    <td className="mn">{p.hours||"—"}h</td>
                    <td className="mn" style={{color:"#1971c2"}}>€{fmtE(p.amount)}</td>
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

function SalesTab({ data, persist, setModal }) {
  const [fd, setFd] = useState("");
  let sales = [...(data.sales||[])].sort((a, b) => b.date.localeCompare(a.date));
  if (fd) sales = sales.filter(s => s.date === fd);
  const T = {pc:0,pk:0,mc:0,mk:0,ac:0,ak:0,nc:0,nk:0,jc:0,jk:0,sk:0};
  sales.forEach(r => Object.keys(T).forEach(k => { T[k] += (r[k]||0); }));
  const tot = Object.values(T).reduce((a, b) => a + b, 0);
  const rT = r => (r.pc||0)+(r.pk||0)+(r.mc||0)+(r.mk||0)+(r.ac||0)+(r.ak||0)+(r.nc||0)+(r.nk||0)+(r.jc||0)+(r.jk||0)+(r.sk||0);
  const cell = v => v ? <span>{fmt(v)}</span> : <span style={{color:"#444"}}>-</span>;

  return (
    <div>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}>
        <input type="date" value={fd} onChange={e=>setFd(e.target.value)} style={{width:155}} />
        <button className="btn bp sm" onClick={()=>setModal({type:"addSales"})}>+ 입력</button>
        {fd ? <button className="btn bs sm" onClick={()=>setFd("")}>전체</button> : null}
      </div>
      <div className="g4" style={{marginBottom:12}}>
        <div className="chip"><div className="lb">📸 사진</div><div className="vl">{fmt(T.pc+T.pk+T.mc+T.mk)}</div></div>
        <div className="chip"><div className="lb">💍+💅+💎</div><div className="vl">{fmt(T.ac+T.ak+T.nc+T.nk+T.jc+T.jk)}</div></div>
        <div className="chip"><div className="lb">🔒 슈킹</div><div className="vl" style={{color:"#888"}}>{fmt(T.sk)}</div></div>
        <div className="chip" style={{border:"1px solid #f5c518"}}><div className="lb">전체</div><div className="vl">{fmt(tot)}</div></div>
      </div>
      <div className="card" style={{overflowX:"auto"}}>
        <table className="tbl">
          <thead>
            <tr>
              <th>날짜</th><th>📸현금</th><th>📸카드</th><th>🖨현금</th><th>🖨카드</th>
              <th>💍현금</th><th>💍카드</th><th>💅현금</th><th>💅카드</th>
              <th>💎현금</th><th>💎카드</th><th>🔒슈킹</th><th>합계</th><th></th>
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 ? (
              <tr><td colSpan={14} style={{textAlign:"center",color:"#888",padding:16}}>없음</td></tr>
            ) : (
              sales.map(r => (
                <tr key={r.id}>
                  <td style={{fontWeight:600,whiteSpace:"nowrap"}}>{r.date}</td>
                  <td className="mn" style={{fontSize:11}}>{cell(r.pc)}</td>
                  <td className="mn" style={{fontSize:11}}>{cell(r.pk)}</td>
                  <td className="mn" style={{fontSize:11}}>{cell(r.mc)}</td>
                  <td className="mn" style={{fontSize:11}}>{cell(r.mk)}</td>
                  <td className="mn" style={{fontSize:11}}>{cell(r.ac)}</td>
                  <td className="mn" style={{fontSize:11}}>{cell(r.ak)}</td>
                  <td className="mn" style={{fontSize:11}}>{cell(r.nc)}</td>
                  <td className="mn" style={{fontSize:11}}>{cell(r.nk)}</td>
                  <td className="mn" style={{fontSize:11}}>{cell(r.jc)}</td>
                  <td className="mn" style={{fontSize:11}}>{cell(r.jk)}</td>
                  <td className="mn" style={{color:"#888",fontSize:11}}>{r.sk ? fmt(r.sk) : <span style={{color:"#444"}}>-</span>}</td>
                  <td className="mn" style={{fontWeight:700,color:"#f5c518"}}>{fmt(rT(r))}</td>
                  <td>
                    <button className="btn bd sm" onClick={async()=>await persist({...data, sales:(data.sales||[]).filter(s=>s.id!==r.id)})}>삭제</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 월별 종합 데이터 계산 (매출/비용/인건비/순수익)
function calcMonthData(data, ym) {
  // 1. 과거 직접 입력 데이터 우선
  const historical = (data.historicalData||[]).find(h => h.ym === ym);
  if (historical) {
    return {
      ym,
      sales: historical.sales || 0,
      expenses: historical.expenses || 0,
      labor: historical.labor || 0,
      vat: 0, // 과거 데이터는 비용에 이미 포함된 것으로 간주
      net: (historical.sales || 0) - (historical.expenses || 0),
      isHistorical: true
    };
  }

  // 2. 현재 시스템 데이터로 계산
  // 매출 (슈킹 포함 = 내부 전체 매출)
  const monthSales = (data.sales||[]).filter(s => s.date.startsWith(ym));
  const sv = k => monthSales.reduce((t, r) => t + (r[k]||0), 0);
  const skuking = sv("sk");
  const reportable = sv("pc")+sv("pk")+sv("mc")+sv("mk")+sv("ac")+sv("ak")+sv("nc")+sv("nk")+sv("jc")+sv("jk"); // 슈킹 제외
  const totalSales = reportable + skuking;

  // 부가세: 슈킹 제외 신고 매출의 19%
  const vat = reportable * 0.19;

  // 인건비 (해당월 모든 직원 시급 × 시간)
  let labor = 0;
  const monthShifts = (data.shifts||[]).filter(s => s.date.startsWith(ym));
  monthShifts.forEach(sh => {
    const st = (data.staff||[]).find(s => s.id == sh.staffId);
    if (!st) return;
    const h = sh.hours || (getSlots(sh.date).find(x => x.type === sh.slotType) || {hours:0}).hours;
    labor += h * st.wage;
  });

  // 일반 지출 (해당월)
  const monthExpenses = (data.expenses||[])
    .filter(x => x.date.startsWith(ym))
    .reduce((t, x) => t + (x.amount || 0), 0);

  const totalExpenses = monthExpenses + labor + vat;
  const net = totalSales - totalExpenses;

  return {
    ym,
    sales: totalSales,
    reportableSales: reportable,
    skuking,
    expenses: totalExpenses,
    expensesNoLabor: monthExpenses,
    labor,
    vat,
    net,
    isHistorical: false
  };
}

// 월 리스트 생성 (시작월 ~ 종료월)
function getMonthRange(startYM, endYM) {
  const result = [];
  let [y, m] = startYM.split("-").map(Number);
  const [endY, endM] = endYM.split("-").map(Number);
  while (y < endY || (y === endY && m <= endM)) {
    result.push(`${y}-${String(m).padStart(2,"0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return result;
}

function StatsTab({ data, setModal }) {
  const [view, setView] = useState("dashboard"); // "dashboard" | "details" | "expenses"
  const [stYM, setStYM] = useState(curYM());

  // 종합 그래프용: 2024-08 ~ 현재월까지
  const allMonths = getMonthRange("2024-08", curYM());
  const monthlyData = allMonths.map(ym => calcMonthData(data, ym));
  const maxSales = Math.max(...monthlyData.map(m => m.sales), 1);
  const maxNet = Math.max(...monthlyData.map(m => Math.abs(m.net)), 1);

  // 해당 월 상세
  const cur = calcMonthData(data, stYM);
  const prev = (() => {
    const [y, m] = stYM.split("-").map(Number);
    const pm = m === 1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,"0")}`;
    return calcMonthData(data, pm);
  })();

  const diff = (curr, prv) => {
    if (!prv || prv === 0) return null;
    const pct = ((curr - prv) / Math.abs(prv) * 100);
    return pct;
  };

  const salesDiff = diff(cur.sales, prev.sales);
  const netDiff = diff(cur.net, prev.net);
  const expDiff = diff(cur.expenses, prev.expenses);

  const renderArrow = (d, isExpense) => {
    if (d === null || isNaN(d)) return null;
    // 비용은 줄어드는 게 좋음 (반대)
    const good = isExpense ? d < 0 : d > 0;
    const color = Math.abs(d) < 0.1 ? "#888" : (good ? "#20a060" : "#e63946");
    const arrow = d > 0.1 ? "▲" : d < -0.1 ? "▼" : "—";
    return (
      <span style={{color, fontSize:11, fontWeight:600, marginLeft:6}}>
        {arrow} {Math.abs(d).toFixed(1)}%
      </span>
    );
  };

  // 매출 카테고리 (해당 월)
  const monthSales = (data.sales||[]).filter(s => s.date.startsWith(stYM));
  const sv = k => monthSales.reduce((t, r) => t + (r[k]||0), 0);

  return (
    <div>
      {/* 뷰 전환 탭 */}
      <div style={{display:"flex",gap:5,marginBottom:14,borderBottom:"1px solid #e0e0e0",paddingBottom:0}}>
        {[["dashboard","📊 대시보드"],["details","🔍 매출 상세"],["expenses","💸 지출 관리"]].map(([k,lbl])=>(
          <button key={k}
            onClick={()=>setView(k)}
            style={{
              background:"transparent",
              border:"none",
              padding:"8px 12px",
              fontSize:12,
              fontWeight: view===k ? 700 : 500,
              color: view===k ? "#1971c2" : "#666",
              borderBottom: view===k ? "2px solid #4dabf7" : "2px solid transparent",
              cursor:"pointer",
              fontFamily:"'Noto Sans KR', sans-serif"
            }}>
            {lbl}
          </button>
        ))}
      </div>

      {view === "dashboard" ? (
        <>
          <div className="fr" style={{marginBottom:12}}>
            <div>
              <label>조회 월</label>
              <input type="month" value={stYM} onChange={e=>setStYM(e.target.value)} style={{width:180}} />
            </div>
          </div>

          {/* 핵심 KPI */}
          <div className="g3" style={{marginBottom:12}}>
            <div className="chip" style={{border:"1.5px solid #4dabf7"}}>
              <div className="lb">📈 매출 {cur.isHistorical ? "(과거)" : ""}</div>
              <div className="vl" style={{color:"#1971c2"}}>€{fmtE(cur.sales)}</div>
              <div className="sb">{renderArrow(salesDiff, false)} 전월대비</div>
            </div>
            <div className="chip" style={{border:"1.5px solid #e63946"}}>
              <div className="lb">📉 비용</div>
              <div className="vl" style={{color:"#e63946"}}>€{fmtE(cur.expenses)}</div>
              <div className="sb">{renderArrow(expDiff, true)} 전월대비</div>
            </div>
            <div className="chip" style={{border: cur.net >= 0 ? "1.5px solid #20a060" : "1.5px solid #e63946"}}>
              <div className="lb">💰 순수익</div>
              <div className="vl" style={{color: cur.net >= 0 ? "#20a060" : "#e63946"}}>
                €{fmtE(cur.net)}
              </div>
              <div className="sb">{renderArrow(netDiff, false)} 전월대비</div>
            </div>
          </div>

          {/* 비용 세부 */}
          {!cur.isHistorical ? (
            <div className="card" style={{marginBottom:12}}>
              <div className="ct">💸 비용 세부 ({stYM})</div>
              <table className="tbl">
                <tbody>
                  <tr>
                    <td>👥 인건비</td>
                    <td className="mn" style={{textAlign:"right"}}>€{fmtE(cur.labor)}</td>
                    <td style={{textAlign:"right",width:60,color:"#888",fontSize:11}}>
                      {cur.expenses>0 ? ((cur.labor/cur.expenses)*100).toFixed(0) : 0}%
                    </td>
                  </tr>
                  <tr>
                    <td>📋 부가세 (19%)</td>
                    <td className="mn" style={{textAlign:"right"}}>€{fmtE(cur.vat)}</td>
                    <td style={{textAlign:"right",width:60,color:"#888",fontSize:11}}>
                      {cur.expenses>0 ? ((cur.vat/cur.expenses)*100).toFixed(0) : 0}%
                    </td>
                  </tr>
                  <tr>
                    <td>📦 일반 지출</td>
                    <td className="mn" style={{textAlign:"right"}}>€{fmtE(cur.expensesNoLabor)}</td>
                    <td style={{textAlign:"right",width:60,color:"#888",fontSize:11}}>
                      {cur.expenses>0 ? ((cur.expensesNoLabor/cur.expenses)*100).toFixed(0) : 0}%
                    </td>
                  </tr>
                  <tr style={{borderTop:"2px solid #1a1a1a"}}>
                    <td style={{fontWeight:700}}>합계</td>
                    <td className="mn" style={{textAlign:"right",fontWeight:700,color:"#e63946"}}>€{fmtE(cur.expenses)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card" style={{marginBottom:12, background:"#fff8e1"}}>
              <div style={{fontSize:12, color:"#b8860b"}}>
                📌 이 달은 시스템 도입 전 직접 입력 데이터입니다.
                {cur.labor > 0 ? <span> 인건비: <strong>€{fmtE(cur.labor)}</strong></span> : null}
              </div>
            </div>
          )}

          {/* 월별 그래프 */}
          <div className="card" style={{marginBottom:12}}>
            <div className="ct">📊 월별 매출 / 순수익 그래프 (2024.08~)</div>
            <div style={{overflowX:"auto"}}>
              <div style={{minWidth: Math.max(monthlyData.length * 50, 600), display:"flex", gap:6, alignItems:"flex-end", height:200, padding:"10px 0", borderBottom:"1px solid #e0e0e0"}}>
                {monthlyData.map(m => {
                  const salesH = (m.sales / maxSales) * 160;
                  const netH = (Math.abs(m.net) / maxSales) * 160;
                  const isCur = m.ym === stYM;
                  const netColor = m.net >= 0 ? "#20a060" : "#e63946";
                  return (
                    <div key={m.ym}
                      onClick={()=>setStYM(m.ym)}
                      style={{
                        flex:"1 0 44px",
                        display:"flex",
                        flexDirection:"column",
                        alignItems:"center",
                        cursor:"pointer",
                        opacity: isCur ? 1 : 0.85,
                        position:"relative"
                      }}>
                      <div style={{display:"flex",gap:2,alignItems:"flex-end",height:165}}>
                        <div style={{
                          width:14,
                          height: salesH,
                          background: isCur ? "#1971c2" : "#4dabf7",
                          borderRadius: "3px 3px 0 0",
                          minHeight: 1
                        }} title={"매출 €"+fmtE(m.sales)} />
                        <div style={{
                          width:14,
                          height: netH,
                          background: netColor,
                          opacity: isCur ? 1 : 0.6,
                          borderRadius: "3px 3px 0 0",
                          minHeight: 1
                        }} title={"순수익 €"+fmtE(m.net)} />
                      </div>
                      <div style={{
                        fontSize:9,
                        color: isCur ? "#1971c2" : "#888",
                        fontWeight: isCur ? 700 : 400,
                        marginTop:4,
                        textAlign:"center",
                        whiteSpace:"nowrap"
                      }}>
                        {m.ym.slice(2).replace("-", "/")}
                      </div>
                      {m.isHistorical ? <div style={{fontSize:7, color:"#b8860b"}}>📌</div> : null}
                    </div>
                  );
                })}
              </div>
              <div style={{display:"flex",gap:14,marginTop:8,fontSize:11,color:"#666"}}>
                <span><span style={{display:"inline-block",width:10,height:10,background:"#4dabf7",borderRadius:2,marginRight:4}}></span>매출</span>
                <span><span style={{display:"inline-block",width:10,height:10,background:"#20a060",borderRadius:2,marginRight:4}}></span>순수익(흑자)</span>
                <span><span style={{display:"inline-block",width:10,height:10,background:"#e63946",borderRadius:2,marginRight:4}}></span>순수익(적자)</span>
                <span style={{color:"#b8860b"}}>📌 과거 데이터</span>
              </div>
            </div>
          </div>

          {/* 인건비 추이 */}
          <div className="card" style={{marginBottom:12}}>
            <div className="ct">👥 월별 인건비 추이</div>
            <div style={{overflowX:"auto"}}>
              <div style={{minWidth: Math.max(monthlyData.length * 50, 600), display:"flex", gap:6, alignItems:"flex-end", height:130, padding:"8px 0", borderBottom:"1px solid #e0e0e0"}}>
                {monthlyData.map(m => {
                  const maxLabor = Math.max(...monthlyData.map(x=>x.labor), 1);
                  const h = (m.labor / maxLabor) * 100;
                  const isCur = m.ym === stYM;
                  return (
                    <div key={m.ym}
                      onClick={()=>setStYM(m.ym)}
                      style={{flex:"1 0 44px",display:"flex",flexDirection:"column",alignItems:"center",cursor:"pointer"}}>
                      <div style={{
                        width:24,
                        height: h,
                        background: isCur ? "#7950f2" : "#a55eea",
                        borderRadius: "3px 3px 0 0",
                        minHeight: m.labor > 0 ? 1 : 0
                      }} title={"인건비 €"+fmtE(m.labor)} />
                      <div style={{fontSize:9, color: isCur ? "#7950f2" : "#888", fontWeight: isCur?700:400, marginTop:4}}>
                        {m.ym.slice(2).replace("-", "/")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 월별 데이터 표 */}
          <div className="card">
            <div className="ct" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>📋 월별 종합표</span>
              <button className="btn bs sm" onClick={()=>setModal({type:"historical"})}>+ 과거 데이터 입력</button>
            </div>
            <div style={{overflowX:"auto"}}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>월</th>
                    <th>매출</th>
                    <th>비용</th>
                    <th>인건비</th>
                    <th>순수익</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...monthlyData].reverse().map(m => {
                    const profit = m.sales - m.expenses;
                    const margin = m.sales > 0 ? (profit/m.sales*100).toFixed(1) : "0.0";
                    return (
                      <tr key={m.ym} style={{background: m.ym===stYM ? "#e7f5ff" : "transparent"}}>
                        <td style={{fontWeight:600}}>
                          {m.ym}
                          {m.isHistorical ? <span style={{color:"#b8860b",marginLeft:4,fontSize:10}}>📌</span> : null}
                        </td>
                        <td className="mn" style={{color:"#1971c2"}}>€{fmtE(m.sales)}</td>
                        <td className="mn" style={{color:"#e63946"}}>€{fmtE(m.expenses)}</td>
                        <td className="mn" style={{color:"#7950f2"}}>€{fmtE(m.labor)}</td>
                        <td className="mn" style={{color: m.net >= 0 ? "#20a060" : "#e63946", fontWeight:700}}>
                          €{fmtE(m.net)} <span style={{fontSize:10,color:"#888",fontWeight:400}}>({margin}%)</span>
                        </td>
                        <td>
                          {m.isHistorical ? (
                            <button className="btn bs sm" onClick={()=>setModal({type:"historical", edit: (data.historicalData||[]).find(h=>h.ym===m.ym)})}>수정</button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : view === "details" ? (
        // ─── 매출 상세 (기존) ───
        (() => {
          const photo = sv("pc")+sv("pk")+sv("mc")+sv("mk");
          const acc = sv("ac")+sv("ak");
          const nail = sv("nc")+sv("nk");
          const joys = sv("jc")+sv("jk");
          const sk = sv("sk");
          const rep = photo+acc+nail+joys;
          const all = rep+sk;
          const cash = sv("pc")+sv("mc")+sv("ac")+sv("nc")+sv("jc")+sk;
          const card = sv("pk")+sv("mk")+sv("ak")+sv("nk")+sv("jk");
          const cats = [
            {n:"📸 사진 현금", v:sv("pc"), c:"#f5c518"},
            {n:"📸 사진 카드", v:sv("pk"), c:"#f5c518"},
            {n:"🖨 기계 현금", v:sv("mc"), c:"#ffd700"},
            {n:"🖨 기계 카드", v:sv("mk"), c:"#ffd700"},
            {n:"💍 악세서리 현금", v:sv("ac"), c:"#ff6b35"},
            {n:"💍 악세서리 카드", v:sv("ak"), c:"#ff6b35"},
            {n:"💅 네일 현금", v:sv("nc"), c:"#ff4757"},
            {n:"💅 네일 카드", v:sv("nk"), c:"#ff4757"},
            {n:"💎 조이스 현금", v:sv("jc"), c:"#5352ed"},
            {n:"💎 조이스 카드", v:sv("jk"), c:"#5352ed"},
            {n:"🔒 슈킹", v:sv("sk"), c:"#555"}
          ];
          const mx = Math.max(...cats.map(c => c.v), 1);

          return (
            <>
              <div className="fr" style={{marginBottom:12}}>
                <div>
                  <label>조회 월</label>
                  <input type="month" value={stYM} onChange={e=>setStYM(e.target.value)} style={{width:180}} />
                </div>
              </div>
              <div className="g4" style={{marginBottom:10}}>
                <div className="chip"><div className="lb">📸 사진</div><div className="vl">{fmt(photo)}</div></div>
                <div className="chip"><div className="lb">💍 악세서리</div><div className="vl">{fmt(acc)}</div></div>
                <div className="chip"><div className="lb">💅 네일</div><div className="vl">{fmt(nail)}</div></div>
                <div className="chip"><div className="lb">💎 조이스보물</div><div className="vl">{fmt(joys)}</div></div>
              </div>
              <div className="g3" style={{marginBottom:10}}>
                <div className="chip"><div className="lb">💵 현금</div><div className="vl">{fmt(cash)}</div></div>
                <div className="chip"><div className="lb">💳 카드</div><div className="vl">{fmt(card)}</div></div>
                <div className="chip"><div className="lb">🔒 슈킹</div><div className="vl" style={{color:"#888"}}>{fmt(sk)}</div></div>
              </div>
              <div className="g2" style={{marginBottom:12}}>
                <div className="chip" style={{border:"1px solid #555"}}>
                  <div className="lb">세금청 신고 (슈킹 제외)</div>
                  <div className="vl" style={{color:"#1971c2"}}>{fmt(rep)}</div>
                </div>
                <div className="chip" style={{border:"1px solid #f5c518"}}>
                  <div className="lb">내부 전체 (슈킹 포함)</div>
                  <div className="vl">{fmt(all)}</div>
                  <div className="sb">{monthSales.length}일</div>
                </div>
              </div>
              <div className="card">
                {cats.map(c => (
                  <div key={c.n} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <span style={{fontSize:12}}>{c.n}</span>
                      <span className="mn" style={{fontSize:12,color:"#888"}}>{fmt(c.v)}</span>
                    </div>
                    <div style={{background:"#f5f5f7",borderRadius:4,height:6,overflow:"hidden"}}>
                      <div style={{height:"100%", width:((c.v/mx*100).toFixed(1)+"%"), background:c.c, borderRadius:4}} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          );
        })()
      ) : (
        // ─── 지출 관리 ───
        <ExpensesView data={data} stYM={stYM} setStYM={setStYM} setModal={setModal} />
      )}
    </div>
  );
}

// 지출 관리 뷰
function ExpensesView({ data, stYM, setStYM, setModal }) {
  const monthExpenses = (data.expenses||[])
    .filter(x => x.date.startsWith(stYM))
    .sort((a, b) => b.date.localeCompare(a.date));

  // 카테고리별 합계
  const byCategory = {};
  monthExpenses.forEach(x => {
    if (!byCategory[x.category]) byCategory[x.category] = 0;
    byCategory[x.category] += x.amount || 0;
  });
  const total = Object.values(byCategory).reduce((a, b) => a + b, 0);

  const persist = async (nd) => {
    // ExpensesView에서 직접 persist 호출 못하므로 setModal 통해 우회는 어려움
    // 대신 props로 받아야 함 — 잠시 부모에서 처리
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <div style={{flex:"1 1 200px"}}>
          <label>조회 월</label>
          <input type="month" value={stYM} onChange={e=>setStYM(e.target.value)} style={{maxWidth:180}} />
        </div>
        <button className="btn bp sm" onClick={()=>setModal({type:"expense"})}>+ 지출 추가</button>
      </div>

      {/* 카테고리별 요약 */}
      <div className="card" style={{marginBottom:12}}>
        <div className="ct">{stYM} 카테고리별 지출</div>
        {Object.keys(byCategory).length === 0 ? (
          <p style={{color:"#888",fontSize:12}}>이 달 지출 없음</p>
        ) : (
          <>
            {Object.entries(byCategory).sort((a,b)=>b[1]-a[1]).map(([cat, amt]) => {
              const pct = total > 0 ? (amt/total*100) : 0;
              return (
                <div key={cat} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,fontSize:12}}>
                    <span>{cat}</span>
                    <span className="mn" style={{color:"#666"}}>€{fmtE(amt)} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div style={{background:"#f5f5f7",borderRadius:4,height:6,overflow:"hidden"}}>
                    <div style={{height:"100%", width: pct+"%", background:"#e63946", borderRadius:4}} />
                  </div>
                </div>
              );
            })}
            <div style={{marginTop:12,paddingTop:10,borderTop:"1px solid #e0e0e0",display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:700}}>
              <span>합계</span>
              <span className="mn" style={{color:"#e63946"}}>€{fmtE(total)}</span>
            </div>
          </>
        )}
      </div>

      {/* 지출 목록 */}
      <div className="card">
        <div className="ct">{stYM} 지출 내역</div>
        {monthExpenses.length === 0 ? (
          <p style={{color:"#888",fontSize:12}}>없음</p>
        ) : (
          <table className="tbl">
            <thead><tr><th>날짜</th><th>카테고리</th><th>금액</th><th>메모</th><th></th></tr></thead>
            <tbody>
              {monthExpenses.map(x => (
                <tr key={x.id}>
                  <td>{x.date}</td>
                  <td>
                    <span className="badge bgry">{x.category}</span>
                    {x.recurring ? <span style={{marginLeft:4,fontSize:10,color:"#7950f2"}}>🔁</span> : null}
                  </td>
                  <td className="mn" style={{color:"#e63946"}}>€{fmtE(x.amount)}</td>
                  <td style={{color:"#666",fontSize:11}}>{x.memo || "—"}</td>
                  <td>
                    <button className="btn bs sm" onClick={()=>setModal({type:"expense", edit:x})}>수정</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 메인 App
// ═══════════════════════════════════════════════════

export default function App() {
  const [data, setData] = useState(null);
  const [pin, setPin] = useState(DEFAULT_PIN);
  const [mode, setMode] = useState("staff");
  const [adminTab, setAdminTab] = useState("schedule");
  const [calY, setCalY] = useState(new Date().getFullYear());
  const [calM, setCalM] = useState(new Date().getMonth());
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [pinBuf, setPinBuf] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [svSid, setSvSid] = useState(null);
  const [svDate, setSvDate] = useState(todayStr());
  const [svCalY, setSvCalY] = useState(new Date().getFullYear());
  const [svCalM, setSvCalM] = useState(new Date().getMonth());
  const [svSel, setSvSel] = useState(null);
  const [storageMode, setStorageMode] = useState("loading");
  const [lastError, setLastError] = useState("");

  // data가 바뀔 때마다 vacations를 전역 변수에 동기화 (getSlots에서 사용)
  useEffect(() => {
    if (data) CURRENT_VACATIONS = data.vacations || [];
  }, [data]);

  useEffect(() => {
    (async () => {
      const d = await loadData();
      setData(d || DEFAULT_DATA);
      const p = await loadPin();
      setPin(p);
      setStorageMode(STORAGE_MODE);
      setLastError(LAST_ERROR);
    })();
  }, []);

  // 다른 사용자가 변경한 데이터를 주기적으로 가져옴 (실시간 동기화)
  // 단, 사용자가 입력 중이거나 모달이 열려있을 때는 폴링 정지
  useEffect(() => {
    const interval = setInterval(async () => {
      // 1. 저장 중 또는 방금 저장한 경우 (10초 이내)
      if (SAVING || (Date.now() - LAST_SAVE_AT < 10000)) return;
      // 2. 모달이 열려있을 때
      if (modal !== null) return;
      // 3. input/textarea/select에 포커스 있을 때
      const active = document.activeElement;
      if (active && (
        active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.tagName === "SELECT" ||
        active.tagName === "BUTTON"  // 버튼에 포커스 있을 때도 폴링 안 함
      )) return;
      // 4. 페이지가 백그라운드일 때
      if (document.hidden) return;
      // 5. 마우스가 페이지에서 움직이는 중이면 잠시 대기 (사용자가 클릭 중일 가능성)
      if (Date.now() - LAST_USER_INTERACTION < 3000) return;

      try {
        const d = await loadData();
        // 데이터가 실제로 바뀌었을 때만 setData (불필요한 리렌더링 방지)
        if (d) {
          const newJson = JSON.stringify(d);
          if (newJson !== LAST_SYNCED_JSON) {
            LAST_SYNCED_JSON = newJson;
            setData(d);
          }
        }
        setStorageMode(STORAGE_MODE);
        setLastError(LAST_ERROR);
      } catch(e) {}
    }, 10000); // 8초 → 10초로 더 늘림
    return () => clearInterval(interval);
  }, [modal]);

  // 사용자 상호작용 추적
  useEffect(() => {
    const update = () => { LAST_USER_INTERACTION = Date.now(); };
    window.addEventListener("click", update);
    window.addEventListener("touchstart", update);
    window.addEventListener("mousemove", update);
    return () => {
      window.removeEventListener("click", update);
      window.removeEventListener("touchstart", update);
      window.removeEventListener("mousemove", update);
    };
  }, []);

  const persist = useCallback(async (nd) => {
    setData(nd);
    LAST_SYNCED_JSON = JSON.stringify(nd); // 자기가 저장한 건 동기화 비교 기준에 반영
    const ok = await saveData(nd);
    if (!ok) {
      // 저장 실패 → 사용자에게 즉시 알림 (자동 사라짐 방지)
      setToast("⚠️ 저장 실패! 인터넷 확인 후 다시 시도하세요");
      setTimeout(() => setToast(""), 5000);
    }
    setStorageMode(STORAGE_MODE);
    setLastError(LAST_ERROR);
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2400);
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  if (!data) {
    return (
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#ffffff",color:"#4dabf7",fontFamily:"monospace",fontSize:18}}>
        💙 로딩중…
      </div>
    );
  }

  const gSt = (id) => (data.staff||[]).find(s => s.id == id);
  const isVac = (ds) => (data.vacations||[]).some(v => ds >= v.start && ds <= v.end);
  const vacName = (ds) => {
    const v = (data.vacations||[]).find(v => ds >= v.start && ds <= v.end);
    return v ? v.name : "";
  };

  const doPinInput = (d) => {
    if (pinBuf.length >= 4) return;
    const nb = pinBuf + d;
    setPinBuf(nb);
    if (nb.length === 4) {
      setTimeout(() => {
        if (nb === pin) {
          setMode("admin");
          setPinBuf("");
          setPinErr("");
          setModal(null);
        } else {
          setPinErr("PIN 오류");
          setPinBuf("");
        }
      }, 120);
    }
  };

  // ─── 달력 ───
  const renderCal = () => {
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
            const sorted = [...shifts].sort((a, b) => (a.slotType==="오프닝"?0:1) - (b.slotType==="오프닝"?0:1));
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
                {sorted.slice(0, 4).map(sh => {
                  const st = gSt(sh.staffId);
                  const bg = st ? (st.color + "28") : "#333";
                  const fg = st ? st.color : "#aaa";
                  const nm = st ? st.name.slice(0, 3) : "?";
                  return (
                    <div key={sh.id} className="sp" style={{background:bg, color:fg}}>{nm}</div>
                  );
                })}
                {shifts.length > 4 ? (
                  <div style={{fontSize:7,color:"#888"}}>+{shifts.length-4}</div>
                ) : null}
                {isUnderstaffed && shifts.length === 0 ? (
                  <div style={{fontSize:8, color:"#b8860b", fontWeight:700, marginTop:1}}>비어있음</div>
                ) : null}
                {isUnderstaffed && shifts.length === 1 ? (
                  <div style={{fontSize:8, color:"#b8860b", fontWeight:700, marginTop:1}}>1명만</div>
                ) : null}
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
  };

  // ─── 고정 ───
  const renderFixed = () => {
    const DN = ["", "월", "화", "수", "목", "금", "토"];
    const byStaff = {};
    (data.fixed||[]).forEach(f => {
      if (!byStaff[f.staffId]) byStaff[f.staffId] = [];
      byStaff[f.staffId].push(f);
    });
    return (
      <div>
        <div className="card">
          <div className="ct" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>방학 기간</span>
            <button className="btn bs sm" onClick={()=>setModal({type:"addVac"})}>+ 방학 추가</button>
          </div>
          {(data.vacations||[]).length === 0 ? (
            <p style={{color:"#888",fontSize:12}}>없음</p>
          ) : (
            (data.vacations||[]).sort((a, b) => a.start.localeCompare(b.start)).map(v => (
              <div key={v.id} className="fxr">
                <div>
                  <span className="badge bgrn" style={{marginRight:7}}>{v.name}</span>
                  <span style={{fontSize:12,color:"#888"}}>{v.start} ~ {v.end}</span>
                </div>
                <button className="btn bd sm" onClick={async()=>await persist({...data, vacations:(data.vacations||[]).filter(x=>x.id!==v.id)})}>삭제</button>
              </div>
            ))
          )}
        </div>
        <div className="card">
          <div className="ct" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>직원별 고정 스케줄</span>
            <button className="btn bp sm" onClick={()=>setModal({type:"addFixed"})}>+ 고정 추가</button>
          </div>
          {Object.keys(byStaff).length === 0 ? (
            <p style={{color:"#888",fontSize:12}}>없음</p>
          ) : (
            Object.entries(byStaff).map(([sid, fxs]) => {
              const st = gSt(parseInt(sid));
              return (
                <div key={sid} style={{marginBottom:10}}>
                  <div style={{fontSize:12,fontWeight:700,marginBottom:5}}>
                    <span className="dot" style={{background:st?.color||"#666"}} />{st?.name||"?"}
                  </div>
                  {fxs.map(f => (
                    <div key={f.id} className="fxr">
                      <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                        <span className={"badge " + (f.type === "오프닝" ? "bylw" : "bgrn")}>{f.type}</span>
                        {[...f.dows].sort().map(d => (
                          <span key={d} className="badge bblu">{DN[d]}요일</span>
                        ))}
                      </div>
                      <button className="btn bd sm" onClick={async()=>await persist({...data, fixed:(data.fixed||[]).filter(x=>x.id!==f.id)})}>삭제</button>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
        <div className="card" style={{border:"1px solid rgba(245,197,24,.3)"}}>
          <div className="ct" style={{color:"#f5c518"}}>⚡ 자동 생성</div>
          <div style={{fontSize:12,color:"#888",marginBottom:10}}>방학·공휴일·일요일 제외</div>
          <button className="btn bp" style={{width:"100%"}} onClick={()=>setModal({type:"genFixed", ym:curYM()})}>⚡ 이번달 생성</button>
        </div>
      </div>
    );
  };

  // ─── 직원 관리 ───
  const renderStaffMgmt = () => (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:15,fontWeight:700}}>직원 관리</div>
        <button className="btn bp sm" onClick={()=>setModal({type:"addStaff"})}>+ 추가</button>
      </div>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>이름</th><th>연락처</th><th>시급</th><th>색상</th><th></th></tr></thead>
          <tbody>
            {(data.staff||[]).map(st => (
              <tr key={st.id}>
                <td><strong>{st.name}</strong></td>
                <td style={{color:"#888"}}>{st.phone || "—"}</td>
                <td className="mn">€{fmtE(st.wage)}/h</td>
                <td><span style={{display:"inline-block",width:16,height:16,borderRadius:"50%",background:st.color}} /></td>
                <td>
                  <button className="btn bs sm" onClick={()=>setModal({type:"addStaff", edit:st})}>수정</button>
                  <button className="btn bd sm" style={{marginLeft:3}} onClick={async()=>{
                    if (!confirm("삭제?")) return;
                    await persist({
                      ...data,
                      staff: (data.staff||[]).filter(s=>s.id!==st.id),
                      fixed: (data.fixed||[]).filter(f=>f.staffId!==st.id)
                    });
                  }}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card" style={{marginTop:12,border:"1px solid rgba(245,197,24,.2)"}}>
        <div className="ct" style={{color:"#f5c518"}}>🔐 관리자 PIN 변경</div>
        <PinChange pin={pin} setPin={setPin} />
      </div>
    </div>
  );

  // ─── 직원 화면 ───
  const renderStaffView = () => {
    const hols = hessenHols(new Date(svDate).getFullYear());
    const dow = new Date(svDate).getDay();
    const holName = hols[svDate] || "";
    const vacN = vacName(svDate);
    const slots = getSlots(svDate);
    const taken = (data.shifts||[]).filter(s => s.date===svDate && s.staffId===svSid).map(s => s.slotType);
    const fixedTypes = (data.fixed||[]).filter(f => f.staffId===svSid && f.dows.includes(dow)).map(f => f.type);
    const ym = curYM();
    const myS = (data.shifts||[]).filter(s => s.staffId===svSid && s.date.startsWith(ym)).sort((a,b) => a.date.localeCompare(b.date));
    const allS = (data.shifts||[]).filter(s => s.date.startsWith(ym)).sort((a,b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

    const doSave = async () => {
      if (!svSid || !svSel) return;
      const slot = slots.find(s => s.type === svSel);
      if (!slot) return;
      if ((data.shifts||[]).find(s => s.date===svDate && s.staffId===svSid && s.slotType===svSel)) {
        showToast("이미 등록됨");
        return;
      }
      await persist({...data, shifts: [...(data.shifts||[]), {
        id: nid(data.shifts||[]),
        staffId: svSid, date: svDate,
        start: slot.start, end: slot.end,
        slotType: slot.type, hours: slot.hours,
        memo: "", source: "share"
      }]});
      setSvSel(null);
      showToast("✅ 등록 완료!");
    };

    const doCancel = async (id) => {
      if (!confirm("취소?")) return;
      await persist({...data, shifts: (data.shifts||[]).filter(s => s.id !== id)});
      showToast("취소 완료");
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
                info += "🔍 직접 테스트 중...\n";
                try {
                  const res = await fetch(GAS_URL, { method: "GET" });
                  info += "응답코드: " + res.status + "\n";
                  const txt = await res.text();
                  info += "응답내용 (처음 200자):\n" + txt.slice(0, 200);
                } catch(e) {
                  info += "❌ 에러: " + (e.message || String(e));
                }
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
              {storageMode==="shared" ? "🟢 공유됨" : storageMode==="local" ? "🔴 로컬만" : "⚪ 연결중"}
            </span>
            <button className="btn bs sm" onClick={()=>setModal({type:"pin"})}>🔐 관리자</button>
          </div>
        </div>
        <div className="pg">
          {!svSid ? (
            <div>
              <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>안녕하세요 👋</div>
              <div style={{fontSize:12,color:"#888",marginBottom:14}}>이름을 선택하세요.</div>
              <div className="spc">
                {(data.staff||[]).map(s => (
                  <div key={s.id} className="sc" onClick={()=>{setSvSid(s.id); setSvDate(todayStr()); setSvSel(null);}}>
                    <div className="sav" style={{background:s.color}}>{s.name.slice(0, 1)}</div>
                    <div className="snm">{s.name}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                <button className="btn bs sm" onClick={()=>{setSvSid(null); setSvSel(null);}}>← 뒤로</button>
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
                          {isTaken ? <span style={{fontSize:10,color:"#2ed573",marginLeft:6}}>✓ 등록됨</span> : null}
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
              <div className="card">
                <div style={{fontSize:13,fontWeight:700,marginBottom:9}}>📌 내 이번달 스케줄</div>
                {(() => {
                  // 이번달 내 시간/급여 계산
                  const me = gSt(svSid);
                  const wage = me?.wage || 0;
                  let totalH = 0;
                  myS.forEach(s => { totalH += shiftHours(s); });
                  const expectedPay = totalH * wage;

                  // 다음 달 조정 확인 (지난달 기록에서 이번달에 반영될 것)
                  const ymNow = curYM();
                  const adjustment = (data.payrollRecords||[]).find(p =>
                    p.staffId === svSid &&
                    p.adjType && p.adjType !== "없음" &&
                    p.adjAmount > 0 &&
                    nextYM(p.ym) === ymNow
                  );
                  const isAdd = adjustment && (adjustment.adjType === "추가지급" || adjustment.adjType === "추가");
                  const adjAmount = adjustment ? adjustment.adjAmount : 0;
                  const finalPay = isAdd ? expectedPay + adjAmount : (adjustment ? expectedPay - adjAmount : expectedPay);

                  // 이번 달 지급 기록
                  const payment = (data.payments||[]).find(p => p.staffId===svSid && p.ym===ymNow);
                  const isPaid = payment && payment.paid;

                  return (
                    <div style={{
                      background: "linear-gradient(135deg, rgba(77,171,247,.12), rgba(165,94,234,.1))",
                      border: "1.5px solid #4dabf7",
                      borderRadius: 10,
                      padding: "12px 14px",
                      marginBottom: 12
                    }}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                        <span style={{fontSize:11,color:"#1971c2",fontWeight:600}}>💰 내 예상 급여 ({ymNow})</span>
                        {isPaid ? (
                          <span className="badge bgrn">✓ 지급됨 {payment.paidDate || ""}</span>
                        ) : (
                          <span className="badge bred">미지급</span>
                        )}
                      </div>
                      <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:6}}>
                        <span style={{fontSize:24,fontWeight:700,color:"#1971c2",fontFamily:"'Space Mono', monospace"}}>
                          €{fmtE(finalPay)}
                        </span>
                        <span style={{fontSize:11,color:"#666"}}>
                          ({totalH}h × €{fmtE(wage)}/h)
                        </span>
                      </div>
                      {adjustment ? (
                        <div style={{
                          fontSize:11,
                          color: isAdd ? "#20a060" : "#e63946",
                          background: "#fff",
                          borderRadius:5,
                          padding:"5px 8px",
                          marginTop:5
                        }}>
                          {isAdd ? "➕ 지난달 추가지급" : "➖ 지난달 차감"} {isAdd ? "+" : "-"}€{fmtE(adjAmount)}
                          {adjustment.adjDesc ? <span style={{color:"#888",marginLeft:4}}>· {adjustment.adjDesc}</span> : null}
                        </div>
                      ) : null}
                      {isPaid && payment.method ? (
                        <div style={{fontSize:11,color:"#666",marginTop:4}}>
                          방법: {payment.method} · 실제 €{fmtE(payment.amount || finalPay)}
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
                {myS.length === 0 ? (
                  <p style={{color:"#888",fontSize:12}}>이번달 등록된 스케줄 없음</p>
                ) : (
                  <table className="tbl">
                    <thead><tr><th>날짜</th><th>요일</th><th>타입</th><th>시간</th><th>급여</th><th></th></tr></thead>
                    <tbody>
                      {myS.map(s => {
                        const me = gSt(svSid);
                        const h = shiftHours(s);
                        const pay = h * (me?.wage || 0);
                        return (
                          <tr key={s.id}>
                            <td>{s.date}</td>
                            <td>{dowKo(s.date)}</td>
                            <td><span className={"badge " + (s.slotType === "오프닝" ? "bylw" : "bgrn")}>{s.slotType}</span></td>
                            <td className="mn" style={{fontSize:11}}>{s.start}~{s.end} ({h}h)</td>
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
            <div style={{fontSize:13,fontWeight:700,marginBottom:9}}>📋 이번달 전체 스케줄</div>
            {(() => {
              // 이번달 부족한 날 계산
              const ymNow = curYM();
              const [y, m] = ymNow.split("-").map(Number);
              const dim = new Date(y, m, 0).getDate();
              const hols = hessenHols(y);
              const understaffed = [];
              for (let d = 1; d <= dim; d++) {
                const ds = `${ymNow}-${String(d).padStart(2,"0")}`;
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
                      const sorted = [...shifts].sort((a, b) => (a.slotType==="오프닝"?0:1) - (b.slotType==="오프닝"?0:1));
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
                          {sorted.slice(0, 4).map(sh => {
                            const st = gSt(sh.staffId);
                            const bg = st ? (st.color + "28") : "#ddd";
                            const fg = st ? st.color : "#888";
                            const nm = st ? st.name.slice(0, 3) : "?";
                            return (
                              <div key={sh.id} className="sp" style={{background:bg, color:fg}}>{nm}</div>
                            );
                          })}
                          {shifts.length > 4 ? (
                            <div style={{fontSize:7,color:"#888"}}>+{shifts.length-4}</div>
                          ) : null}
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
  };

  // ─── 모달 ───
  const renderModal = () => {
    if (!modal) return null;

    if (modal.type === "pin") {
      return (
        <div className="ov" onClick={e => {
          if (e.target === e.currentTarget) {
            closeModal();
            setPinBuf("");
            setPinErr("");
          }
        }}>
          <div className="pb">
            <div style={{fontFamily:"'Noto Sans KR', sans-serif",fontSize:17,fontWeight:700,color:"#4dabf7",marginBottom:4,letterSpacing:1}}>💙 HAMAFILM</div>
            <div style={{fontSize:12,color:"#888",marginBottom:18}}>관리자 PIN</div>
            <div className="pds">
              {[0,1,2,3].map(i => (
                <div key={i} className={"pde" + (i < pinBuf.length ? " f" : "")} />
              ))}
            </div>
            {pinErr ? <div style={{color:"#ff4757",fontSize:12,marginBottom:8}}>{pinErr}</div> : null}
            <div className="ppd">
              {[1,2,3,4,5,6,7,8,9].map(d => (
                <button key={d} className="pb2" onClick={()=>doPinInput(String(d))}>{d}</button>
              ))}
              <button className="pb2" onClick={()=>doPinInput("0")} style={{gridColumn:2}}>0</button>
              <button className="pb2" style={{fontSize:14,color:"#888"}} onClick={()=>setPinBuf(b => b.slice(0, -1))}>⌫</button>
            </div>
            <button style={{background:"none",border:"none",color:"#888",fontSize:12,cursor:"pointer"}} onClick={()=>{closeModal(); setPinBuf(""); setPinErr("");}}>취소</button>
          </div>
        </div>
      );
    }

    if (modal.type === "dayDetail") {
      const ds = modal.date;
      const hols = hessenHols(new Date(ds).getFullYear());
      const shifts = (data.shifts||[]).filter(s => s.date === ds);
      return (
        <div className="ov" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="modal">
            <h3>📅 {ds} ({dowKo(ds)})</h3>
            {hols[ds] ? <span className="badge bred" style={{marginBottom:8,display:"inline-block"}}>🎌 {hols[ds]}</span> : null}
            {isVac(ds) ? <span className="badge bgrn" style={{marginBottom:8,display:"inline-block",marginLeft:4}}>🏖 {vacName(ds)}</span> : null}
            {shifts.length === 0 ? (
              <p style={{color:"#888",fontSize:13}}>스케줄 없음</p>
            ) : (
              shifts.map(sh => {
                const st = gSt(sh.staffId);
                const h = shiftHours(sh);
                const tCls = sh.slotType === "오프닝" ? "bylw" : "bgrn";
                return (
                  <div key={sh.id} style={{background:"#f5f5f7",borderRadius:8,padding:10,marginBottom:7,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <span className="dot" style={{background:st?.color||"#666"}} />
                      <strong>{st?.name||"?"}</strong>
                      <span className={"badge " + tCls} style={{marginLeft:5}}>{sh.slotType}</span>
                      <div style={{fontSize:11,color:"#888",marginTop:2}}>{sh.start}~{sh.end} · {h}h · €{fmtE(h * (st?.wage || 0))}</div>
                    </div>
                    <button className="btn bd sm" onClick={async()=>{
                      await persist({...data, shifts: (data.shifts||[]).filter(s => s.id !== sh.id)});
                      closeModal();
                      showToast("삭제");
                    }}>삭제</button>
                  </div>
                );
              })
            )}
            <div className="mf">
              <button className="btn bs" onClick={closeModal}>닫기</button>
              <button className="btn bp" onClick={()=>setModal({type:"addShift", date:ds})}>+ 추가</button>
            </div>
          </div>
        </div>
      );
    }

    if (modal.type === "addShift") return <AddShiftModal modal={modal} data={data} persist={persist} close={closeModal} toast={showToast} gSt={gSt} isVac={isVac} vacName={vacName} />;
    if (modal.type === "addFixed") return <AddFixedModal data={data} persist={persist} close={closeModal} toast={showToast} />;
    if (modal.type === "addVac") return <AddVacModal data={data} persist={persist} close={closeModal} toast={showToast} />;
    if (modal.type === "addStaff") return <AddStaffModal modal={modal} data={data} persist={persist} close={closeModal} toast={showToast} />;
    if (modal.type === "addSales") return <AddSalesModal data={data} persist={persist} close={closeModal} toast={showToast} />;
    if (modal.type === "genFixed") return <GenFixedModal modal={modal} data={data} persist={persist} close={closeModal} toast={showToast} isVac={isVac} />;
    if (modal.type === "addPayroll") return <AddPayrollModal modal={modal} data={data} persist={persist} close={closeModal} toast={showToast} gSt={gSt} />;
    if (modal.type === "editPayment") return <EditPaymentModal modal={modal} data={data} persist={persist} close={closeModal} toast={showToast} gSt={gSt} />;
    if (modal.type === "expense") return <ExpenseModal modal={modal} data={data} persist={persist} close={closeModal} toast={showToast} />;
    if (modal.type === "historical") return <HistoricalModal modal={modal} data={data} persist={persist} close={closeModal} toast={showToast} />;

    return null;
  };

  const tabs = [
    ["schedule", "📅 스케줄"],
    ["fixed", "🔁 고정"],
    ["staff", "👤 직원"],
    ["salary", "💰 급여"],
    ["sales", "📊 매출"],
    ["stats", "📈 통계"]
  ];

  return (
    <>
      <style>{css}</style>
      {mode === "staff" ? renderStaffView() : (
        <div>
          <div className="tb">
            <div className="logo">💙 HAMAFILM<small>관리자</small></div>
            <div className="nav">
              {tabs.map(([t, lbl]) => (
                <button key={t} className={"nt" + (adminTab === t ? " on" : "")} onClick={()=>setAdminTab(t)}>{lbl}</button>
              ))}
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
              <span style={{
                fontSize:10,
                padding:"3px 7px",
                borderRadius:10,
                background: storageMode==="shared" ? "rgba(46,213,115,.15)" : storageMode==="local" ? "rgba(255,71,87,.15)" : "rgba(255,255,255,.08)",
                color: storageMode==="shared" ? "#2ed573" : storageMode==="local" ? "#ff4757" : "#aaa",
                fontWeight:600
              }}>
                {storageMode==="shared" ? "🟢" : storageMode==="local" ? "🔴" : "⚪"}
              </span>
              <button className="btn bs sm" onClick={()=>setMode("staff")}>🔒</button>
            </div>
          </div>
          <div className="pg">
            {adminTab === "schedule" ? renderCal() : null}
            {adminTab === "fixed" ? renderFixed() : null}
            {adminTab === "staff" ? renderStaffMgmt() : null}
            {adminTab === "salary" ? <SalaryTab data={data} persist={persist} setModal={setModal} gSt={gSt} /> : null}
            {adminTab === "sales" ? <SalesTab data={data} persist={persist} setModal={setModal} /> : null}
            {adminTab === "stats" ? <StatsTab data={data} setModal={setModal} /> : null}
          </div>
        </div>
      )}
      {renderModal()}
      {toast ? (
        <div style={{position:"fixed",bottom:18,right:18,background:"#1a1a1a",color:"#fff",borderRadius:8,padding:"10px 16px",fontSize:13,fontWeight:500,zIndex:200,boxShadow:"0 4px 16px rgba(0,0,0,.15)"}}>{toast}</div>
      ) : null}
    </>
  );
}
