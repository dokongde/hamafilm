// ═══ 사진구멍(sk) 귀속: 슈킹(사장님측) vs 누락(없어진 돈) ═══
// "누락" = 비인정 직원만의 구멍 = 매출 아님. 파생 계산 전용 — GAS 필드/저장 계약은 건드리지 않는다.
// 순환 주의: utils.js는 이 파일을 import하지 않는다 (recon → utils 단방향).
import { getSlots } from "./utils";

const toMin = t => { const [h, m] = String(t || "").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const r2 = n => Math.round(n * 100) / 100; // 센트 반올림

// 그날 sales 레코드(rec) 하나를 받아 사진구멍을 분해한다.
// 반환: { explained, unexplained, sukking, nurak, reportSum, admSum, naaxOverflow, fsSum }
//  - explained    = 직원 리포트 합 + 관리자 사후설명(adm) 합 + 나약스초과 max(0, nx−mk) + 과거 fs마킹 합
//  - unexplained  = max(0, sk − explained)
//  - nurak(누락)  = 비인정(+미배정·시간대외) 세션 비율만큼의 미설명 몫 — 매출 아님
//  - sukking      = 미설명 중 인정직원 몫 (사장님 현금 = 매출 맞음)
function attributeGap(data, rec) {
  const zero = { explained: 0, unexplained: 0, sukking: 0, nurak: 0, reportSum: 0, admSum: 0, naaxOverflow: 0, fsSum: 0 };
  if (!rec) return zero;

  const date = rec.date;
  const sk = Number(rec.sk) || 0;
  const dayShifts = (data.shifts || []).filter(s => s.date === date);
  const isSanctioned = id => { const st = (data.staff || []).find(x => x.id == id); return !!(st && st.sanctioned); };

  // ── 설명됨 ──
  const reportSum = dayShifts.reduce((a, s) =>
    a + (Array.isArray(s.report)
      ? s.report.reduce((b, r) => b + Math.max((Number(r.full) || 0) - (Number(r.paid) || 0), 0), 0)
      : 0), 0);
  // 관리자 사후 설명 (adm = [{kind, full, paid, note}]) — 사장님이 나중에 확인한 재촬영/무료쿠폰
  const admSum = (Array.isArray(rec.adm) ? rec.adm : [])
    .reduce((a, r) => a + Math.max((Number(r.full) || 0) - (Number(r.paid) || 0), 0), 0);
  const nx = rec.nx != null ? (Number(rec.nx) || 0) : null;
  const naaxOverflow = nx != null ? Math.max(0, nx - (Number(rec.mk) || 0)) : 0;
  const fs = Array.isArray(rec.fs) ? rec.fs : []; // 과거 프리샷 마킹 (읽기전용 레거시)
  const un = (rec.rc && Array.isArray(rec.rc.un)) ? rec.rc.un : [];
  const isMarked = (t, v) => fs.some(f => f.t === t && Number(f.v) === Number(v));
  const fsSum = un.filter(s => isMarked(s.t, s.v)).reduce((a, s) => a + (Number(s.v) || 0), 0);

  const explained = reportSum + admSum + naaxOverflow + fsSum;
  const unexplained = Math.max(0, r2(sk - explained));
  if (unexplained === 0) return { ...zero, explained, reportSum, admSum, naaxOverflow, fsSum };

  // ── un 세션 → 슬롯 → 그날 시프트 → 직원: 인정 세션합(S) vs 비인정+미배정 세션합(N) ──
  const slots = getSlots(date); // 방학 여부 자동 감지
  let S = 0, N = 0;
  un.forEach(s => {
    const min = toMin(s.t);
    const slot = slots.find(sl => min >= toMin(sl.start) && min < toMin(sl.end));
    const sh = slot ? dayShifts.find(x => x.slotType === slot.type) : null;
    const v = Number(s.v) || 0;
    if (sh && isSanctioned(sh.staffId)) S += v;
    else N += v; // 미배정·시간대 외는 비인정 취급 (보수적)
  });

  let nurak, sukking;
  if (S + N > 0) {
    nurak = r2(unexplained * N / (S + N));
    sukking = r2(unexplained - nurak);
  } else {
    // rc/un 없음 → 그날 시프트에 인정직원이 있으면 전부 슈킹, 없으면 전부 누락
    const hasSanc = dayShifts.some(sh => isSanctioned(sh.staffId));
    nurak = hasSanc ? 0 : unexplained;
    sukking = hasSanc ? unexplained : 0;
  }
  return { explained, unexplained, sukking, nurak, reportSum, admSum, naaxOverflow, fsSum };
}

// 월 누락 합계
function monthNurak(data, ym) {
  return r2((data.sales || [])
    .filter(s => s.date.startsWith(ym))
    .reduce((a, r) => a + attributeGap(data, r).nurak, 0));
}

// 월별 종합 데이터 계산 (매출/비용/인건비/순수익) — 누락은 매출 아님이라 매출·순수익에서 제외
// (utils.js에서 이동: attributeGap 필요 + 순환 import 방지)
function calcMonthData(data, ym) {
  // 1. 과거 직접 입력 데이터 우선
  const historical = (data.historicalData || []).find(h => h.ym === ym);
  if (historical) {
    return {
      ym,
      sales: historical.sales || 0,
      expenses: historical.expenses || 0,
      labor: historical.labor || 0,
      vat: 0, // 과거 데이터는 비용에 이미 포함된 것으로 간주
      net: (historical.sales || 0) - (historical.expenses || 0),
      nurak: 0,
      isHistorical: true
    };
  }

  // 2. 현재 시스템 데이터로 계산
  const monthSales = (data.sales || []).filter(s => s.date.startsWith(ym));
  const sv = k => monthSales.reduce((t, r) => t + (r[k] || 0), 0);
  const skukingRaw = sv("sk");
  const reportable = sv("pc") + sv("pk") + sv("mc") + sv("mk") + sv("ac") + sv("ak") + sv("nc") + sv("nk") + sv("jc") + sv("jk"); // 슈킹 제외
  const nurak = r2(monthSales.reduce((a, r) => a + attributeGap(data, r).nurak, 0));
  const totalSales = reportable + skukingRaw - nurak; // 누락 제외

  // 부가세: 슈킹 제외 신고 매출의 19% (누락과 무관 — 원래 sk 제외)
  const vat = reportable * 0.19;

  // 인건비 (해당월 모든 직원 시급 × 시간)
  let labor = 0;
  const monthShifts = (data.shifts || []).filter(s => s.date.startsWith(ym));
  monthShifts.forEach(sh => {
    const st = (data.staff || []).find(s => s.id == sh.staffId);
    if (!st) return;
    const h = sh.hours || (getSlots(sh.date).find(x => x.type === sh.slotType) || { hours: 0 }).hours;
    labor += h * st.wage;
  });

  // 일반 지출 (해당월)
  const monthExpenses = (data.expenses || [])
    .filter(x => x.date.startsWith(ym))
    .reduce((t, x) => t + (x.amount || 0), 0);

  const totalExpenses = monthExpenses + labor + vat;
  const net = totalSales - totalExpenses;

  return {
    ym,
    sales: totalSales,
    reportableSales: reportable,
    skuking: r2(skukingRaw - nurak), // 슈킹 = sk − 누락 (인정몫+설명됨)
    nurak,
    expenses: totalExpenses,
    expensesNoLabor: monthExpenses,
    labor,
    vat,
    net,
    isHistorical: false
  };
}

export { attributeGap, monthNurak, calcMonthData };
