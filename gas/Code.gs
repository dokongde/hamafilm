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
const BUCKETS = ['data', 'shifts', 'sales', 'completions', 'expenses', 'payments', 'cancellations', 'payrollRecs'];
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
  const lastRow = Math.max(sheet.getLastRow(), 1);
  sheet.getRange(1, 1, Math.max(lastRow, parts.length), 1).clearContent();
  const target = sheet.getRange(1, 1, parts.length, 1);
  target.setNumberFormat('@');
  target.setValues(parts);
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
    writeBucket(getSheet(targetBucket), p.save);
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
    writeBucket(getSheet('data'), e.postData.contents);
    return jsonOut_({ ok: true, bucket: 'data' });
  }

  if (body.multi) {
    // 여러 시트 한 번에 저장: {multi: true, buckets: {shifts: '...', sales: '...'}}
    Object.entries(body.buckets || {}).forEach(([name, value]) => {
      writeBucket(getSheet(name), value);
    });
    return jsonOut_({ ok: true, multi: true });
  }

  // 단일 시트: {bucket: 'shifts', data: '...'}
  writeBucket(getSheet(body.bucket || 'data'), body.data || '');
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
