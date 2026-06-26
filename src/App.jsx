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
function prevYM(ym){const [y,m]=ym.split("-").map(Number);return m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,"0")}`;}
// 지난달 조정(차감/추가)이 이번달(ym)에 반영될 레코드를 찾아 부호화된 carry-in 금액을 돌려준다.
// 차감 → 음수, 추가지급 → 양수, 없으면 0. (실정산 = actualAmount + carryIn)
function getCarryIn(records, staffId, ym){
  const adj = (records||[]).find(p =>
    p.staffId === staffId &&
    p.adjType && p.adjType !== "없음" &&
    p.adjAmount > 0 &&
    nextYM(p.ym) === ym
  );
  if (!adj) return { amount: 0, isAdd: false, desc: "", rec: null };
  const isAdd = adj.adjType === "추가지급" || adj.adjType === "추가";
  return { amount: isAdd ? adj.adjAmount : -adj.adjAmount, isAdd, desc: adj.adjDesc || "", rec: adj };
}
function fmtE(n){return Number(n||0).toFixed(2);}
function fmt(n){return Number(n||0).toLocaleString("ko-KR");}
function nid(arr){return arr.length?Math.max(...arr.map(x=>x.id))+1:1;}
function shiftHours(sh){return sh.hours||(getSlots(sh.date).find(s=>s.type===sh.slotType)||{hours:0}).hours;}

// 실제 근무 시간 계산 (분 단위)
function actualMinutes(sh) {
  if (!sh.actualStart || !sh.actualEnd) return null;
  const [sh1, sm1] = sh.actualStart.split(":").map(Number);
  const [eh1, em1] = sh.actualEnd.split(":").map(Number);
  return (eh1*60+em1) - (sh1*60+sm1);
}

// 예정 vs 실제 차이 (분). 양수=더 일함, 음수=덜 일함, null=미체크
function timeDiff(sh) {
  const actual = actualMinutes(sh);
  if (actual === null) return null;
  const planned = shiftHours(sh) * 60;
  return actual - planned;
}

// 차이가 30분 이상 (절대값)이면 주목 필요
function needsAttention(sh) {
  const d = timeDiff(sh);
  return d !== null && Math.abs(d) >= 30;
}

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
  historicalData: [],   // 과거 월별 직접 입력 데이터 [{ym, sales, expenses, labor, memo}]
  cancellations: [],    // 직원 취소 기록 [{id, staffId, staffName, date, slotType, reason, cancelledAt, viewed}]
  // 체크리스트 템플릿: [{id, name, icon, type: "opening"|"closing"|"all", items, order}]
  checklists: [
    {
      id: 1, name: "오프닝", icon: "🌅", type: "opening", order: 1,
      items: [
        {id: 11, text: "매장 문 열고 조명 켜기"},
        {id: 12, text: "에어컨/난방 켜기"},
        {id: 13, text: "카메라 및 장비 점검"},
        {id: 14, text: "포토부스 청소 (거울, 의자)"},
        {id: 15, text: "POS 시스템 켜기"},
        {id: 16, text: "잔돈 준비 확인"},
        {id: 17, text: "음악 켜기"}
      ]
    },
    {
      id: 2, name: "마감", icon: "🌙", type: "closing", order: 2,
      items: [
        {id: 21, text: "매장 정리 및 청소"},
        {id: 22, text: "카메라/장비 정리"},
        {id: 23, text: "쓰레기 비우기"},
        {id: 24, text: "POS 마감 (정산)"},
        {id: 25, text: "현금 금고에 보관"},
        {id: 26, text: "에어컨/조명 끄기"},
        {id: 27, text: "문 잠그기"}
      ]
    }
  ],
  // 체크리스트 완료 기록: [{id, checklistId, staffId, date, checkedItems: [itemId], note, completedAt}]
  completions: [],
  // 설정 (매뉴얼 URL 등)
  settings: {
    manualUrl: "" // 구글 독스 매뉴얼 링크
  }
};

// ═══ Google Apps Script 백엔드 ═══
const GAS_URL = "https://script.google.com/macros/s/AKfycbw48A5z_PANeJWD-GRZbNc0SPj2uZmurngM1TQiq3tx69VDR9zDC153IOsVcxGSGaV8/exec";

let STORAGE_MODE = "loading";
let LAST_ERROR = "";
let SAVING = false;
let LAST_SAVE_AT = 0;
let LAST_USER_INTERACTION = 0;
let LAST_SYNCED_JSON = "";

// ===== 다중 시트 분산 저장 =====
// 각 데이터 종류를 별도 시트에 저장하여 50KB 한계 회피
// 시트 이름 매핑: 어떤 데이터가 어떤 시트로 가는지
const BUCKETS = {
  // 자주 변경 + 핵심 (기본 시트)
  data: ["staff", "fixed", "vacations", "checklists", "settings", "historicalData", "payrollRecords"],
  // 큰 데이터들은 별도 시트로
  shifts: ["shifts"],
  sales: ["sales"],
  completions: ["completions"],
  expenses: ["expenses"],
  payments: ["payments"],
  cancellations: ["cancellations"]
};

// 데이터 키 → 시트 이름 역매핑
const KEY_TO_BUCKET = {};
Object.entries(BUCKETS).forEach(([bucket, keys]) => {
  keys.forEach(k => { KEY_TO_BUCKET[k] = bucket; });
});

async function loadData(){
  try {
    // 모든 시트 한 번에 가져오기
    const res = await fetch(GAS_URL, { method: "GET", redirect: "follow" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    STORAGE_MODE = "shared";
    LAST_ERROR = "";

    if (j && j.multi && j.data) {
      // 신규 다중 시트 형식: 각 시트의 데이터를 합쳐서 하나의 데이터 객체로
      const merged = {};
      Object.entries(j.data).forEach(([bucket, jsonStr]) => {
        if (!jsonStr) return;
        try {
          const parsed = JSON.parse(jsonStr);
          // data 시트는 기존 호환성: STORE_KEY 안에 모든 게 들어있을 수 있음
          if (parsed[STORE_KEY]) {
            Object.assign(merged, parsed[STORE_KEY]);
          } else {
            // 새 형식: 시트 이름이 키
            Object.assign(merged, parsed);
          }
        } catch(e) { console.warn("parse fail", bucket, e); }
      });
      // PIN 추출
      if (merged[PIN_KEY]) {
        try { localStorage.setItem(PIN_KEY, merged[PIN_KEY]); } catch(e) {}
      }
      // STORE_KEY 키들이 비어있으면 빈 배열로 초기화
      ["staff","shifts","fixed","vacations","sales","payrollRecords","payments","expenses","historicalData","cancellations","checklists","completions"].forEach(k => {
        if (!merged[k]) merged[k] = [];
      });
      if (!merged.settings) merged.settings = {};
      return merged;
    }

    if (j && j.data) {
      // 옛날 단일 시트 형식 (호환성)
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
  // 로컬 폴백
  try {
    STORAGE_MODE = "local";
    const r = localStorage.getItem(STORE_KEY);
    if (r) return JSON.parse(r);
  } catch(e) {}
  return null;
}

// 데이터를 여러 시트로 분산 저장
function splitData(d) {
  // 각 시트별로 저장할 데이터 객체 만들기
  const buckets = {};
  Object.keys(BUCKETS).forEach(bucket => {
    buckets[bucket] = {};
  });

  // 키별로 적절한 시트에 분배
  Object.entries(d || {}).forEach(([key, value]) => {
    const targetBucket = KEY_TO_BUCKET[key] || "data";
    buckets[targetBucket][key] = value;
  });

  // PIN은 data 시트에
  try {
    const pin = localStorage.getItem(PIN_KEY);
    if (pin) buckets.data[PIN_KEY] = pin;
  } catch(e) {}

  return buckets;
}

async function saveData(d){
  SAVING = true;
  try {
    const buckets = splitData(d);

    // 각 시트별 JSON 만들기
    const payload = {
      multi: true,
      buckets: {}
    };
    Object.entries(buckets).forEach(([name, content]) => {
      payload.buckets[name] = JSON.stringify(content);
    });

    const res = await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow"
    });

    if (res.ok) {
      const txt = await res.text();
      try {
        const result = JSON.parse(txt);
        if (result.ok) {
          STORAGE_MODE = "shared";
          LAST_ERROR = "";
          LAST_SAVE_AT = Date.now();
          try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch(e) {}
          return true;
        }
      } catch(e) {
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
  // 로컬 폴백
  try {
    STORAGE_MODE = "local";
    localStorage.setItem(STORE_KEY, JSON.stringify(d));
  } catch(e) {}
  return false;
}

async function fetchAll() {
  // 호환성용 — 새 코드는 loadData 사용
  return await loadData() || {};
}

async function loadPin(){
  // PIN은 로컬 캐시 먼저 (loadData 시 캐시됨)
  try {
    const p = localStorage.getItem(PIN_KEY);
    if (p) return p;
  } catch(e) {}
  // 못 찾으면 데이터에서
  try {
    const d = await loadData();
    if (d && d[PIN_KEY]) return d[PIN_KEY];
  } catch(e) {}
  return DEFAULT_PIN;
}

async function savePin(p){
  // PIN은 data 시트에 직접 저장
  try {
    const all = await loadData();
    all[PIN_KEY] = p;
    const buckets = splitData(all);
    buckets.data[PIN_KEY] = p; // 명시적
    const payload = {
      multi: true,
      buckets: {}
    };
    Object.entries(buckets).forEach(([name, content]) => {
      payload.buckets[name] = JSON.stringify(content);
    });
    await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify(payload),
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
.cday { min-height: 60px; background: #f5f5f7; border-radius: 6px; padding: 4px; cursor: pointer; border: 1px solid transparent; overflow: hidden; display: flex; flex-direction: column; }
.cday:hover { background: #ebebef; }
.cday.today { border-color: #4dabf7; box-shadow: 0 0 0 1px #4dabf7; }
.cday.understaffed { background: rgba(255, 212, 0, 0.25); border: 1.5px solid #ffd400; box-shadow: 0 0 8px rgba(255, 212, 0, 0.4); }
.cday.hol { background: #ffe8e8; }
.cday.vac { background: #e6f7e9; }
.cday.other { opacity: .35; }
.dn { font-size: 10px; font-weight: 600; margin-bottom: 1px; color: #666; }
.sp { font-size: 8px; font-weight: 600; padding: 1px 3px; border-radius: 2px; margin-bottom: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.4; }
.spgrp { display: flex; flex-direction: column; gap: 1px; }
.spgrp-bottom { margin-top: auto; }
.sp-open { border-left: 2px solid #f5c518; }
.sp-close { border-left: 2px solid #2ed573; }
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
  const [actualAmount, setActualAmount] = useState(rec?.actualAmount ?? "");
  const [hours, setHours] = useState(rec?.hours || "");
  const [adjType, setAdjType] = useState(() => {
    const t = rec?.adjType || "없음";
    if (t === "추가") return "추가지급"; // 옛날 데이터 마이그레이션
    return t;
  });
  const [adjAmt, setAdjAmt] = useState(rec?.adjAmount || "");
  const [adjDesc, setAdjDesc] = useState(rec?.adjDesc || "");
  const [autoCarry, setAutoCarry] = useState(rec ? (rec.carryToNext != null) : true);
  const shifts = (data.shifts||[]).filter(s => s.staffId===sid && s.date.startsWith(ym));
  let refH = 0;
  shifts.forEach(s => { refH += shiftHours(s); });
  const st = gSt(sid);
  const refPay = fmtE(refH * (st?.wage || 0));

  // ── 실근무 정산액 기반 자동 이월 계산 ──
  // 실정산 = 실근무정산액 + 전월 carry-in(차감은 음수)
  // 차월이월 = 확정급여 − 실정산  (양수면 다음달 차감, 음수면 다음달 추가지급)
  const carryIn = getCarryIn(data.payrollRecords, sid, ym); // {amount(부호), isAdd, desc}
  const hasActual = actualAmount !== "" && !isNaN(parseFloat(actualAmount));
  const settleNow = hasActual ? (parseFloat(actualAmount) + carryIn.amount) : null; // 이번달 실정산
  const carryRaw = (hasActual && amount !== "") ? (parseFloat(amount) - settleNow) : 0; // 확정 − 실정산
  // 부동소수 보정 (예: 51.330000001 → 51.33)
  const carryToNext = Math.round(carryRaw * 100) / 100;

  // 자동모드면 위 계산값으로 adjType/adjAmt를 덮어쓴다
  const effAdjType = autoCarry && hasActual ? (carryToNext >= 0 ? "차감" : "추가지급") : adjType;
  const effAdjAmt = autoCarry && hasActual ? Math.abs(carryToNext) : (parseFloat(adjAmt) || 0);

  const hasAdj = effAdjType !== "없음" && effAdjAmt > 0;
  const adjSign = effAdjType === "추가지급" ? "+" : "-";
  const adjCol = effAdjType === "추가지급" ? "#20a060" : "#e63946";

  const save = async () => {
    if (!amount) { toast("확정급여 입력"); return; }
    const entry = {
      id: rec ? rec.id : nid(data.payrollRecords||[]),
      staffId: sid, ym,
      amount: parseFloat(amount),
      actualAmount: hasActual ? parseFloat(actualAmount) : null,
      hours: parseFloat(hours) || 0,
      adjType: effAdjType,
      adjAmount: effAdjAmt > 0 ? Math.round(effAdjAmt * 100) / 100 : 0,
      adjDesc: (autoCarry && hasActual && !adjDesc) ? "실근무 정산 차액 이월" : adjDesc,
      carryToNext: (autoCarry && hasActual) ? carryToNext : null,
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
            <label>확정 급여 (€) <span style={{fontSize:9,color:"#888"}}>명세서</span></label>
            <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} step="0.01" placeholder={refPay} />
          </div>
          <div>
            <label>확정 시간 (h)</label>
            <input type="number" value={hours} onChange={e=>setHours(e.target.value)} step="0.5" placeholder={String(refH)} />
          </div>
        </div>
        <div className="fr">
          <div>
            <label>실근무 정산액 (€) <span style={{fontSize:9,color:"#888"}}>실제 받을 금액 (선택)</span></label>
            <input type="number" value={actualAmount} onChange={e=>setActualAmount(e.target.value)} step="0.01" placeholder={refPay} />
          </div>
        </div>
        {carryIn.amount !== 0 ? (
          <div style={{fontSize:11,color:"#666",margin:"2px 0 6px"}}>
            ↪ 지난달 {carryIn.isAdd ? "추가지급" : "차감"} <strong style={{color: carryIn.isAdd ? "#20a060" : "#e63946"}}>{carryIn.isAdd ? "+" : "-"}€{fmtE(Math.abs(carryIn.amount))}</strong> 이번달 반영
          </div>
        ) : null}
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#1971c2",fontWeight:600,margin:"6px 0"}}>
          <input type="checkbox" checked={autoCarry} onChange={e=>setAutoCarry(e.target.checked)} style={{width:"auto"}} />
          🔄 차월 이월 자동 계산 (확정 − 실정산)
        </label>
        {!autoCarry ? (
          <>
            <div style={{fontSize:11,fontWeight:700,color:"#d94c1a",margin:"8px 0 5px"}}>⚖️ 조정 (다음달 반영) · 수동</div>
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
          </>
        ) : null}
        <div className="fr">
          <div>
            <label>사유</label>
            <input value={adjDesc} onChange={e=>setAdjDesc(e.target.value)} placeholder={autoCarry ? "비우면 자동: 실근무 정산 차액 이월" : "예: 미근무 차감"} />
          </div>
        </div>
        {parseFloat(amount) > 0 ? (
          <div style={{background:"rgba(245,197,24,.08)",border:"1px solid rgba(245,197,24,.3)",borderRadius:7,padding:"8px 11px",fontSize:12,lineHeight:1.7}}>
            <div>확정(명세서): <strong style={{color:"#4ecdc4"}}>€{fmtE(parseFloat(amount))}</strong></div>
            {hasActual ? (
              <div>이번달 실정산: <strong style={{color:"#1971c2"}}>€{fmtE(settleNow)}</strong>
                <span style={{fontSize:10,color:"#888",marginLeft:5}}>
                  (실근무 €{fmtE(parseFloat(actualAmount))}{carryIn.amount !== 0 ? ` ${carryIn.amount<0?"−":"+"} €${fmtE(Math.abs(carryIn.amount))}` : ""})
                </span>
              </div>
            ) : null}
            {hasAdj ? (
              <div>{nextYM(ym)} 이월: <strong style={{color:adjCol}}>{adjSign}€{fmtE(effAdjAmt)}</strong>
                <span style={{fontSize:10,color:"#888",marginLeft:5}}>{effAdjType==="차감"?"(다음달 차감)":"(다음달 추가)"}</span>
              </div>
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

// CSV 자동 매출 입력 모달
// 체크리스트 실행 모달 (직원용)
function ChecklistRunModal({ modal, data, persist, close, toast, gSt }) {
  const checklist = (data.checklists||[]).find(c => c.id === modal.checklistId);
  const staff = gSt(modal.staffId);
  const today = todayStr();

  // 오늘 이 체크리스트의 기존 완료 기록 (있으면 이어서)
  const existing = (data.completions||[]).find(c =>
    c.checklistId === modal.checklistId &&
    c.date === today &&
    c.staffId === modal.staffId
  );

  const [checked, setChecked] = useState(new Set(existing?.checkedItems || []));
  const [note, setNote] = useState(existing?.note || "");

  if (!checklist) {
    return (
      <div className="ov" onClick={close}>
        <div className="modal"><h3>체크리스트 없음</h3><div className="mf"><button className="btn bs" onClick={close}>닫기</button></div></div>
      </div>
    );
  }

  const toggle = (id) => {
    const s = new Set(checked);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setChecked(s);
  };

  const save = async () => {
    const allChecked = checklist.items.every(i => checked.has(i.id));
    const entry = {
      id: existing?.id || Date.now(),
      checklistId: modal.checklistId,
      staffId: modal.staffId,
      staffName: staff?.name || "?",
      date: today,
      checkedItems: [...checked],
      totalItems: checklist.items.length,
      complete: allChecked,
      note,
      completedAt: new Date().toISOString()
    };
    let nd;
    if (existing) {
      nd = {...data, completions: (data.completions||[]).map(c => c.id===existing.id ? entry : c)};
    } else {
      nd = {...data, completions: [...(data.completions||[]), entry]};
    }
    await persist(nd);
    close();
    toast(allChecked ? `✅ ${checklist.name} 완료!` : "💾 진행상황 저장됨");
  };

  const checkAll = () => setChecked(new Set(checklist.items.map(i => i.id)));
  const uncheckAll = () => setChecked(new Set());

  const progress = checklist.items.length > 0
    ? Math.round([...checked].filter(id => checklist.items.find(i => i.id === id)).length / checklist.items.length * 100)
    : 0;

  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" style={{maxWidth:480}}>
        <h3>{checklist.icon} {checklist.name} 체크리스트</h3>
        <div style={{fontSize:11,color:"#888",marginBottom:10}}>
          {staff?.name} · {today}
        </div>

        {/* 진행률 바 */}
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
            <span style={{fontSize:11,color:"#666",fontWeight:600}}>
              {[...checked].filter(id => checklist.items.find(i => i.id === id)).length} / {checklist.items.length} 완료
            </span>
            <span style={{fontSize:11,color: progress === 100 ? "#20a060" : "#1971c2",fontWeight:700}}>
              {progress}%
            </span>
          </div>
          <div style={{background:"#f0f0f0",borderRadius:4,height:6,overflow:"hidden"}}>
            <div style={{
              height:"100%",
              width: progress + "%",
              background: progress === 100 ? "#2ed573" : "#4dabf7",
              transition:"width .3s"
            }} />
          </div>
        </div>

        {/* 액션 버튼 */}
        <div style={{display:"flex",gap:5,marginBottom:10}}>
          <button className="btn bs sm" onClick={checkAll} style={{flex:1}}>✓ 모두 체크</button>
          <button className="btn bs sm" onClick={uncheckAll} style={{flex:1}}>✗ 모두 해제</button>
        </div>

        {/* 체크 항목들 */}
        <div style={{maxHeight:300,overflowY:"auto",marginBottom:10}}>
          {checklist.items.map(item => {
            const isChecked = checked.has(item.id);
            return (
              <div
                key={item.id}
                onClick={()=>toggle(item.id)}
                style={{
                  display:"flex",
                  alignItems:"center",
                  gap:10,
                  padding:"10px 12px",
                  background: isChecked ? "rgba(46,213,115,.1)" : "#f5f5f7",
                  border: isChecked ? "1px solid #2ed573" : "1px solid transparent",
                  borderRadius:7,
                  marginBottom:5,
                  cursor:"pointer",
                  transition:"all .15s"
                }}>
                <div style={{
                  width:22,height:22,borderRadius:5,
                  background: isChecked ? "#2ed573" : "#fff",
                  border: isChecked ? "none" : "2px solid #d0d0d0",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  flexShrink:0,
                  color:"#fff",fontSize:12,fontWeight:700
                }}>
                  {isChecked ? "✓" : ""}
                </div>
                <span style={{
                  fontSize:13,
                  color: isChecked ? "#888" : "#1a1a1a",
                  textDecoration: isChecked ? "line-through" : "none"
                }}>
                  {item.text}
                </span>
              </div>
            );
          })}
        </div>

        {/* 메모 */}
        <div className="fr">
          <div>
            <label>📝 메모 (선택사항 — 사장님께 전달)</label>
            <input
              value={note}
              onChange={e=>setNote(e.target.value)}
              placeholder="예: 카메라 1번 렌즈 고장, 휴지 부족"
            />
          </div>
        </div>

        <div className="mf">
          <button className="btn bs" onClick={close}>나가기</button>
          <button className="btn bp" onClick={save}>
            {progress === 100 ? "✅ 완료" : "💾 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// 체크리스트 관리 모달 (관리자가 항목 편집)
function ChecklistManageModal({ data, persist, close, toast }) {
  const [editingList, setEditingList] = useState(null); // 현재 편집 중인 체크리스트 객체
  const [newItemText, setNewItemText] = useState("");

  // 새 체크리스트 추가
  const addList = async () => {
    const name = prompt("체크리스트 이름 (예: 청소, 비품관리)");
    if (!name) return;
    const icon = prompt("이모지 1개 (예: 🧹, 📦, ⚠️)", "📋") || "📋";
    const typeAns = prompt(
      "언제 보여줄까요?\n\n" +
      "1 = 🌅 오프닝 시프트일 때만\n" +
      "2 = 🌙 클로징 시프트일 때만\n" +
      "3 = 항상 (오프닝/클로징 상관없이)",
      "3"
    );
    const type = typeAns === "1" ? "opening" : typeAns === "2" ? "closing" : "all";
    const newList = {
      id: Date.now(),
      name,
      icon,
      type,
      order: (data.checklists||[]).length + 1,
      items: []
    };
    await persist({...data, checklists: [...(data.checklists||[]), newList]});
    setEditingList(newList);
  };

  // 체크리스트 삭제
  const removeList = async (id) => {
    if (!confirm("이 체크리스트를 삭제할까요? (지난 기록은 그대로 유지)")) return;
    await persist({...data, checklists: (data.checklists||[]).filter(c => c.id !== id)});
    if (editingList?.id === id) setEditingList(null);
    toast("삭제됨");
  };

  // 항목 추가
  const addItem = async () => {
    if (!newItemText.trim() || !editingList) return;
    const newItem = { id: Date.now(), text: newItemText.trim() };
    const updatedList = { ...editingList, items: [...editingList.items, newItem] };
    setEditingList(updatedList);
    await persist({...data, checklists: (data.checklists||[]).map(c => c.id === editingList.id ? updatedList : c)});
    setNewItemText("");
  };

  // 항목 삭제
  const removeItem = async (itemId) => {
    if (!editingList) return;
    const updatedList = { ...editingList, items: editingList.items.filter(i => i.id !== itemId) };
    setEditingList(updatedList);
    await persist({...data, checklists: (data.checklists||[]).map(c => c.id === editingList.id ? updatedList : c)});
  };

  // 항목 수정
  const editItem = async (itemId) => {
    const item = editingList.items.find(i => i.id === itemId);
    if (!item) return;
    const newText = prompt("수정", item.text);
    if (!newText || newText === item.text) return;
    const updatedList = {
      ...editingList,
      items: editingList.items.map(i => i.id === itemId ? {...i, text: newText} : i)
    };
    setEditingList(updatedList);
    await persist({...data, checklists: (data.checklists||[]).map(c => c.id === editingList.id ? updatedList : c)});
  };

  // 체크리스트 이름/아이콘 변경
  const editListMeta = async () => {
    if (!editingList) return;
    const name = prompt("이름 변경", editingList.name);
    if (!name) return;
    const icon = prompt("이모지", editingList.icon) || editingList.icon;
    const curType = editingList.type || "all";
    const curTypeNum = curType === "opening" ? "1" : curType === "closing" ? "2" : "3";
    const typeAns = prompt(
      "언제 보여줄까요?\n\n" +
      "1 = 🌅 오프닝 시프트일 때만\n" +
      "2 = 🌙 클로징 시프트일 때만\n" +
      "3 = 항상",
      curTypeNum
    );
    const type = typeAns === "1" ? "opening" : typeAns === "2" ? "closing" : typeAns === "3" ? "all" : curType;
    const updated = {...editingList, name, icon, type};
    setEditingList(updated);
    await persist({...data, checklists: (data.checklists||[]).map(c => c.id === editingList.id ? updated : c)});
  };

  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" style={{maxWidth:520}}>
        <h3>📋 체크리스트 관리</h3>

        {!editingList ? (
          <>
            <div style={{fontSize:11,color:"#888",marginBottom:10}}>
              💡 체크리스트를 클릭해서 편집하거나 새로 만드세요
            </div>
            {(data.checklists||[]).map(cl => (
              <div key={cl.id} style={{
                background:"#f5f5f7",
                borderRadius:7,
                padding:"10px 12px",
                marginBottom:6,
                display:"flex",
                alignItems:"center",
                justifyContent:"space-between",
                cursor:"pointer"
              }}
              onClick={()=>setEditingList(cl)}>
                <div>
                  <span style={{fontSize:18,marginRight:6}}>{cl.icon}</span>
                  <strong>{cl.name}</strong>
                  <span style={{
                    fontSize:9,
                    marginLeft:6,
                    padding:"2px 6px",
                    borderRadius:3,
                    fontWeight:700,
                    background: cl.type === "opening" ? "rgba(245,197,24,.25)" : cl.type === "closing" ? "rgba(165,94,234,.2)" : "rgba(77,171,247,.15)",
                    color: cl.type === "opening" ? "#b8860b" : cl.type === "closing" ? "#7950f2" : "#1971c2"
                  }}>
                    {cl.type === "opening" ? "🌅 오프닝" : cl.type === "closing" ? "🌙 클로징" : "전체"}
                  </span>
                  <span style={{fontSize:11,color:"#888",marginLeft:6}}>{cl.items.length}개 항목</span>
                </div>
                <div style={{display:"flex",gap:4}}>
                  <button className="btn bs sm" onClick={e=>{e.stopPropagation(); setEditingList(cl);}}>편집</button>
                  <button className="btn bd sm" onClick={e=>{e.stopPropagation(); removeList(cl.id);}}>삭제</button>
                </div>
              </div>
            ))}
            <button className="btn bp" style={{width:"100%",marginTop:10}} onClick={addList}>
              + 새 체크리스트
            </button>
            <div className="mf">
              <button className="btn bs" onClick={close}>닫기</button>
            </div>
          </>
        ) : (
          <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <button className="btn bs sm" onClick={()=>setEditingList(null)}>← 뒤로</button>
              <button className="btn bs sm" onClick={editListMeta}>이름 변경</button>
            </div>
            <div style={{fontSize:16,fontWeight:700,marginBottom:10}}>
              {editingList.icon} {editingList.name}
            </div>

            <div style={{maxHeight:300,overflowY:"auto",marginBottom:10}}>
              {editingList.items.length === 0 ? (
                <div style={{textAlign:"center",color:"#aaa",padding:20,fontSize:12}}>아직 항목이 없어요</div>
              ) : editingList.items.map((item, idx) => (
                <div key={item.id} style={{
                  display:"flex",
                  alignItems:"center",
                  gap:8,
                  padding:"7px 10px",
                  background:"#f5f5f7",
                  borderRadius:6,
                  marginBottom:4
                }}>
                  <span style={{fontSize:11,color:"#888",width:18}}>{idx+1}.</span>
                  <span style={{flex:1,fontSize:13}}>{item.text}</span>
                  <button className="btn bs sm" onClick={()=>editItem(item.id)}>✏️</button>
                  <button className="btn bd sm" onClick={()=>removeItem(item.id)}>🗑</button>
                </div>
              ))}
            </div>

            <div style={{display:"flex",gap:5,marginBottom:10}}>
              <input
                value={newItemText}
                onChange={e=>setNewItemText(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter") addItem();}}
                placeholder="새 항목 입력 후 Enter"
                style={{flex:1}}
              />
              <button className="btn bp" onClick={addItem}>추가</button>
            </div>

            <div className="mf">
              <button className="btn bs" onClick={close}>완료</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// 매뉴얼 URL 설정 모달
function ManualSettingsModal({ data, persist, close, toast }) {
  const [url, setUrl] = useState(data.settings?.manualUrl || "");

  const save = async () => {
    await persist({...data, settings: {...(data.settings||{}), manualUrl: url.trim()}});
    close();
    toast("매뉴얼 링크 저장!");
  };

  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>📘 매뉴얼 링크 설정</h3>
        <div style={{fontSize:11,color:"#888",marginBottom:10,background:"#f5f5f7",padding:10,borderRadius:6}}>
          💡 Google Docs / Notion 등에 만든 매뉴얼 페이지의 공유 링크를 붙여넣으세요.
          <br/>직원 화면에 "📘 매뉴얼 보기" 버튼이 표시됩니다.
        </div>
        <div className="fr">
          <div>
            <label>매뉴얼 URL</label>
            <input
              type="url"
              value={url}
              onChange={e=>setUrl(e.target.value)}
              placeholder="https://docs.google.com/document/d/..."
            />
          </div>
        </div>
        {url ? (
          <div style={{marginTop:10}}>
            <a href={url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#1971c2"}}>
              🔗 링크 미리 열어보기
            </a>
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

function CsvImportModal({ data, persist, close, toast }) {
  const [parsed, setParsed] = useState(null); // {date: {pc,pk,...}}
  const [affectedKeys, setAffectedKeys] = useState([]); // 이번 업로드에서 영향받는 카테고리 키들
  const [unknown, setUnknown] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [files, setFiles] = useState({ sumup: null, hama: null });

  // 분류 함수: SUMUP의 Beschreibung 보고 카테고리 결정
  const classifySumup = (desc) => {
    const d = (desc || "").toLowerCase();
    // 사진 매출
    if (d.includes("hamafilm") || d.includes("angle")) return "sumup";
    if (d.includes("pass bild") || d.includes("passbild")) return "sumup";
    if (d.includes("stamp coupon") || d.includes("extra foto") || d.includes("dutch pay")) return "sumup";
    if (d.includes("exta") || d.includes("extra")) return "sumup"; // 오타 대응
    // 네일
    if (d.includes("nägel") || d.includes("nagel") || d.includes("nail")) return "nail";
    // 조이스보물
    if (d.includes("zoesbomul") || d.includes("zoes") || d.includes("조이스")) return "joys";
    // 악세서리
    if (d.includes("accessor") || d.includes("clothing") ||
        d.includes("key ring") || d.includes("keyring") ||
        d.includes("keychain") || d.includes("kette") ||
        d.includes("schmuck")) return "acc";
    return "unknown";
  };

  const parseAmt = (s) => {
    if (!s) return 0;
    return parseFloat(String(s).replace(",", ".").replace(/[^\d.\-]/g, "")) || 0;
  };

  // CSV 파서 (간단 구현, 따옴표 처리)
  const parseCsv = (text) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const result = [];
    for (const line of lines) {
      const row = [];
      let inQ = false, cur = "";
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQ && line[i+1] === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (c === "," && !inQ) {
          row.push(cur);
          cur = "";
        } else {
          cur += c;
        }
      }
      row.push(cur);
      result.push(row);
    }
    return result;
  };

  const processFiles = async () => {
    if (!files.sumup && !files.hama) {
      toast("최소 한 파일 선택");
      return;
    }
    setParsing(true);
    const dailyData = {}; // {date: {pc,pk,...}}
    const unknownList = [];
    const ensure = (date) => {
      if (!dailyData[date]) {
        dailyData[date] = {pc:0,pk:0,mc:0,mk:0,ac:0,ak:0,nc:0,nk:0,jc:0,jk:0,sk:0};
      }
      return dailyData[date];
    };

    // 어떤 카테고리(키)들이 이번 업로드에 포함되는지 추적
    // SUMUP만 올렸으면 mc/mk 건드리지 않고, HAMAFILM만 올렸으면 pc/pk/ac/ak/nc/nk/jc/jk 건드리지 않음
    const affectedKeys = new Set();

    // SUMUP 처리
    if (files.sumup) {
      // SUMUP은 사진/악세/네일/조이스 카테고리에 영향
      ["pc","pk","ac","ak","nc","nk","jc","jk"].forEach(k => affectedKeys.add(k));

      const text = await files.sumup.text();
      const rows = parseCsv(text);
      if (rows.length > 0) {
        const headers = rows[0].map(h => h.trim());
        const idx = (name) => headers.indexOf(name);
        const iDate = idx("Datum");
        const iTyp = idx("Typ");
        const iMethod = idx("Zahlungsmethode");
        const iDesc = idx("Beschreibung");
        const iAmount = idx("Preis (brutto)");
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r[iDate]) continue;
          const dpart = r[iDate].split(",")[0].trim();
          const m = dpart.match(/(\d{2})\.(\d{2})\.(\d{4})/);
          if (!m) continue;
          const date = `${m[3]}-${m[2]}-${m[1]}`;
          let amt = parseAmt(r[iAmount]);
          // 환불(Rückerstattung)의 경우 CSV에 이미 음수(-)로 기록되어 있음 → 그대로 사용
          const cat = classifySumup(r[iDesc]);
          const isCash = (r[iMethod] || "") === "Bar";
          const day = ensure(date);
          if (cat === "sumup") day[isCash?"pc":"pk"] += amt;
          else if (cat === "acc") day[isCash?"ac":"ak"] += amt;
          else if (cat === "nail") day[isCash?"nc":"nk"] += amt;
          else if (cat === "joys") day[isCash?"jc":"jk"] += amt;
          else { unknownList.push({desc: r[iDesc], date, amount: amt}); day[isCash?"pc":"pk"] += amt; }
        }
      }
    }

    // HAMAFILM 처리
    if (files.hama) {
      // HAMAFILM은 기계 카테고리에만 영향
      ["mc","mk"].forEach(k => affectedKeys.add(k));

      const text = await files.hama.text();
      const rows = parseCsv(text);
      if (rows.length > 0) {
        const headers = rows[0].map(h => h.trim().replace(/^\uFEFF/, ""));
        const idx = (name) => headers.indexOf(name);
        const iDate = idx("거래일");
        const iMethod = idx("결재방식");
        const iAmount = idx("금액");
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r[iDate]) continue;
          const date = r[iDate].slice(0, 10);
          const amt = parseAmt(r[iAmount]);
          const method = r[iMethod] || "";
          const day = ensure(date);
          if (method === "현금") day.mc += amt;
          else day.mk += amt;
        }
      }
    }

    // 빈 날짜 제거 (모든 영향받는 키가 0인 경우)
    Object.keys(dailyData).forEach(d => {
      let sum = 0;
      affectedKeys.forEach(k => { sum += dailyData[d][k] || 0; });
      if (sum === 0) delete dailyData[d];
    });

    setParsed(dailyData);
    setAffectedKeys([...affectedKeys]);
    setUnknown(unknownList);
    setParsing(false);
  };

  const doImport = async (mode) => {
    // mode: "merge" (기존+신규) 또는 "overwrite" (덮어쓰기)
    if (!parsed) return;
    const fileLabel = files.sumup && files.hama ? "SUMUP + HAMAFILM" :
                       files.sumup ? "SUMUP" : "HAMAFILM";
    if (!confirm(mode === "overwrite"
      ? `${fileLabel} 카테고리만 덮어쓸까요?\n(다른 카테고리는 그대로 유지됩니다)`
      : `${fileLabel} 데이터를 기존에 더할까요?`)) return;

    let newSales = [...(data.sales||[])];
    let added = 0, updated = 0;

    Object.entries(parsed).forEach(([date, vals]) => {
      const existing = newSales.find(s => s.date === date);
      if (existing) {
        if (mode === "overwrite") {
          // ⚠️ affectedKeys (이번 업로드에 포함된 카테고리)만 덮어씀
          // 다른 카테고리(예: SUMUP만 올렸으면 mc/mk = 기계)는 그대로 유지
          affectedKeys.forEach(k => {
            existing[k] = vals[k] || 0;
          });
          updated++;
        } else {
          // 합산: affectedKeys만 더함
          affectedKeys.forEach(k => {
            existing[k] = (existing[k]||0) + (vals[k]||0);
          });
          updated++;
        }
      } else {
        // 새 날짜 — affectedKeys만 채워서 추가 (나머지는 0)
        const newRow = {
          id: nid(newSales),
          date,
          pc:0,pk:0,mc:0,mk:0,ac:0,ak:0,nc:0,nk:0,jc:0,jk:0,sk:0
        };
        affectedKeys.forEach(k => {
          newRow[k] = vals[k] || 0;
        });
        newSales.push(newRow);
        added++;
      }
    });

    await persist({...data, sales: newSales});
    close();
    toast(`✅ ${added}일 추가, ${updated}일 ${mode==="overwrite"?"덮어씀":"합산"}!`);
  };

  // 미리보기 합계
  const totals = parsed ? Object.values(parsed).reduce((acc, day) => {
    Object.keys(day).forEach(k => acc[k] = (acc[k]||0) + day[k]);
    return acc;
  }, {}) : null;

  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" style={{maxWidth:560}}>
        <h3>📥 CSV 자동 매출 입력</h3>

        {!parsed ? (
          <>
            <div style={{fontSize:11,color:"#666",marginBottom:12,background:"#f5f5f7",padding:10,borderRadius:6}}>
              💡 SUMUP 매출보고서와 HAMAFILM 거래내역 CSV를 업로드하면<br/>
              자동으로 카테고리별로 분류해서 매출에 입력합니다.
            </div>

            <div className="fr">
              <div>
                <label>💳 SUMUP CSV (Verkaufsbericht...)</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={e => setFiles(f => ({...f, sumup: e.target.files[0]}))}
                  style={{padding:6}}
                />
                {files.sumup ? (
                  <div style={{fontSize:10,color:"#20a060",marginTop:3}}>
                    ✓ {files.sumup.name}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="fr">
              <div>
                <label>🖨 HAMAFILM CSV (루센트-매출관리...)</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={e => setFiles(f => ({...f, hama: e.target.files[0]}))}
                  style={{padding:6}}
                />
                {files.hama ? (
                  <div style={{fontSize:10,color:"#20a060",marginTop:3}}>
                    ✓ {files.hama.name}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mf">
              <button className="btn bs" onClick={close}>취소</button>
              <button className="btn bp" onClick={processFiles} disabled={parsing}>
                {parsing ? "분석중..." : "📊 분석하기"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{fontSize:12,color:"#666",marginBottom:10}}>
              📊 분석 완료 — 아래 내용 확인 후 입력하세요
            </div>

            {/* 영향받는 카테고리 안내 */}
            <div style={{background:"rgba(46,213,115,.1)",border:"1px solid rgba(46,213,115,.3)",borderRadius:8,padding:"10px 12px",marginBottom:10,fontSize:11}}>
              <div style={{color:"#20a060",fontWeight:700,marginBottom:4}}>
                ✅ 이번 업로드는 다음 카테고리만 영향:
              </div>
              <div style={{color:"#666"}}>
                {files.sumup ? "💳 SUMUP, 💍 악세서리, 💅 네일, 💎 조이스보물 " : ""}
                {files.hama ? "🖨 기계 " : ""}
              </div>
              <div style={{color:"#888",fontSize:10,marginTop:3}}>
                💡 다른 카테고리(슈킹{!files.hama ? ", 기계" : ""}{!files.sumup ? ", SUMUP/악세/네일/조이스" : ""})는 그대로 유지됩니다
              </div>
            </div>

            {/* 합계 미리보기 */}
            {totals ? (
              <div style={{background:"#e7f5ff",border:"1px solid #4dabf7",borderRadius:8,padding:12,marginBottom:10,fontSize:12}}>
                <div style={{fontWeight:700,color:"#1971c2",marginBottom:6}}>📈 카테고리별 합계</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,fontFamily:"monospace"}}>
                  <div>💳 SUMUP: €{fmtE(totals.pc + totals.pk)}</div>
                  <div style={{fontSize:10,color:"#666"}}>현 €{fmtE(totals.pc)} / 카 €{fmtE(totals.pk)}</div>
                  <div>🖨 기계: €{fmtE(totals.mc + totals.mk)}</div>
                  <div style={{fontSize:10,color:"#666"}}>현 €{fmtE(totals.mc)} / 카 €{fmtE(totals.mk)}</div>
                  <div>💍 악세서리: €{fmtE(totals.ac + totals.ak)}</div>
                  <div style={{fontSize:10,color:"#666"}}>현 €{fmtE(totals.ac)} / 카 €{fmtE(totals.ak)}</div>
                  <div>💅 네일: €{fmtE(totals.nc + totals.nk)}</div>
                  <div style={{fontSize:10,color:"#666"}}>현 €{fmtE(totals.nc)} / 카 €{fmtE(totals.nk)}</div>
                  <div>💎 조이스보물: €{fmtE(totals.jc + totals.jk)}</div>
                  <div style={{fontSize:10,color:"#666"}}>현 €{fmtE(totals.jc)} / 카 €{fmtE(totals.jk)}</div>
                </div>
                <div style={{borderTop:"1px solid #4dabf7",marginTop:8,paddingTop:6,display:"flex",justifyContent:"space-between",fontWeight:700,color:"#1971c2"}}>
                  <span>총합 ({Object.keys(parsed).length}일):</span>
                  <span className="mn">€{fmtE(Object.values(totals).reduce((a,b)=>a+b,0))}</span>
                </div>
              </div>
            ) : null}

            {/* 일별 미리보기 */}
            <div style={{maxHeight:200,overflowY:"auto",border:"1px solid #e0e0e0",borderRadius:6,padding:6,marginBottom:10,fontSize:11,fontFamily:"monospace"}}>
              {Object.keys(parsed).sort().map(date => {
                const d = parsed[date];
                const sum = Object.values(d).reduce((a,b)=>a+b,0);
                const existing = (data.sales||[]).find(s => s.date === date);
                return (
                  <div key={date} style={{
                    display:"flex",
                    justifyContent:"space-between",
                    padding:"3px 6px",
                    background: existing ? "rgba(255,212,0,.15)" : "transparent",
                    borderRadius:3
                  }}>
                    <span>{date} {existing ? "⚠️" : ""}</span>
                    <span>€{fmtE(sum)}</span>
                  </div>
                );
              })}
            </div>
            <div style={{fontSize:10,color:"#888",marginBottom:10}}>
              ⚠️ 표시 = 이미 매출이 있는 날짜
            </div>

            {/* 미분류 항목 경고 */}
            {unknown.length > 0 ? (
              <div style={{background:"rgba(255,212,0,.15)",border:"1px solid #ffd400",borderRadius:6,padding:8,marginBottom:10,fontSize:11}}>
                <strong style={{color:"#b8860b"}}>⚠️ 분류 불명확 ({unknown.length}건) — SUMUP 매출로 처리됨:</strong>
                <div style={{marginTop:4,maxHeight:60,overflowY:"auto"}}>
                  {unknown.map((u, i) => (
                    <div key={i} style={{color:"#666"}}>
                      {u.date} · "{u.desc}" · €{fmtE(u.amount)}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mf" style={{flexWrap:"wrap"}}>
              <button className="btn bs" onClick={()=>setParsed(null)}>← 다시</button>
              <button className="btn bs" onClick={close}>취소</button>
              <button className="btn bd sm" onClick={()=>doImport("overwrite")}>덮어쓰기</button>
              <button className="btn bp" onClick={()=>doImport("merge")}>합산 입력</button>
            </div>
          </>
        )}
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
  // 상태: "none"(미지급) | "ready"(준비완료) | "paid"(지급완료)
  const initStatus = existing
    ? (existing.status || (existing.paid ? "paid" : "none"))
    : "none";
  const [status, setStatus] = useState(initStatus);
  const [paidDate, setPaidDate] = useState(existing?.paidDate || todayStr());
  const [method, setMethod] = useState(existing?.method || "회사통장");
  const [amount, setAmount] = useState(existing?.amount || modal.defaultAmount || 0);
  const [memo, setMemo] = useState(existing?.memo || "");

  const save = async () => {
    const entry = {
      id: existing?.id || nid(data.payments||[]),
      staffId: modal.staffId,
      ym: modal.ym,
      status,
      paid: status === "paid", // 호환성 유지
      paidDate: status === "paid" ? paidDate : "",
      method: status === "paid" ? method : (status === "ready" ? method : ""),
      amount: parseFloat(amount) || 0,
      memo,
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
    const msgs = {none:"미지급으로 변경", ready:"📦 준비완료!", paid:"✅ 지급완료!"};
    toast(msgs[status]);
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
        <div style={{background:"#f5f5f7",borderRadius:7,padding:"10px 12px",fontSize:12,color:"#666",marginBottom:12}}>
          {(modal.adjustment || modal.settleNow != null || (modal.carryOut != null && Math.abs(modal.carryOut) > 0)) ? (
            <>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span>{modal.settleNow != null ? "확정 (명세서)" : "이번달 기본 급여"}</span>
                <strong className="mn" style={{color:"#1a1a1a"}}>€{fmtE(modal.settleNow != null ? (modal.defaultAmount || 0) : (modal.baseAmount || 0))}</strong>
              </div>
              {modal.adjustment ? (
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span>
                    지난달 {modal.adjustment.isAdd ? "추가지급" : "차감"}
                    {modal.adjustment.desc ? <span style={{fontSize:10,color:"#888",marginLeft:4}}>({modal.adjustment.desc})</span> : null}
                  </span>
                  <strong className="mn" style={{color: modal.adjustment.isAdd ? "#20a060" : "#e63946"}}>
                    {modal.adjustment.isAdd ? "+" : "-"}€{fmtE(modal.adjustment.amount)}
                  </strong>
                </div>
              ) : null}
              {modal.settleNow != null ? (
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span>이번달 실정산</span>
                  <strong className="mn" style={{color:"#1971c2"}}>€{fmtE(modal.settleNow)}</strong>
                </div>
              ) : null}
              {modal.carryOut != null && Math.abs(modal.carryOut) > 0 ? (
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span>다음달 이월 {modal.carryOut >= 0 ? "(차감)" : "(추가지급)"}</span>
                  <strong className="mn" style={{color: modal.carryOut >= 0 ? "#e63946" : "#20a060"}}>
                    {modal.carryOut >= 0 ? "-" : "+"}€{fmtE(Math.abs(modal.carryOut))}
                  </strong>
                </div>
              ) : null}
              <div style={{display:"flex",justifyContent:"space-between",paddingTop:5,marginTop:5,borderTop:"1.5px solid #d0d0d0"}}>
                <strong style={{color:"#1971c2"}}>최종 지급액</strong>
                <strong className="mn" style={{color:"#1971c2",fontSize:14}}>€{fmtE(modal.defaultAmount || 0)}</strong>
              </div>
            </>
          ) : (
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span>예상 급여</span>
              <strong style={{color:"#1971c2"}}>€{fmtE(modal.defaultAmount || 0)}</strong>
            </div>
          )}
        </div>

        {/* 3단계 상태 버튼 */}
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          <button
            className="btn"
            onClick={()=>setStatus("none")}
            style={{
              flex:1,
              background: status === "none" ? "#e63946" : "#f5f5f7",
              color: status === "none" ? "#fff" : "#888",
              border: status === "none" ? "none" : "1px solid #d0d0d0",
              padding:"9px",
              fontSize:11
            }}>
            ✗ 미지급
          </button>
          <button
            className="btn"
            onClick={()=>setStatus("ready")}
            style={{
              flex:1,
              background: status === "ready" ? "#f5c518" : "#f5f5f7",
              color: status === "ready" ? "#000" : "#888",
              border: status === "ready" ? "none" : "1px solid #d0d0d0",
              padding:"9px",
              fontSize:11
            }}>
            📦 준비완료
          </button>
          <button
            className="btn"
            onClick={()=>setStatus("paid")}
            style={{
              flex:1,
              background: status === "paid" ? "#2ed573" : "#f5f5f7",
              color: status === "paid" ? "#fff" : "#888",
              border: status === "paid" ? "none" : "1px solid #d0d0d0",
              padding:"9px",
              fontSize:11
            }}>
            ✓ 지급완료
          </button>
        </div>

        {/* 안내 문구 */}
        {status === "ready" ? (
          <div style={{fontSize:11,color:"#b8860b",background:"rgba(245,197,24,.12)",padding:"7px 9px",borderRadius:5,marginBottom:10}}>
            💡 직원에게 "준비완료"로 보입니다. 직원이 받았다고 표시할 수 있어요.
          </div>
        ) : null}

        {/* 지급 정보 입력 (준비완료 또는 지급완료) */}
        {status !== "none" ? (
          <>
            <div className="fr fc2">
              {status === "paid" ? (
                <div>
                  <label>지급일</label>
                  <input type="date" value={paidDate} onChange={e=>setPaidDate(e.target.value)} />
                </div>
              ) : null}
              <div>
                <label>{status === "paid" ? "지급 방법" : "지급 예정 방법"}</label>
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
                <label>{status === "paid" ? "실제 지급액 (€)" : "예정 금액 (€)"}</label>
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
              let paidCnt = 0, readyCnt = 0;
              rows.forEach(r => {
                const pay = (data.payments||[]).find(p => p.staffId===r.st.id && p.ym===salYM);
                if (!pay) return;
                const status = pay.status || (pay.paid ? "paid" : "none");
                if (status === "paid") paidCnt++;
                else if (status === "ready") readyCnt++;
              });
              return `✓${paidCnt}  📦${readyCnt}  /${rows.length}`;
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
                const status = pay ? (pay.status || (pay.paid ? "paid" : "none")) : "none";
                const paid = status === "paid";
                const ready = status === "ready";
                // 이번달 급여 레코드(확정/실근무) — 회계사 리포트
                const myRec = (data.payrollRecords||[]).find(p => p.staffId===r.st.id && p.ym===salYM);
                // 지난달 조정이 이번달에 반영될 carry-in (차감 음수 / 추가 양수)
                const ci = getCarryIn(data.payrollRecords, r.st.id, salYM);
                const adjustment = ci.rec;
                const isAdd = ci.isAdd;
                const adjAmt = Math.abs(ci.amount);
                // 명세서 확정값(있으면) 아니면 스케줄급여
                const baseConfirm = (myRec && myRec.amount != null) ? myRec.amount : r.pay;
                // 실근무 정산액(있으면) 아니면 스케줄급여 — 여기에 carry-in 반영
                const actualBase = (myRec && myRec.actualAmount != null) ? myRec.actualAmount : r.pay;
                const hasActual = myRec && myRec.actualAmount != null;
                const settleNow = actualBase + ci.amount; // 이번달 실정산
                // 표시 지급액: 확정값 기준(명세서대로 지급), 레코드 없으면 스케줄±carry-in
                const finalPay = myRec ? baseConfirm : (actualBase + ci.amount);
                const carryOut = (myRec && myRec.carryToNext != null) ? myRec.carryToNext : null;
                return (
                  <tr key={r.st.id}>
                    <td>
                      <span className="dot" style={{background:r.st.color}} />
                      <strong>{r.st.name}</strong>
                    </td>
                    <td className="mn" style={{color:paid?"#888":"#1971c2",fontWeight:600,textDecoration:paid?"line-through":"none"}}>
                      €{pay ? fmtE(pay.amount || finalPay) : fmtE(finalPay)}
                      {(hasActual || adjustment || carryOut != null) ? (
                        <div style={{fontSize:10,fontWeight:400,color:"#888",marginTop:2,lineHeight:1.6}}>
                          {hasActual ? (
                            <div>확정 <strong style={{color:"#4ecdc4"}}>€{fmtE(baseConfirm)}</strong> · 실정산 <strong style={{color:"#1971c2"}}>€{fmtE(settleNow)}</strong></div>
                          ) : adjustment ? (
                            <div>기본 €{fmtE(r.pay)} {isAdd ? "+" : "-"} €{fmtE(adjAmt)}
                              <span style={{color: isAdd ? "#20a060" : "#e63946", marginLeft:4, fontSize:9}}>{isAdd ? "(추가지급)" : "(차감)"}</span>
                            </div>
                          ) : null}
                          {adjustment ? (
                            <div>↪ 지난달 {isAdd?"추가":"차감"} {isAdd?"+":"-"}€{fmtE(adjAmt)} 반영</div>
                          ) : null}
                          {carryOut != null && Math.abs(carryOut) > 0 ? (
                            <div>↩ {nextYM(salYM)} 이월 <strong style={{color: carryOut>=0 ? "#e63946" : "#20a060"}}>{carryOut>=0 ? "-" : "+"}€{fmtE(Math.abs(carryOut))}</strong></div>
                          ) : null}
                        </div>
                      ) : null}
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
                      ) : ready ? (
                        <span className="badge bylw">📦 준비완료</span>
                      ) : (
                        <span className="badge bred">미지급</span>
                      )}
                    </td>
                    <td>
                      <button
                        className={"btn " + (paid ? "bs" : "bp") + " sm"}
                        onClick={()=>setModal({
                          type:"editPayment",
                          staffId:r.st.id,
                          ym:salYM,
                          defaultAmount:finalPay,
                          baseAmount: r.pay,
                          settleNow: hasActual ? settleNow : null,
                          carryOut,
                          adjustment: adjustment ? {
                            isAdd, amount: adjAmt, desc: adjustment.adjDesc
                          } : null
                        })}>
                        {paid ? "수정" : ready ? "지급완료로" : "지급체크"}
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
            <thead><tr><th>직원</th><th>월</th><th>확정급여</th><th>실근무</th><th>조정</th><th>반영월</th><th></th></tr></thead>
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
                    <td className="mn" style={{color:"#1971c2"}}>€{fmtE(p.amount)}</td>
                    <td className="mn" style={{color:"#888"}}>{p.actualAmount != null ? "€"+fmtE(p.actualAmount) : "—"}</td>
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
  const [salesYM, setSalesYM] = useState(curYM()); // 월별 필터
  const [editingSk, setEditingSk] = useState(null); // 슈킹 빠른 편집 {date, value}

  // 해당 월만 필터
  let sales = [...(data.sales||[])]
    .filter(s => s.date.startsWith(salesYM))
    .sort((a, b) => b.date.localeCompare(a.date));

  const T = {pc:0,pk:0,mc:0,mk:0,ac:0,ak:0,nc:0,nk:0,jc:0,jk:0,sk:0};
  sales.forEach(r => Object.keys(T).forEach(k => { T[k] += (r[k]||0); }));
  const tot = Object.values(T).reduce((a, b) => a + b, 0);
  const rT = r => (r.pc||0)+(r.pk||0)+(r.mc||0)+(r.mk||0)+(r.ac||0)+(r.ak||0)+(r.nc||0)+(r.nk||0)+(r.jc||0)+(r.jk||0)+(r.sk||0);
  const cell = v => v ? <span>{fmt(v)}</span> : <span style={{color:"#bbb"}}>-</span>;

  // 슈킹 빠른 입력 저장
  const saveSkuking = async (date, value) => {
    const amt = parseFloat(value) || 0;
    let newSales = [...(data.sales||[])];
    const existing = newSales.find(s => s.date === date);
    if (existing) {
      newSales = newSales.map(s => s.date === date ? {...s, sk: amt} : s);
    } else {
      newSales.push({
        id: nid(newSales),
        date, pc:0,pk:0,mc:0,mk:0,ac:0,ak:0,nc:0,nk:0,jc:0,jk:0,
        sk: amt
      });
    }
    await persist({...data, sales: newSales});
    setEditingSk(null);
  };

  // 월 이동
  const prevMonth = () => {
    const [y, m] = salesYM.split("-").map(Number);
    if (m === 1) setSalesYM(`${y-1}-12`);
    else setSalesYM(`${y}-${String(m-1).padStart(2,"0")}`);
  };
  const nextMonth = () => {
    const [y, m] = salesYM.split("-").map(Number);
    if (m === 12) setSalesYM(`${y+1}-01`);
    else setSalesYM(`${y}-${String(m+1).padStart(2,"0")}`);
  };

  return (
    <div>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
        <button className="btn bs sm" onClick={prevMonth}>◀</button>
        <input type="month" value={salesYM} onChange={e=>setSalesYM(e.target.value)} style={{width:155}} />
        <button className="btn bs sm" onClick={nextMonth}>▶</button>
        <button className="btn bp sm" onClick={()=>setModal({type:"addSales"})}>+ 직접입력</button>
        <button className="btn bg2 sm" onClick={()=>setModal({type:"csvImport"})}>📥 CSV 자동입력</button>
        <span style={{fontSize:11,color:"#888",marginLeft:4}}>{sales.length}건</span>
      </div>
      <div className="g4" style={{marginBottom:12}}>
        <div className="chip">
          <div className="lb">📷 사진관 매출</div>
          <div className="vl">{fmt(T.pc+T.pk+T.mc+T.mk+T.sk)}</div>
          <div className="sb">SUMUP+기계+슈킹</div>
        </div>
        <div className="chip">
          <div className="lb">💍 악세서리</div>
          <div className="vl">{fmt(T.ac+T.ak)}</div>
        </div>
        <div className="chip">
          <div className="lb">💅 네일</div>
          <div className="vl">{fmt(T.nc+T.nk)}</div>
        </div>
        <div className="chip">
          <div className="lb">💎 조이스보물</div>
          <div className="vl">{fmt(T.jc+T.jk)}</div>
        </div>
      </div>
      <div className="g3" style={{marginBottom:12}}>
        <div className="chip" style={{border:"1px solid #4dabf7"}}>
          <div className="lb">📋 부가세 대상 (슈킹 제외)</div>
          <div className="vl" style={{color:"#1971c2"}}>{fmt(T.pc+T.pk+T.mc+T.mk+T.ac+T.ak+T.nc+T.nk+T.jc+T.jk)}</div>
          <div className="sb">부가세: €{fmtE((T.pc+T.pk+T.mc+T.mk+T.ac+T.ak+T.nc+T.nk+T.jc+T.jk)*0.19)}</div>
        </div>
        <div className="chip">
          <div className="lb">🔒 슈킹</div>
          <div className="vl" style={{color:"#888"}}>{fmt(T.sk)}</div>
        </div>
        <div className="chip" style={{border:"1px solid #f5c518"}}>
          <div className="lb">전체 (슈킹 포함)</div>
          <div className="vl">{fmt(tot)}</div>
        </div>
      </div>
      <div className="card" style={{background:"rgba(255,212,0,.08)",border:"1px solid rgba(255,212,0,.4)",marginBottom:10}}>
        <div style={{fontSize:11,color:"#b8860b",fontWeight:600,marginBottom:6}}>
          🔒 슈킹 빠른 입력 — 표에서 슈킹 칸을 클릭해서 직접 입력하세요
        </div>
        <div style={{fontSize:10,color:"#888"}}>
          • 매출이 없는 날에도 슈킹만 입력 가능 · 입력 후 자동 저장
        </div>
      </div>
      <div className="card" style={{overflowX:"auto"}}>
        <table className="tbl">
          <thead>
            <tr>
              <th>날짜</th><th>💳현금</th><th>💳카드</th><th>🖨현금</th><th>🖨카드</th>
              <th>💍현금</th><th>💍카드</th><th>💅현금</th><th>💅카드</th>
              <th>💎현금</th><th>💎카드</th><th>🔒슈킹</th><th>합계</th><th></th>
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 ? (
              <tr><td colSpan={14} style={{textAlign:"center",color:"#888",padding:16}}>이 달 매출 없음</td></tr>
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
                  <td
                    className="mn"
                    style={{
                      color:"#b8860b",
                      fontSize:11,
                      background: editingSk?.date === r.date ? "rgba(255,212,0,.2)" : "rgba(255,212,0,.08)",
                      cursor:"pointer",
                      fontWeight:600
                    }}
                    onClick={()=>setEditingSk({date:r.date, value: r.sk || 0})}>
                    {editingSk?.date === r.date ? (
                      <input
                        type="number"
                        autoFocus
                        value={editingSk.value}
                        onChange={e=>setEditingSk({...editingSk, value:e.target.value})}
                        onBlur={()=>saveSkuking(r.date, editingSk.value)}
                        onKeyDown={e=>{
                          if (e.key === "Enter") saveSkuking(r.date, editingSk.value);
                          else if (e.key === "Escape") setEditingSk(null);
                        }}
                        style={{width:60,padding:"2px 4px",fontSize:11}}
                      />
                    ) : (r.sk ? fmt(r.sk) : <span style={{color:"#aaa"}}>+ 입력</span>)}
                  </td>
                  <td className="mn" style={{fontWeight:700,color:"#1971c2"}}>{fmt(rT(r))}</td>
                  <td>
                    <button className="btn bd sm" onClick={async()=>{
                      if(!confirm(r.date + " 매출 전체 삭제?")) return;
                      await persist({...data, sales:(data.sales||[]).filter(s=>s.id!==r.id)});
                    }}>삭제</button>
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

  // 그래프: 최근 12개월만 (간결하게)
  const get12Months = () => {
    const result = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      result.push(ym);
    }
    return result;
  };

  // 종합표: 최근 24개월 (2년치)
  const get24Months = () => {
    const result = [];
    const now = new Date();
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      result.push(ym);
    }
    return result;
  };

  // 차트용: 최근 12개월, 그래프에서 최신을 왼쪽으로 → reverse
  const chartMonths = get12Months().reverse(); // 최신 → 옛날
  const chartData = chartMonths.map(ym => calcMonthData(data, ym));
  const maxSales = Math.max(...chartData.map(m => m.sales), 1);
  const maxLabor = Math.max(...chartData.map(m => m.labor), 1);

  // 종합표용: 최근 24개월
  const tableMonths = get24Months();
  const tableData = tableMonths.map(ym => calcMonthData(data, ym));

  // 해당 월 상세
  const cur = calcMonthData(data, stYM);
  const prev = (() => {
    const [y, m] = stYM.split("-").map(Number);
    const pm = m === 1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,"0")}`;
    return calcMonthData(data, pm);
  })();

  // 전년 동월
  const prevYear = (() => {
    const [y, m] = stYM.split("-").map(Number);
    return calcMonthData(data, `${y-1}-${String(m).padStart(2,"0")}`);
  })();

  // 전년 동월 데이터가 존재하는지 (실제 매출/비용/historical 데이터가 있는지)
  const hasPrevYear = prevYear.sales > 0 || prevYear.expenses > 0 || prevYear.isHistorical;

  const diff = (curr, prv) => {
    if (prv === 0 || prv === undefined || prv === null) return null;
    const pct = ((curr - prv) / Math.abs(prv) * 100);
    return pct;
  };
  const diffAmt = (curr, prv) => curr - prv;

  const salesDiff = diff(cur.sales, prev.sales);
  const netDiff = diff(cur.net, prev.net);
  const expDiff = diff(cur.expenses, prev.expenses);
  const salesYDiff = hasPrevYear ? diff(cur.sales, prevYear.sales) : null;
  const netYDiff = hasPrevYear ? diff(cur.net, prevYear.net) : null;
  const expYDiff = hasPrevYear ? diff(cur.expenses, prevYear.expenses) : null;

  // 비교 박스 렌더링: 전월/전년 둘 다 보여줌
  const renderCompare = (curVal, prvVal, prvYearVal, isExpense) => {
    const items = [];
    // 전월
    if (prvVal !== undefined) {
      const d = diffAmt(curVal, prvVal);
      const pct = diff(curVal, prvVal);
      const good = isExpense ? d < 0 : d > 0;
      const color = Math.abs(d) < 1 ? "#888" : (good ? "#20a060" : "#e63946");
      const arrow = d > 1 ? "▲" : d < -1 ? "▼" : "—";
      items.push(
        <div key="prev" style={{fontSize:10,marginTop:2,lineHeight:1.4}}>
          <span style={{color:"#888"}}>전월: </span>
          <span style={{color}}>{arrow} {d >= 0 ? "+" : ""}€{fmtE(d)}</span>
          {pct !== null ? <span style={{color, marginLeft:4}}>({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)</span> : null}
        </div>
      );
    }
    // 전년
    if (prvYearVal !== undefined && hasPrevYear) {
      const d = diffAmt(curVal, prvYearVal);
      const pct = diff(curVal, prvYearVal);
      const good = isExpense ? d < 0 : d > 0;
      const color = Math.abs(d) < 1 ? "#888" : (good ? "#20a060" : "#e63946");
      const arrow = d > 1 ? "▲" : d < -1 ? "▼" : "—";
      items.push(
        <div key="prevYear" style={{fontSize:10,marginTop:2,lineHeight:1.4}}>
          <span style={{color:"#888"}}>전년: </span>
          <span style={{color}}>{arrow} {d >= 0 ? "+" : ""}€{fmtE(d)}</span>
          {pct !== null ? <span style={{color, marginLeft:4}}>({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)</span> : null}
        </div>
      );
    }
    return items;
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
              <div>{renderCompare(cur.sales, prev.sales, prevYear.sales, false)}</div>
            </div>
            <div className="chip" style={{border:"1.5px solid #e63946"}}>
              <div className="lb">📉 비용</div>
              <div className="vl" style={{color:"#e63946"}}>€{fmtE(cur.expenses)}</div>
              <div>{renderCompare(cur.expenses, prev.expenses, prevYear.expenses, true)}</div>
            </div>
            <div className="chip" style={{border: cur.net >= 0 ? "1.5px solid #20a060" : "1.5px solid #e63946"}}>
              <div className="lb">💰 순수익</div>
              <div className="vl" style={{color: cur.net >= 0 ? "#20a060" : "#e63946"}}>
                €{fmtE(cur.net)}
              </div>
              <div>{renderCompare(cur.net, prev.net, prevYear.net, false)}</div>
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

          {/* 월별 그래프 — 최근 12개월, 최신이 왼쪽 */}
          <div className="card" style={{marginBottom:12}}>
            <div className="ct">📊 월별 매출 / 순수익 (최근 12개월)</div>
            <div style={{overflowX:"auto"}}>
              <div style={{minWidth: 580, display:"flex", gap:6, alignItems:"flex-end", height:200, padding:"10px 0", borderBottom:"1px solid #e0e0e0"}}>
                {chartData.map(m => {
                  const salesH = (m.sales / maxSales) * 160;
                  const netH = (Math.abs(m.net) / maxSales) * 160;
                  const isCur = m.ym === stYM;
                  const netColor = m.net >= 0 ? "#20a060" : "#e63946";
                  return (
                    <div key={m.ym}
                      onClick={()=>setStYM(m.ym)}
                      style={{
                        flex:"1 0 42px",
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
              <div style={{display:"flex",gap:14,marginTop:8,fontSize:11,color:"#666",flexWrap:"wrap"}}>
                <span><span style={{display:"inline-block",width:10,height:10,background:"#4dabf7",borderRadius:2,marginRight:4}}></span>매출</span>
                <span><span style={{display:"inline-block",width:10,height:10,background:"#20a060",borderRadius:2,marginRight:4}}></span>순수익(흑자)</span>
                <span><span style={{display:"inline-block",width:10,height:10,background:"#e63946",borderRadius:2,marginRight:4}}></span>순수익(적자)</span>
                <span style={{color:"#888"}}>← 최신</span>
              </div>
            </div>
          </div>

          {/* 인건비 추이 — 최근 12개월, 최신이 왼쪽 */}
          <div className="card" style={{marginBottom:12}}>
            <div className="ct">👥 월별 인건비 추이 (최근 12개월)</div>
            <div style={{overflowX:"auto"}}>
              <div style={{minWidth: 580, display:"flex", gap:6, alignItems:"flex-end", height:130, padding:"8px 0", borderBottom:"1px solid #e0e0e0"}}>
                {chartData.map(m => {
                  const h = (m.labor / maxLabor) * 100;
                  const isCur = m.ym === stYM;
                  return (
                    <div key={m.ym}
                      onClick={()=>setStYM(m.ym)}
                      style={{flex:"1 0 42px",display:"flex",flexDirection:"column",alignItems:"center",cursor:"pointer"}}>
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
              <div style={{fontSize:10,color:"#888",marginTop:6}}>← 최신 (왼쪽이 최근달)</div>
            </div>
          </div>

          {/* 월별 데이터 표 — 최근 24개월 (2년) */}
          <div className="card">
            <div className="ct" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>📋 월별 종합표 (최근 2년)</span>
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
                  {[...tableData].reverse().map(m => {
                    const profit = m.sales - m.expenses;
                    const margin = m.sales > 0 ? (profit/m.sales*100).toFixed(1) : "0.0";
                    const isEmpty = m.sales === 0 && m.expenses === 0 && !m.isHistorical;
                    return (
                      <tr key={m.ym} style={{background: m.ym===stYM ? "#e7f5ff" : "transparent", opacity: isEmpty ? 0.4 : 1}}>
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
        // ─── 매출 상세 ───
        (() => {
          const sumup = sv("pc")+sv("pk");
          const machine = sv("mc")+sv("mk");
          const acc = sv("ac")+sv("ak");
          const nail = sv("nc")+sv("nk");
          const joys = sv("jc")+sv("jk");
          const sk = sv("sk");
          const photoStudio = sumup + machine + sk; // 진짜 사진관 매출
          const vatable = sumup + machine + acc + nail + joys; // 부가세 대상 (슈킹 제외)
          const all = vatable + sk;
          const vat = vatable * 0.19;
          const cash = sv("pc")+sv("mc")+sv("ac")+sv("nc")+sv("jc")+sk;
          const card = sv("pk")+sv("mk")+sv("ak")+sv("nk")+sv("jk");
          const cats = [
            {n:"💳 SUMUP 현금", v:sv("pc"), c:"#4dabf7"},
            {n:"💳 SUMUP 카드", v:sv("pk"), c:"#4dabf7"},
            {n:"🖨 기계 현금", v:sv("mc"), c:"#ffd700"},
            {n:"🖨 기계 카드", v:sv("mk"), c:"#ffd700"},
            {n:"💍 악세서리 현금", v:sv("ac"), c:"#ff6b35"},
            {n:"💍 악세서리 카드", v:sv("ak"), c:"#ff6b35"},
            {n:"💅 네일 현금", v:sv("nc"), c:"#ff4757"},
            {n:"💅 네일 카드", v:sv("nk"), c:"#ff4757"},
            {n:"💎 조이스 현금", v:sv("jc"), c:"#5352ed"},
            {n:"💎 조이스 카드", v:sv("jk"), c:"#5352ed"},
            {n:"🔒 슈킹", v:sv("sk"), c:"#888"}
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
              {/* 진짜 사진관 매출 */}
              <div className="card" style={{marginBottom:12, border:"1.5px solid #4dabf7"}}>
                <div className="ct" style={{color:"#1971c2"}}>📷 사진관 매출 (SUMUP + 기계 + 슈킹)</div>
                <div className="g3">
                  <div className="chip"><div className="lb">💳 SUMUP</div><div className="vl">{fmt(sumup)}</div></div>
                  <div className="chip"><div className="lb">🖨 기계</div><div className="vl">{fmt(machine)}</div></div>
                  <div className="chip"><div className="lb">🔒 슈킹</div><div className="vl" style={{color:"#888"}}>{fmt(sk)}</div></div>
                </div>
                <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #e0e0e0",display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:700}}>
                  <span>사진관 매출 합계</span>
                  <span className="mn" style={{color:"#1971c2"}}>€{fmtE(photoStudio)}</span>
                </div>
              </div>
              {/* 부가가치 상품 */}
              <div className="card" style={{marginBottom:12}}>
                <div className="ct">🛍️ 부가 상품 매출</div>
                <div className="g3">
                  <div className="chip"><div className="lb">💍 악세서리</div><div className="vl">{fmt(acc)}</div></div>
                  <div className="chip"><div className="lb">💅 네일</div><div className="vl">{fmt(nail)}</div></div>
                  <div className="chip"><div className="lb">💎 조이스보물</div><div className="vl">{fmt(joys)}</div></div>
                </div>
              </div>
              {/* 결제수단 */}
              <div className="g3" style={{marginBottom:10}}>
                <div className="chip"><div className="lb">💵 현금</div><div className="vl">{fmt(cash)}</div></div>
                <div className="chip"><div className="lb">💳 카드</div><div className="vl">{fmt(card)}</div></div>
                <div className="chip" style={{border:"1px solid #f5c518"}}><div className="lb">전체 (슈킹 포함)</div><div className="vl">{fmt(all)}</div><div className="sb">{monthSales.length}일</div></div>
              </div>
              {/* 부가세 / 신고 */}
              <div className="g2" style={{marginBottom:12}}>
                <div className="chip" style={{border:"1px solid #4dabf7"}}>
                  <div className="lb">📋 부가세 대상 (슈킹 제외)</div>
                  <div className="vl" style={{color:"#1971c2"}}>{fmt(vatable)}</div>
                  <div className="sb">SUMUP+기계+악세+네일+조이스</div>
                </div>
                <div className="chip" style={{border:"1px solid #e63946"}}>
                  <div className="lb">💸 부가세 (19%)</div>
                  <div className="vl" style={{color:"#e63946"}}>{fmt(vat)}</div>
                  <div className="sb">납부할 세금</div>
                </div>
              </div>
              <div className="card">
                <div className="ct">📊 카테고리별 상세</div>
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
        <ExpensesView data={data} stYM={stYM} setStYM={setStYM} setModal={setModal} persist={persist} />
      )}
    </div>
  );
}

// 지출 관리 뷰
function ExpensesView({ data, stYM, setStYM, setModal, persist }) {
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

  const handleDelete = async (x) => {
    if (!confirm(`삭제할까요?\n${x.date} ${x.category} €${fmtE(x.amount)}${x.memo ? " — "+x.memo : ""}`)) return;
    const nd = {...data, expenses: (data.expenses||[]).filter(e => e.id !== x.id)};
    await persist(nd);
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
                    <div style={{display:"flex",gap:4}}>
                      <button className="btn bs sm" onClick={()=>setModal({type:"expense", edit:x})}>수정</button>
                      <button className="btn sm" style={{background:"#fff5f5",color:"#e63946",border:"1px solid #fcc"}} onClick={()=>handleDelete(x)}>삭제</button>
                    </div>
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

      // URL ?admin=PIN 으로 관리자 직접 진입
      try {
        const params = new URLSearchParams(window.location.search);
        const adminPin = params.get("admin");
        if (adminPin && adminPin === p) {
          setMode("admin");
          // URL에서 PIN 제거 (보안 - 화면에 안 보이게)
          window.history.replaceState({}, "", window.location.pathname);
        }
      } catch(e) {}
    })();
  }, []);

  // 다른 사용자가 변경한 데이터를 주기적으로 가져옴 (실시간 동기화)
  // 단, 사용자가 입력 중이거나 모달이 열려있을 때는 폴링 정지
  useEffect(() => {
    const interval = setInterval(async () => {
      // 1. 저장 중 또는 방금 저장한 경우 (30초 이내)
      if (SAVING || (Date.now() - LAST_SAVE_AT < 30000)) return;
      // 2. 모달이 열려있을 때
      if (modal !== null) return;
      // 3. input/textarea/select/button에 포커스 있을 때
      const active = document.activeElement;
      if (active && (
        active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.tagName === "SELECT" ||
        active.tagName === "BUTTON"
      )) return;
      // 4. 페이지가 백그라운드일 때
      if (document.hidden) return;
      // 5. 사용자가 최근 30초 이내에 무언가 했으면 정지 (입력/클릭/스크롤)
      if (Date.now() - LAST_USER_INTERACTION < 30000) return;

      try {
        const d = await loadData();
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
    }, 60000); // 60초마다 체크 (그러나 위 조건들 때문에 실제 가져오는 건 더 드물게)
    return () => clearInterval(interval);
  }, [modal]);

  // 사용자 상호작용 추적 (마우스/키보드/스크롤/터치 모두)
  useEffect(() => {
    const update = () => { LAST_USER_INTERACTION = Date.now(); };
    window.addEventListener("click", update);
    window.addEventListener("touchstart", update);
    window.addEventListener("mousemove", update);
    window.addEventListener("keydown", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("input", update, true);
    return () => {
      window.removeEventListener("click", update);
      window.removeEventListener("touchstart", update);
      window.removeEventListener("mousemove", update);
      window.removeEventListener("keydown", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("input", update, true);
    };
  }, []);

  // 수동 새로고침 (다른 사람이 입력한 거 빨리 보고 싶을 때)
  const manualRefresh = useCallback(async () => {
    try {
      const d = await loadData();
      if (d) {
        LAST_SYNCED_JSON = JSON.stringify(d);
        setData(d);
        setStorageMode(STORAGE_MODE);
      }
      setToast("🔄 동기화 완료");
      setTimeout(() => setToast(""), 2000);
    } catch(e) {
      setToast("⚠️ 동기화 실패");
      setTimeout(() => setToast(""), 2000);
    }
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
      <div className="card" style={{marginTop:12,border:"1px solid rgba(77,171,247,.3)"}}>
        <div className="ct" style={{color:"#1971c2"}}>📋 체크리스트 & 매뉴얼</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <button
            className="btn bs"
            onClick={()=>setModal({type:"checklistManage"})}
            style={{padding:"12px",textAlign:"left",lineHeight:1.4}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>📋 체크리스트 편집</div>
            <div style={{fontSize:10,color:"#666"}}>
              {(data.checklists||[]).length}개 · 항목 {(data.checklists||[]).reduce((t,c)=>t+c.items.length,0)}개
            </div>
          </button>
          <button
            className="btn bs"
            onClick={()=>setModal({type:"manualSettings"})}
            style={{padding:"12px",textAlign:"left",lineHeight:1.4}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>📘 매뉴얼 링크</div>
            <div style={{fontSize:10,color:"#666"}}>
              {data.settings?.manualUrl ? "✓ 설정됨" : "미설정"}
            </div>
          </button>
        </div>
        <div style={{fontSize:10,color:"#888",padding:"6px 8px",background:"#f5f5f7",borderRadius:5}}>
          💡 매뉴얼은 Google Docs 등 외부 링크로 연결 (사진/영상 등 풍부한 자료)
        </div>
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
      await persist({
        ...data,
        shifts: (data.shifts||[]).filter(s => s.id !== id),
        cancellations: [...(data.cancellations||[]), cancelRecord]
      });
      showToast("취소 완료 — 사장님께 전달됨");
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
            <button className="btn bs sm" onClick={manualRefresh} title="새로고침">🔄</button>
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
                  <div key={s.id} className="sc" onClick={()=>{
                    if (s.pin) {
                      // PIN 설정된 경우 → PIN 입력 모달
                      setModal({type:"staffPin", staffId: s.id});
                    } else {
                      setSvSid(s.id);
                      setSvDate(todayStr());
                      setSvSel(null);
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
                      <div style={{fontSize:11,color:"#666",fontWeight:600,marginBottom:8}}>
                        💰 내 급여 (시급 €{fmtE(wage)}/h)
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
                                  await persist({...data, payments: newPayments});
                                  showToast("✅ 받음으로 표시!");
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

                        const doCheckIn = async () => {
                          const now = new Date();
                          const hh = String(now.getHours()).padStart(2,"0");
                          const mm = String(now.getMinutes()).padStart(2,"0");
                          const time = `${hh}:${mm}`;
                          const newShifts = (data.shifts||[]).map(sh =>
                            sh.id === s.id ? {...sh, actualStart: time} : sh
                          );
                          await persist({...data, shifts: newShifts});
                          showToast(`✅ 출근 완료 (${time})`);
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

                          const newShifts = (data.shifts||[]).map(sh =>
                            sh.id === s.id ? updatedShift : sh
                          );
                          await persist({...data, shifts: newShifts});
                          showToast(`✅ 퇴근 완료 (${time})`);
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
                              {!checkedIn ? (
                                <button
                                  className={"btn " + (isToday ? "bp" : "bs") + " sm"}
                                  onClick={doCheckIn}
                                  disabled={!isToday && !isPast}
                                  title={!isToday && !isPast ? "당일이나 지난 날만 가능" : ""}>
                                  🟢 출근
                                </button>
                              ) : !checkedOut ? (
                                <button className="btn bp sm" onClick={doCheckOut}>
                                  🔴 퇴근
                                </button>
                              ) : (
                                <span style={{fontSize:10,color:"#20a060",fontWeight:600}}>✓ 완료</span>
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

    if (modal.type === "staffPin") {
      const targetStaff = (data.staff||[]).find(s => s.id === modal.staffId);
      const doStaffPinInput = (d) => {
        if (pinBuf.length >= 4) return;
        const newBuf = pinBuf + d;
        setPinBuf(newBuf);
        setPinErr("");
        if (newBuf.length === 4) {
          if (targetStaff && newBuf === targetStaff.pin) {
            // 성공
            setSvSid(targetStaff.id);
            setSvDate(todayStr());
            setSvSel(null);
            closeModal();
            setPinBuf("");
          } else {
            setPinErr("PIN이 틀렸습니다");
            setTimeout(() => setPinBuf(""), 600);
          }
        }
      };
      return (
        <div className="ov" onClick={e => {
          if (e.target === e.currentTarget) {
            closeModal();
            setPinBuf("");
            setPinErr("");
          }
        }}>
          <div className="pb">
            <div className="sav" style={{background:targetStaff?.color || "#4dabf7", margin:"0 auto 8px"}}>
              {targetStaff?.name?.slice(0,1) || "?"}
            </div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>{targetStaff?.name} 님</div>
            <div style={{fontSize:12,color:"#888",marginBottom:18}}>PIN을 입력하세요</div>
            <div className="pds">
              {[0,1,2,3].map(i => (
                <div key={i} className={"pde" + (i < pinBuf.length ? " f" : "")} />
              ))}
            </div>
            {pinErr ? <div style={{color:"#e63946",fontSize:12,marginBottom:8}}>{pinErr}</div> : null}
            <div className="ppd">
              {[1,2,3,4,5,6,7,8,9].map(d => (
                <button key={d} className="pb2" onClick={()=>doStaffPinInput(String(d))}>{d}</button>
              ))}
              <button className="pb2" onClick={()=>doStaffPinInput("0")} style={{gridColumn:2}}>0</button>
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
                const hasActual = sh.actualStart || sh.actualEnd;
                const diff = timeDiff(sh);
                const flagged = needsAttention(sh);
                return (
                  <div key={sh.id} style={{
                    background: flagged ? "rgba(165, 94, 234, 0.1)" : "#f5f5f7",
                    border: flagged ? "1.5px solid #a55eea" : "1px solid transparent",
                    borderRadius:8,
                    padding:10,
                    marginBottom:7,
                    display:"flex",
                    justifyContent:"space-between",
                    alignItems:"center",
                    gap:8
                  }}>
                    <div style={{flex:1,minWidth:0}}>
                      <span className="dot" style={{background:st?.color||"#666"}} />
                      <strong>{st?.name||"?"}</strong>
                      <span className={"badge " + tCls} style={{marginLeft:5}}>{sh.slotType}</span>
                      {flagged ? <span style={{marginLeft:5,fontSize:10,color:"#7950f2",fontWeight:700}}>⏰ 확인필요</span> : null}
                      <div style={{fontSize:11,color:"#888",marginTop:2}}>
                        예정 {sh.start}~{sh.end} · {h}h · €{fmtE(h * (st?.wage || 0))}
                      </div>
                      {hasActual ? (
                        <div style={{fontSize:11,color: flagged ? "#7950f2" : "#666",marginTop:2,fontWeight: flagged ? 600 : 400}}>
                          ⏱️ 실제 {sh.actualStart || "?"}~{sh.actualEnd || "..."}
                          {diff !== null ? (
                            <span style={{marginLeft:6, color: diff > 0 ? "#20a060" : "#e63946", fontWeight:700}}>
                              ({diff > 0 ? "+" : ""}{Math.floor(Math.abs(diff)/60) > 0 ? Math.floor(Math.abs(diff)/60)+"h" : ""}{Math.abs(diff)%60 > 0 ? Math.abs(diff)%60+"분" : ""})
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {sh.memo ? <div style={{fontSize:10,color:"#888",marginTop:2,fontStyle:"italic"}}>📝 {sh.memo}</div> : null}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:3}}>
                      <button className="btn bs sm" onClick={()=>setModal({type:"editShift", shift: sh})}>수정</button>
                      <button className="btn bd sm" onClick={async()=>{
                        if(!confirm("삭제?")) return;
                        await persist({...data, shifts: (data.shifts||[]).filter(s => s.id !== sh.id)});
                        closeModal();
                        showToast("삭제");
                      }}>삭제</button>
                    </div>
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
    if (modal.type === "csvImport") return <CsvImportModal data={data} persist={persist} close={closeModal} toast={showToast} />;
    if (modal.type === "editShift") return <EditShiftModal modal={modal} data={data} persist={persist} close={closeModal} toast={showToast} gSt={gSt} />;
    if (modal.type === "checklistRun") return <ChecklistRunModal modal={modal} data={data} persist={persist} close={closeModal} toast={showToast} gSt={gSt} />;
    if (modal.type === "checklistManage") return <ChecklistManageModal data={data} persist={persist} close={closeModal} toast={showToast} />;
    if (modal.type === "manualSettings") return <ManualSettingsModal data={data} persist={persist} close={closeModal} toast={showToast} />;
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
              <span
                onClick={manualRefresh}
                title="클릭하면 즉시 동기화"
                style={{
                  fontSize:10,
                  padding:"3px 7px",
                  borderRadius:10,
                  background: storageMode==="shared" ? "rgba(46,213,115,.15)" : storageMode==="local" ? "rgba(255,71,87,.15)" : "rgba(255,255,255,.08)",
                  color: storageMode==="shared" ? "#2ed573" : storageMode==="local" ? "#ff4757" : "#aaa",
                  fontWeight:600,
                  cursor:"pointer"
                }}>
                {storageMode==="shared" ? "🟢" : storageMode==="local" ? "🔴" : "⚪"}
              </span>
              <button className="btn bs sm" onClick={manualRefresh} title="새로고침">🔄</button>
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
