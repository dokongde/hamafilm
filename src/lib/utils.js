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

const REPORT_KINDS = [
  { k: "reshoot", label: "🔄 재촬영 (이슈 발생)" },
  { k: "free",    label: "🎟 스탬프쿠폰 (무료촬영)" },
  { k: "etc",     label: "기타" }
];
// 과거 기록 호환: 버튼에서 빠진 종류도 라벨은 유지 (일부 받음은 이제 체크박스로 처리)
const LEGACY_KIND_LABELS = { partial: "🎟 부분쿠폰" };
const reportKindLabel = (k) => (REPORT_KINDS.find(x => x.k === k) || { label: LEGACY_KIND_LABELS[k] || k }).label;


// ※ calcMonthData는 src/lib/recon.js로 이동 (누락 귀속 attributeGap 필요 + 순환 import 방지)

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

function setCurrentVacations(v) { CURRENT_VACATIONS = v || []; }

export { easter, addD, dstr, hessenHols, DOW_KO, isInVacation, setCurrentVacations, getSlots, dowKo, todayStr, curYM, nextYM, prevYM, getCarryIn, fmtE, fmt, nid, shiftHours, actualMinutes, timeDiff, needsAttention, REPORT_KINDS, reportKindLabel, getMonthRange };
