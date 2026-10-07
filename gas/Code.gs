// ===========================================
// HAMAFILM 백엔드 — 다중 시트 자동 분산
// ===========================================
//
// 시트 구조:
//   [data]         — 핵심 (직원, 설정, 체크리스트 템플릿, PIN, 휴가, 고정스케줄)
//   [shifts]       — 스케줄 (큰 데이터)
//   [sales]        — 매출
//   [completions]  — 체크리스트 완료 기록
//   [expenses]     — 지출 기록
//   [payments]     — 급여 지급 기록
//   [cancellations]— 취소 기록
//   [payrollRecs]  — 회계사 리포트
//
// 각 시트의 A열에 JSON 문자열 저장.
// 구글 시트는 셀 하나에 50,000자까지만 저장됨 → 긴 JSON은 A1, A2, A3… 로 나눠 저장하고
// 읽을 때 이어 붙인다 (2026-09-02: shifts가 50,000자를 넘어 저장이 전부 실패했던 사고 수정).
// 이 파일은 Apps Script 편집기(시트 바운드 프로젝트)의 Code.gs 와 동일하게 유지할 것.

const SHEET_ID = '1IQM_WFcTPZL48F4Ir17VhMy14yxa9lEj2ViIjmnvh9k';
const BUCKETS = ['data', 'shifts', 'sales', 'completions', 'expenses', 'payments', 'cancellations', 'payrollRecs', 'inventory', 'stockMoves'];
const CHUNK = 40000; // 셀당 저장 글자수 (한계 50,000보다 여유 있게)

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

// 긴 문자열을 A1, A2, A3… 에 나눠 저장
function writeBucket(sheet, value) {
  const s = (value == null) ? '' : String(value);
  const parts = [];
  let i = 0;
  while (i < s.length) {
    let end = Math.min(i + CHUNK, s.length);
    if (end < s.length) {
      // 이모지 등 서로게이트 쌍 중간에서 자르지 않기
      const hi = s.charCodeAt(end - 1);
      if (hi >= 0xD800 && hi <= 0xDBFF) end--;
      // 다음 조각이 = + - ' 로 시작하면 시트가 수식/숫자로 오해할 수 있어 경계를 당김
      while (end > i + 1 && /[=+'-]/.test(s.charAt(end))) end--;
    }
    parts.push([s.slice(i, end)]);
    i = end;
  }
  if (!parts.length) parts.push(['']);
  // 한 번의 setValues로 쓰기 (지우기→쓰기 두 단계면 그 사이 읽는 기기가 빈 데이터를 볼 수 있음).
  // 예전보다 조각 수가 줄면 남는 아래 칸은 '' 로 같이 덮어 비운다.
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const n = Math.max(lastRow, parts.length);
  while (parts.length < n) parts.push(['']);
  const target = sheet.getRange(1, 1, n, 1);
  target.setNumberFormat('@');
  target.setValues(parts);
  SpreadsheetApp.flush();
}

// ===== 레코드 단위 병합 저장 (2026-10-07) =====
// 여러 기기가 동시에 저장해도 서로 덮어쓰지 않도록, 앱은 "바뀐 것만" 보내고 서버가 현재 내용에 합친다.
// body.merge = { 버킷이름: { 키이름: op } }
//   op.t === 'list'    : 배열 레코드 단위 — {key:'id'|'date'|'sku', add:[레코드], patch:[{k, set:{}, unset:[]}], del:[k]}
//   op.t === 'obj'     : 객체 필드 단위 — {set:{}, unset:[]}
//   op.t === 'replace' : 통째로 교체 — {v}
// 반환: { ok:true, merged: { 버킷이름: '합친 뒤 JSON 문자열' } }
function applyMerge_(merge, opId) {
  const out = {};
  // 같은 저장이 재전송된 경우(응답이 늦어 앱이 다시 보냄) 두 번 적용하지 않음 — 현재 내용만 돌려줌
  const cache = CacheService.getScriptCache();
  if (opId && cache.get('op_' + opId)) {
    Object.keys(merge || {}).forEach(function (b) { out[b] = readBucket(getSheet(b)) || '{}'; });
    return { ok: true, merged: out, dup: true };
  }
  Object.keys(merge || {}).forEach(function (b) {
    const sheet = getSheet(b);
    const raw = readBucket(sheet);
    let cur = {};
    if (raw) {
      try { cur = JSON.parse(raw); } catch (err) { throw new Error('bucket parse fail: ' + b); }
    }
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) cur = {};
    const ops = merge[b] || {};
    Object.keys(ops).forEach(function (k) {
      const op = ops[k] || {};
      if (op.t === 'replace') {
        cur[k] = op.v;
      } else if (op.t === 'obj') {
        const o = (cur[k] && typeof cur[k] === 'object' && !Array.isArray(cur[k])) ? cur[k] : {};
        Object.keys(op.set || {}).forEach(function (f) { o[f] = op.set[f]; });
        (op.unset || []).forEach(function (f) { delete o[f]; });
        cur[k] = o;
      } else if (op.t === 'list') {
        cur[k] = mergeList_(Array.isArray(cur[k]) ? cur[k] : [], op);
      }
    });
    const s = JSON.stringify(cur);
    writeBucket(sheet, s);
    out[b] = s;
  });
  if (opId) cache.put('op_' + opId, '1', 1800);
  return { ok: true, merged: out };
}

function mergeList_(arr, op) {
  const key = op.key || 'id';
  const idx = {};
  arr.forEach(function (r, i) { if (r && r[key] != null) idx[String(r[key])] = i; });
  // 수정: 그 사이 다른 기기가 지운 레코드면 건너뜀(삭제 우선)
  (op.patch || []).forEach(function (p) {
    const i = idx[String(p.k)];
    if (i === undefined) return;
    const r = arr[i];
    Object.keys(p.set || {}).forEach(function (f) { r[f] = p.set[f]; });
    (p.unset || []).forEach(function (f) { delete r[f]; });
  });
  // 추가: 같은 id가 이미 있으면(두 기기가 같은 번호를 매김) 새 번호로, 날짜·SKU 키면 필드 합치기
  let maxId = 0;
  if (key === 'id') arr.forEach(function (r) { const n = Number(r && r.id) || 0; if (n > maxId) maxId = n; });
  (op.add || []).forEach(function (r) {
    if (!r || typeof r !== 'object') return;
    const k = String(r[key]);
    if (idx[k] !== undefined) {
      if (JSON.stringify(arr[idx[k]]) === JSON.stringify(r)) return; // 똑같은 레코드가 이미 있음(재전송) → 무시
      if (key === 'id') {
        maxId += 1;
        const copy = {}; Object.keys(r).forEach(function (f) { copy[f] = r[f]; }); copy.id = maxId;
        arr.push(copy); idx[String(copy.id)] = arr.length - 1;
      } else {
        const i = idx[k]; const m = arr[i];
        Object.keys(r).forEach(function (f) { m[f] = r[f]; });
      }
      return;
    }
    arr.push(r); idx[k] = arr.length - 1;
    if (key === 'id') { const n = Number(r.id) || 0; if (n > maxId) maxId = n; }
  });
  const del = {};
  (op.del || []).forEach(function (k) { del[String(k)] = true; });
  return arr.filter(function (r) { return !(r && del[String(r[key])]); });
}

// 쓰기는 한 번에 하나씩 (동시에 들어온 저장끼리 순서대로 처리)
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// A1, A2, A3… 를 이어 붙여 반환 (빈 셀에서 멈춤). 옛 방식(A1 하나)도 그대로 읽힘.
function readBucket(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return '';
  const vals = sheet.getRange(1, 1, lastRow, 1).getValues();
  let out = '';
  for (let r = 0; r < vals.length; r++) {
    const v = vals[r][0];
    if (v === '' || v == null) break;
    out += String(v);
  }
  return out;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const bucket = p.bucket;

  if (p.save) {
    // 저장: ?bucket=shifts&save=...
    const targetBucket = bucket || 'data';
    withLock_(function () { writeBucket(getSheet(targetBucket), p.save); });
    return jsonOut_({ ok: true, bucket: targetBucket });
  }

  if (bucket) {
    // 특정 시트만 가져오기
    return jsonOut_({ data: readBucket(getSheet(bucket)) || '', bucket: bucket });
  }

  // 모든 시트 한 번에 가져오기
  const result = {};
  BUCKETS.forEach(name => { result[name] = readBucket(getSheet(name)) || ''; });
  return jsonOut_({ data: result, multi: true });
}

function doPost(e) {
  var _b = null;
  try { _b = JSON.parse(e.postData.contents); } catch (err) {}
  if (_b && _b.pushAction) return handlePushAction_(_b);
  // POST body에 JSON으로 {bucket: 'shifts', data: '...'} 형태
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    // 일반 텍스트로 보냈으면 data 시트에 저장 (기존 호환성)
    withLock_(function () { writeBucket(getSheet('data'), e.postData.contents); });
    return jsonOut_({ ok: true, bucket: 'data' });
  }

  if (body.merge) {
    // 레코드 단위 병합 저장 (앱 새 버전) — 동시 저장끼리 덮어쓰지 않음
    try {
      return jsonOut_(withLock_(function () { return applyMerge_(body.merge, body.opId); }));
    } catch (err) {
      return jsonOut_({ ok: false, error: String(err && err.message || err) });
    }
  }

  if (body.multi) {
    // 여러 시트 통째로 저장 (옛 앱·자동화 호환): {multi: true, buckets: {shifts: '...', sales: '...'}}
    withLock_(function () {
      Object.entries(body.buckets || {}).forEach(([name, value]) => {
        writeBucket(getSheet(name), value);
      });
    });
    return jsonOut_({ ok: true, multi: true });
  }

  // 단일 시트: {bucket: 'shifts', data: '...'}
  withLock_(function () { writeBucket(getSheet(body.bucket || 'data'), body.data || ''); });
  return jsonOut_({ ok: true, bucket: body.bucket || 'data' });
}

// ===== 자가 테스트 (편집기에서 실행) — 분할 저장/읽기 왕복 검증 + 테스트 시트 정리 =====
function selfTestChunks() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = getSheet('zz_selftest');
  // 120,000자 + 이모지 + 수식처럼 보이는 문자 섞기
  let s = '';
  while (s.length < 120000) s += '{"memo":"가나다 😀 a=b +1 -2 ","n":' + s.length + '}';
  writeBucket(sheet, s);
  const back = readBucket(sheet);
  const ok = back === s;
  console.log('왕복 검증: ' + (ok ? '성공' : '실패') + ' | 원본 ' + s.length + '자, 읽은 ' + back.length + '자, 셀 ' + sheet.getLastRow() + '개');
  ss.deleteSheet(sheet);
  // 실수로 생긴 빈 테스트 시트 정리
  const stray = ss.getSheetByName('shifts_2026-04');
  if (stray && !readBucket(stray)) { ss.deleteSheet(stray); console.log('빈 시트 shifts_2026-04 삭제'); }
  if (!ok) throw new Error('selfTestChunks 실패');
}