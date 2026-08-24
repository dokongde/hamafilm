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
  LAST_SYNCED_JSON: "",
  BASELINE_JSON: "",     // 이 기기가 마지막으로 서버와 확인한 상태 (dirty 버킷 판정 + 3-way 병합 기준)
  LAST_SAVED_DATA: null, // 마지막 저장 성공 시 실제 서버로 간 데이터 (sales 병합 결과 포함)
  PENDING: false // 서버 전송 실패로 기기에만 보관된 변경이 있음 (연결 복구 시 자동 재전송)
};

// ===== 미전송 변경 보관 (저장 실패 시 유실 방지) =====
// 저장은 전체 스냅샷 단위라, 마지막 실패 스냅샷 하나만 보관하면 됨 (최신 의도가 항상 포함).
const PENDING_KEY = "hamafilm_pending_v1";
const PENDING_MAX_AGE = 2 * 3600 * 1000; // 2시간 지난 미전송본은 폐기 (다른 기기 최신 데이터를 옛날 것으로 덮지 않게)
function setPendingSnapshot(d) {
  GS.PENDING = true;
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ ts: Date.now(), data: d })); } catch (e) {}
}
function clearPendingSnapshot() {
  GS.PENDING = false;
  try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
}
function loadPendingSnapshot() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) { GS.PENDING = false; return null; }
    const p = JSON.parse(raw);
    if (!p || !p.data || !p.ts || (Date.now() - p.ts) > PENDING_MAX_AGE) {
      clearPendingSnapshot();
      return null;
    }
    GS.PENDING = true;
    return p.data;
  } catch (e) { return null; }
}

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
      GS.BASELINE_JSON = JSON.stringify(merged); // 서버와 맞춘 시점 기록 (이후 저장은 이 기준과 다른 버킷만 전송)
      return merged;
    }

    if (j && j.data) {
      // 옛날 단일 시트 형식 (호환성)
      try {
        const parsed = JSON.parse(j.data);
        const d = parsed[STORE_KEY] || null;
        if (d) GS.BASELINE_JSON = JSON.stringify(d);
        return d;
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

// 이 기기가 마지막으로 서버와 확인한 상태 (없으면 마지막 저장 성공본으로 폴백)
function getBaseline() {
  if (GS.BASELINE_JSON) {
    try { return JSON.parse(GS.BASELINE_JSON); } catch (e) {}
  }
  try {
    const r = localStorage.getItem(STORE_KEY);
    if (r) return JSON.parse(r);
  } catch (e) {}
  return null;
}

// 저장 직전 서버의 sales만 가볍게 가져오기 (병합용) — 실패 시 null
async function fetchServerSales() {
  try {
    const res = await fetch(GAS_URL, { method: "GET", redirect: "follow" });
    if (!res.ok) return null;
    const j = await res.json();
    if (j && j.multi && j.data && j.data.sales != null) {
      const parsed = JSON.parse(j.data.sales || "{}");
      const arr = Array.isArray(parsed) ? parsed : (parsed.sales || []);
      return Array.isArray(arr) ? arr : [];
    }
  } catch (e) {}
  return null;
}

// sales 3-way 병합 (로컬 / baseline / 서버) — 날짜가 키.
// 이 기기가 실제로 바꾼 행만 반영하고, 서버에만 있는 행(야간 자동입력 등)은 보존한다.
// - 이 기기가 안 건드린 행 → 서버 버전 승 (자동입력이 채운 kd/nx 등 유지)
// - 이 기기가 수정한 행 → 로컬 승, 단 로컬에 없는 필드(kd/nx/rc 등)는 서버에서 보충
// - 서버에만 있는 행 → baseline에도 없으면 신규(자동입력) → 보존 / baseline에 있으면 이 기기가 지운 것 → 삭제 반영
// - 로컬에만 있는 행 → baseline과 같으면 다른 기기가 지운 것 → 삭제 존중, 다르면 신규/수정 → 유지
function sameRow(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function mergeSales(localArr, baseArr, serverArr) {
  const L = new Map(), B = new Map(), S = new Map();
  (Array.isArray(localArr) ? localArr : []).forEach(r => { if (r && r.date) L.set(r.date, r); });
  (Array.isArray(baseArr) ? baseArr : []).forEach(r => { if (r && r.date) B.set(r.date, r); });
  (Array.isArray(serverArr) ? serverArr : []).forEach(r => { if (r && r.date) S.set(r.date, r); });
  const out = [];
  new Set([...L.keys(), ...S.keys()]).forEach(date => {
    const l = L.get(date), b = B.get(date), s = S.get(date);
    if (l && s) {
      if (b && sameRow(l, b)) out.push({ ...s });
      else { const m = { ...s, ...l }; if (s.id != null) m.id = s.id; out.push(m); }
    } else if (l && !s) {
      if (!(b && sameRow(l, b))) out.push({ ...l });
    } else if (!l && s) {
      if (!b) out.push({ ...s });
    }
  });
  out.sort((a, b2) => String(a.date).localeCompare(String(b2.date)));
  // id 중복/누락 정리 (기기 간 같은 id를 다른 날짜에 붙였을 수 있음)
  let maxId = 0;
  out.forEach(r => { const n = Number(r.id) || 0; if (n > maxId) maxId = n; });
  const seen = new Set();
  out.forEach(r => { const n = Number(r.id) || 0; if (!n || seen.has(n)) { maxId += 1; r.id = maxId; } else seen.add(n); });
  return out;
}

// 1회 전송 시도 — 성공 시 true, 실패 시 GS.LAST_ERROR 세팅 후 false
// ⚠️ 전체 덮어쓰기 금지: baseline 대비 바뀐 버킷만 전송한다.
//   (예전엔 매 저장마다 모든 버킷을 통째로 올려서, 오래 열려있던 기기가
//    저장하면 그 사이 자동입력된 매출 날짜들이 통째로 사라지는 사고가 반복됐음)
async function saveOnce(d){
  try {
    const baseline = getBaseline();
    const buckets = splitData(d);
    const baseBuckets = baseline ? splitData(baseline) : null;
    const dirty = {};
    Object.entries(buckets).forEach(([name, content]) => {
      if (!baseBuckets || JSON.stringify(baseBuckets[name]) !== JSON.stringify(content)) dirty[name] = content;
    });
    if (!Object.keys(dirty).length) { GS.LAST_SAVED_DATA = d; return true; } // 보낼 변경 없음
    // sales 버킷은 서버본과 3-way 병합 후 전송 (자동입력 행 보존 + 삭제 존중)
    let effective = d;
    if (dirty.sales) {
      const serverSales = await fetchServerSales();
      if (serverSales) {
        const merged = mergeSales(d.sales, baseline ? baseline.sales : null, serverSales);
        effective = { ...d, sales: merged };
        dirty.sales = { ...dirty.sales, sales: merged };
      }
    }
    const payload = { multi: true, buckets: {} };
    Object.entries(dirty).forEach(([name, content]) => {
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
          GS.LAST_SAVED_DATA = effective;
          GS.BASELINE_JSON = JSON.stringify(effective);
          return true;
        }
        GS.LAST_ERROR = "서버 거부: " + txt.slice(0, 100);
      } catch(e) {
        GS.LAST_ERROR = "응답 파싱 실패: " + txt.slice(0, 100);
      }
    } else {
      GS.LAST_ERROR = "HTTP " + res.status;
    }
  } catch(e) {
    GS.LAST_ERROR = e.message || String(e);
    console.error("GAS save error", e);
  }
  return false;
}

async function saveData(d){
  GS.SAVING = true;
  try {
    // 일시적 버벅임(GAS 콜드스타트·와이파이 출렁임) 대비 자동 재시도: 즉시 → 1초 → 2.5초
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, attempt === 1 ? 1000 : 2500));
      if (await saveOnce(d)) {
        GS.STORAGE_MODE = "shared";
        GS.LAST_ERROR = "";
        GS.LAST_SAVE_AT = Date.now();
        clearPendingSnapshot();
        // STORE_KEY = 마지막 서버 확인본 (sales 병합 결과 포함) — 오프라인 폴백 + baseline 폴백 겸용
        try { localStorage.setItem(STORE_KEY, JSON.stringify(GS.LAST_SAVED_DATA || d)); } catch(e) {}
        return true;
      }
    }
  } finally {
    GS.SAVING = false;
  }
  // 최종 실패 → 미전송 스냅샷으로만 보관 (연결 복구 시 자동 재전송, 유실 없음)
  // ⚠️ STORE_KEY는 덮지 않는다 — STORE_KEY는 "서버와 확인된 상태"여야 baseline 폴백이 정확함.
  GS.STORAGE_MODE = "local";
  setPendingSnapshot(d);
  return false;
}

// 미전송 스냅샷 재전송 시도 — 성공하면 true (pending 해제됨)
async function flushPending(){
  if (GS.SAVING) return false;
  const pending = loadPendingSnapshot();
  if (!pending) return false;
  return await saveData(pending);
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

export { DEFAULT_PIN, STORE_KEY, PIN_KEY, SESSION_KEY, DEFAULT_DATA, GAS_URL, saveSession, clearSession, loadSession, notifyLoginEvent, GS, BUCKETS, KEY_TO_BUCKET, splitData, loadData, saveData, fetchAll, loadPin, savePin, flushPending, loadPendingSnapshot };
