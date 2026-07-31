const DEFAULT_PIN = "1234";
const STORE_KEY = "hamafilm_v2";
const PIN_KEY = "hamafilm_pin_v2";
const SESSION_KEY = "hamafilm_session_v1"; // 직원 로그인 유지 — 이 기기에서 마지막 로그인한 직원 (관리자는 보안상 저장 안 함)

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

// ===== 직원 로그인 세션 (localStorage — 기기별) =====
function saveSession(staffId) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ staffId })); } catch (e) {}
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
}
function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return (s && s.staffId != null) ? s : null;
  } catch (e) { return null; }
}

// 관리자 폰 로그인/로그아웃 푸시 — 사장님 요청으로 비활성화 (출퇴근·월급 알림만 사용).
// 다시 켜려면 아래 return을 지우면 됨 (GAS의 loginEvent 처리는 그대로 살아 있음).
function notifyLoginEvent(staffId, staffName, type) {
  return;
  try {
    const now = new Date();
    const time = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({
        pushAction: "loginEvent",
        staffId, staffName: staffName || "", type, time
      }),
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow"
    }).catch(() => {});
  } catch (e) { /* 무시 */ }
}

// 저장/동기화 상태 (모듈 전역 — App과 공유되는 mutable 상태라 객체로 묶음)
const GS = {
  STORAGE_MODE: "loading",
  LAST_ERROR: "",
  SAVING: false,
  LAST_SAVE_AT: 0,
  LAST_USER_INTERACTION: 0,
  LAST_SYNCED_JSON: ""
};

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
    GS.STORAGE_MODE = "shared";
    GS.LAST_ERROR = "";

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
    GS.LAST_ERROR = e.message || String(e);
    console.error("GAS load error", e);
  }
  // 로컬 폴백
  try {
    GS.STORAGE_MODE = "local";
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
  GS.SAVING = true;
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
          GS.STORAGE_MODE = "shared";
          GS.LAST_ERROR = "";
          GS.LAST_SAVE_AT = Date.now();
          try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch(e) {}
          return true;
        }
      } catch(e) {
        GS.LAST_ERROR = "응답 파싱 실패: " + txt.slice(0, 100);
      }
    } else {
      GS.LAST_ERROR = "HTTP " + res.status;
    }
  } catch(e) {
    GS.LAST_ERROR = e.message || String(e);
    console.error("GAS save error", e);
  } finally {
    GS.SAVING = false;
  }
  // 로컬 폴백
  try {
    GS.STORAGE_MODE = "local";
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

export { DEFAULT_PIN, STORE_KEY, PIN_KEY, SESSION_KEY, DEFAULT_DATA, GAS_URL, saveSession, clearSession, loadSession, notifyLoginEvent, GS, BUCKETS, KEY_TO_BUCKET, splitData, loadData, saveData, fetchAll, loadPin, savePin };
