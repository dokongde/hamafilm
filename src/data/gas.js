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
  BASELINE_JSON: "",     // 이 기기가 마지막으로 서버와 맞춘 상태 (보낼 변경 = CURRENT − BASELINE)
  CURRENT: null,         // 이 기기의 최신 데이터 (화면에 보이는 것과 같은 객체)
  DIRTY: false,          // 아직 서버로 안 보낸 변경이 있음
  SAVE_PROMISE: null,    // 진행 중인 저장 (저장은 한 번에 하나씩)
  LAST_SAVED_DATA: null, // 호환용
  PENDING: false         // 서버 전송 실패로 기기에만 보관된 변경이 있음 (연결 복구 시 자동 재전송)
};

// ===== 미전송 변경 보관 (저장 실패 시 유실 방지) =====
// 데이터와 함께 "그 데이터가 출발한 기준(base)"도 저장 → 나중에 보내도 바뀐 것만 정확히 합쳐짐.
const PENDING_KEY = "hamafilm_pending_v1";
const PENDING_MAX_AGE = 7 * 24 * 3600 * 1000; // 바뀐 것만 합치므로 오래돼도 안전 — 7일까지 보관
function setPendingSnapshot(d, baseJson) {
  GS.PENDING = true;
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ ts: Date.now(), data: d, base: baseJson || "" })); } catch (e) {}
}
function clearPendingSnapshot() {
  GS.PENDING = false;
  try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
}
function loadPendingRecord() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) { GS.PENDING = false; return null; }
    const p = JSON.parse(raw);
    if (!p || !p.data || !p.ts || (Date.now() - p.ts) > PENDING_MAX_AGE) {
      clearPendingSnapshot();
      return null;
    }
    GS.PENDING = true;
    return p;
  } catch (e) { return null; }
}
// 앱 시작 시: 미전송 변경이 있으면 그걸 화면 데이터로 쓰고 기준도 복원
function loadPendingSnapshot() {
  const p = loadPendingRecord();
  if (!p) return null;
  let base = p.base;
  if (!base) { try { base = localStorage.getItem(STORE_KEY) || ""; } catch (e) { base = ""; } } // 옛 형식: 마지막 서버 확인본
  if (base) GS.BASELINE_JSON = base;
  GS.CURRENT = p.data;
  GS.DIRTY = true;
  return p.data;
}

// ===== 다중 시트 분산 저장 =====
// 각 데이터 종류를 별도 시트에 저장하여 50KB 한계 회피
const BUCKETS = {
  // 자주 변경 + 핵심 (기본 시트)
  data: ["staff", "fixed", "vacations", "checklists", "settings", "historicalData", "payrollRecords"],
  // 큰 데이터들은 별도 시트로
  shifts: ["shifts"],
  sales: ["sales"],
  completions: ["completions"],
  expenses: ["expenses"],
  payments: ["payments"],
  cancellations: ["cancellations"],
  inventory: ["inventory"],
  stockMoves: ["stockMoves"]
};

// 데이터 키 → 시트 이름 역매핑
const KEY_TO_BUCKET = {};
Object.entries(BUCKETS).forEach(([bucket, keys]) => {
  keys.forEach(k => { KEY_TO_BUCKET[k] = bucket; });
});

// 응답이 오래 안 오면 끊고 재시도 (GAS가 가끔 수십 초 걸림 — 무한 대기 방지)
async function fetchT(url, opts, ms) {
  const c = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = c ? setTimeout(() => c.abort(), ms) : null;
  try { return await fetch(url, c ? { ...(opts || {}), signal: c.signal } : (opts || {})); }
  finally { if (t) clearTimeout(t); }
}

// 서버 응답(j.data: 버킷→JSON 문자열)을 앱 데이터 객체로. 한 버킷이라도 깨져 있으면 null (빈 걸로 착각하지 않게)
function bucketsToData(bucketStrs) {
  const merged = {};
  for (const [bucket, jsonStr] of Object.entries(bucketStrs || {})) {
    if (!jsonStr) continue;
    let parsed;
    try { parsed = JSON.parse(jsonStr); } catch (e) { console.warn("parse fail", bucket, e); return null; }
    if (parsed && parsed[STORE_KEY]) Object.assign(merged, parsed[STORE_KEY]); // 옛 형식
    else Object.assign(merged, parsed);
  }
  return merged;
}
function fillDefaults(merged) {
  if (merged[PIN_KEY]) { try { localStorage.setItem(PIN_KEY, merged[PIN_KEY]); } catch (e) {} }
  ["staff","shifts","fixed","vacations","sales","payrollRecords","payments","expenses","historicalData","cancellations","checklists","completions","inventory","stockMoves"].forEach(k => {
    if (!merged[k]) merged[k] = [];
  });
  if (!merged.settings) merged.settings = {};
  return merged;
}

// opts.fallback: 실패 시 기기에 남은 마지막 서버본을 돌려줌 (앱 첫 실행용). 주기적 동기화에선 false → 실패하면 null(화면 유지)
async function loadData(opts){
  const fallback = !opts || opts.fallback !== false;
  try {
    const res = await fetchT(GAS_URL, { method: "GET", redirect: "follow" }, 30000);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    let merged = null;
    if (j && j.multi && j.data) merged = bucketsToData(j.data);
    else if (j && j.data) { try { const parsed = JSON.parse(j.data); merged = parsed[STORE_KEY] || null; } catch (e) {} }
    if (!merged) throw new Error("데이터 형식 오류");
    fillDefaults(merged);
    GS.STORAGE_MODE = GS.PENDING ? "local" : "shared";
    GS.LAST_ERROR = "";
    GS.BASELINE_JSON = JSON.stringify(merged);
    GS.CURRENT = merged;
    GS.DIRTY = false;
    try { localStorage.setItem(STORE_KEY, GS.BASELINE_JSON); } catch (e) {}
    return merged;
  } catch(e) {
    GS.LAST_ERROR = e.message || String(e);
    console.error("GAS load error", e);
  }
  if (!fallback) return null;
  // 로컬 폴백 (앱 첫 실행 때 오프라인)
  try {
    GS.STORAGE_MODE = "local";
    const r = localStorage.getItem(STORE_KEY);
    if (r) { const d = JSON.parse(r); GS.BASELINE_JSON = r; GS.CURRENT = d; return d; }
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

// ===== 레코드 단위 병합 (2026-10-07) =====
// 예전엔 버킷(예: 시프트 전체)을 통째로 올려서, 여러 기기가 동시에 쓰면 나중에 저장한 쪽이 앞사람 입력을 지웠음.
// 이제 "바뀐 레코드·필드만" 보내고 서버(GAS applyMerge_)가 현재 내용에 합친다. 서버와 같은 규칙을 앱에도 둬서
// 저장 도중 새로 입력한 것도 서버 결과 위에 다시 얹을 수 있게 한다(rebase).
const LIST_KEY = { sales: "date", inventory: "sku" }; // 나머지 배열은 id
function keyFieldOf(k) { return LIST_KEY[k] || "id"; }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function listUsable(arr, key) {
  if (!Array.isArray(arr)) return false;
  const seen = new Set();
  for (const r of arr) {
    if (!r || typeof r !== "object" || r[key] == null) return false;
    const k = String(r[key]);
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}
function diffList(local, base, key) {
  const L = new Map(local.map(r => [String(r[key]), r]));
  const B = new Map(base.map(r => [String(r[key]), r]));
  const add = [], patch = [], del = [];
  for (const [k, r] of L) {
    const b = B.get(k);
    if (!b) { add.push(r); continue; }
    if (same(r, b)) continue;
    const set = {}, unset = [];
    for (const f of Object.keys(r)) if (!same(r[f], b[f])) set[f] = r[f];
    for (const f of Object.keys(b)) if (!(f in r)) unset.push(f);
    patch.push({ k: r[key], set, unset });
  }
  for (const [k, b] of B) if (!L.has(k)) del.push(b[key]);
  if (!add.length && !patch.length && !del.length) return null;
  return { t: "list", key, add, patch, del };
}
function diffObj(local, base) {
  const set = {}, unset = [];
  for (const f of Object.keys(local)) if (!same(local[f], base[f])) set[f] = local[f];
  for (const f of Object.keys(base)) if (!(f in local)) unset.push(f);
  if (!Object.keys(set).length && !unset.length) return null;
  return { t: "obj", set, unset };
}
// local과 base의 차이 → { 버킷: { 키: op } }
function buildMergeOps(local, base) {
  const lb = splitData(local), bb = splitData(base || {});
  const ops = {};
  for (const [bucket, content] of Object.entries(lb)) {
    const bcontent = bb[bucket] || {};
    for (const k of Object.keys(content)) {
      const lv = content[k], bv = bcontent[k];
      if (same(lv, bv)) continue;
      let op;
      if (Array.isArray(lv)) {
        const key = keyFieldOf(k);
        op = (Array.isArray(bv) && listUsable(lv, key) && listUsable(bv, key)) ? diffList(lv, bv, key) : { t: "replace", v: lv };
      } else if (lv && typeof lv === "object") {
        op = diffObj(lv, (bv && typeof bv === "object" && !Array.isArray(bv)) ? bv : {});
      } else {
        op = { t: "replace", v: lv };
      }
      if (op) { (ops[bucket] = ops[bucket] || {})[k] = op; }
    }
  }
  return ops;
}
// 서버 mergeList_ 와 같은 규칙 (앱에서 rebase할 때 사용)
function mergeListLocal(arr, op) {
  arr = arr.map(r => (r && typeof r === "object") ? { ...r } : r);
  const key = op.key || "id";
  const idx = {};
  arr.forEach((r, i) => { if (r && r[key] != null) idx[String(r[key])] = i; });
  (op.patch || []).forEach(p => {
    const i = idx[String(p.k)];
    if (i === undefined) return;
    const r = arr[i];
    Object.keys(p.set || {}).forEach(f => { r[f] = p.set[f]; });
    (p.unset || []).forEach(f => { delete r[f]; });
  });
  let maxId = 0;
  if (key === "id") arr.forEach(r => { const n = Number(r && r.id) || 0; if (n > maxId) maxId = n; });
  (op.add || []).forEach(r => {
    if (!r || typeof r !== "object") return;
    const k = String(r[key]);
    if (idx[k] !== undefined) {
      if (same(arr[idx[k]], r)) return;
      if (key === "id") { maxId += 1; const copy = { ...r, id: maxId }; arr.push(copy); idx[String(copy.id)] = arr.length - 1; }
      else { Object.assign(arr[idx[k]], r); }
      return;
    }
    arr.push({ ...r }); idx[k] = arr.length - 1;
    if (key === "id") { const n = Number(r.id) || 0; if (n > maxId) maxId = n; }
  });
  const del = new Set((op.del || []).map(String));
  return arr.filter(r => !(r && del.has(String(r[key]))));
}
function applyOpsLocal(data, ops) {
  const out = { ...data };
  for (const bucketOps of Object.values(ops || {})) {
    for (const [k, op] of Object.entries(bucketOps)) {
      if (op.t === "replace") out[k] = op.v;
      else if (op.t === "obj") {
        const o = { ...((out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) ? out[k] : {}) };
        Object.keys(op.set || {}).forEach(f => { o[f] = op.set[f]; });
        (op.unset || []).forEach(f => { delete o[f]; });
        out[k] = o;
      } else if (op.t === "list") out[k] = mergeListLocal(Array.isArray(out[k]) ? out[k] : [], op);
    }
  }
  return out;
}

// 화면에서 생긴 변경(nd = prev를 고친 것)을 이 기기의 최신 데이터(GS.CURRENT)에 반영하고 그 결과를 돌려줌.
// 보통은 nd 그대로지만, 저장 도중 서버 결과가 들어와 CURRENT가 바뀌었으면 "고친 부분만" 얹는다.
function applyLocalEdit(prev, nd) {
  if (!GS.CURRENT || GS.CURRENT === prev) GS.CURRENT = nd;
  else GS.CURRENT = applyOpsLocal(GS.CURRENT, buildMergeOps(nd, prev));
  GS.DIRTY = true;
  return GS.CURRENT;
}

function newOpId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
async function postMerge(ops, opId) {
  try {
    const res = await fetchT(GAS_URL, {
      method: "POST",
      body: JSON.stringify({ merge: ops, opId }),
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow"
    }, 45000);
    if (!res.ok) { GS.LAST_ERROR = "HTTP " + res.status; return null; }
    const txt = await res.text();
    let j;
    try { j = JSON.parse(txt); } catch (e) { GS.LAST_ERROR = "응답 파싱 실패: " + txt.slice(0, 100); return null; }
    if (!j.ok || !j.merged) { GS.LAST_ERROR = "서버 거부: " + (j.error || txt.slice(0, 100)); return null; }
    return j;
  } catch (e) {
    GS.LAST_ERROR = e.message || String(e);
    return null;
  }
}

// 저장: GS.CURRENT와 기준(BASELINE)의 차이만 서버로 보내 합친다. 한 번에 하나씩, 도중 변경은 이어서 보냄.
// 반환 true = 전부 서버 반영 / false = 기기에 보관(연결되면 자동 재전송)
async function saveData(d) {
  if (d) { GS.CURRENT = d; GS.DIRTY = true; }
  if (GS.SAVE_PROMISE) return GS.SAVE_PROMISE;
  GS.SAVE_PROMISE = (async () => {
    GS.SAVING = true;
    let ok = true;
    try {
      while (GS.DIRTY) {
        GS.DIRTY = false;
        const sent = GS.CURRENT;
        const base = getBaseline();
        if (!base) { ok = false; GS.LAST_ERROR = "서버 기준 데이터 없음 — 새로고침 필요"; break; }
        const ops = buildMergeOps(sent, base);
        if (!Object.keys(ops).length) continue;
        const opId = newOpId();
        let res = null;
        // 재시도: 즉시 → 1초 → 2.5초 (opId가 같아서 서버가 두 번 적용하지 않음)
        for (let attempt = 0; attempt < 3 && !res; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, attempt === 1 ? 1000 : 2500));
          res = await postMerge(ops, opId);
        }
        if (!res) { ok = false; GS.DIRTY = true; break; }
        // 서버가 합친 결과(다른 기기 입력 포함)로 해당 버킷 교체
        const serverPart = bucketsToData(res.merged);
        if (!serverPart) { ok = false; GS.DIRTY = true; GS.LAST_ERROR = "서버 응답 형식 오류"; break; }
        const merged = fillDefaults({ ...sent, ...serverPart });
        GS.BASELINE_JSON = JSON.stringify(merged);
        try { localStorage.setItem(STORE_KEY, GS.BASELINE_JSON); } catch (e) {}
        if (GS.CURRENT === sent) {
          GS.CURRENT = merged;
        } else {
          // 저장하는 동안 새로 입력한 게 있음 → 그 부분만 서버 결과 위에 다시 얹고 한 번 더 보냄
          GS.CURRENT = applyOpsLocal(merged, buildMergeOps(GS.CURRENT, sent));
          GS.DIRTY = true;
        }
      }
    } catch (e) {
      ok = false; GS.DIRTY = true; GS.LAST_ERROR = e.message || String(e);
    } finally {
      GS.SAVING = false;
      GS.SAVE_PROMISE = null;
    }
    if (ok) {
      GS.STORAGE_MODE = "shared";
      GS.LAST_ERROR = "";
      GS.LAST_SAVE_AT = Date.now();
      GS.LAST_SAVED_DATA = GS.CURRENT;
      clearPendingSnapshot();
      return true;
    }
    GS.STORAGE_MODE = "local";
    setPendingSnapshot(GS.CURRENT, GS.BASELINE_JSON);
    return false;
  })();
  return GS.SAVE_PROMISE;
}

// 미전송 변경 재전송 시도 — 성공하면 true (GS.CURRENT가 서버와 합쳐진 최신)
async function flushPending(){
  if (GS.SAVING) return false;
  if (!GS.DIRTY) {
    const p = loadPendingRecord();
    if (!p) return true;
    if (p.base) GS.BASELINE_JSON = p.base;
    if (!GS.CURRENT) GS.CURRENT = p.data;
    GS.DIRTY = true;
  }
  return await saveData();
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
  // 못 찾으면 서버의 data 버킷만 읽기 (전체 loadData는 화면 기준을 바꾸므로 쓰지 않음)
  try {
    const res = await fetchT(GAS_URL + "?bucket=data", { method: "GET", redirect: "follow" }, 30000);
    const j = await res.json();
    const d = j && j.data ? JSON.parse(j.data) : null;
    const pin = d && (d[PIN_KEY] || (d[STORE_KEY] && d[STORE_KEY][PIN_KEY]));
    if (pin) { try { localStorage.setItem(PIN_KEY, pin); } catch (e) {} return pin; }
  } catch(e) {}
  return DEFAULT_PIN;
}

async function savePin(p){
  // PIN만 병합 저장 (예전엔 모든 시트를 통째로 다시 써서 다른 사람 입력을 지울 수 있었음)
  try { localStorage.setItem(PIN_KEY, p); } catch(e) {}
  try {
    await postMerge({ data: { [PIN_KEY]: { t: "replace", v: p } } }, newOpId());
  } catch(e) {}
}

export { DEFAULT_PIN, STORE_KEY, PIN_KEY, SESSION_KEY, DEFAULT_DATA, GAS_URL, saveSession, clearSession, loadSession, notifyLoginEvent, GS, BUCKETS, KEY_TO_BUCKET, splitData, loadData, saveData, fetchAll, loadPin, savePin, flushPending, loadPendingSnapshot, applyLocalEdit, buildMergeOps, applyOpsLocal };
