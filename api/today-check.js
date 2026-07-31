// 실시간 대사 (kiosk 퇴근 시 호출) — 오늘 루센트 쿠폰€ vs SumUp 사진€ 즉석 조회.
// Vercel serverless. 크레덴셜은 env: SUMUP_API_KEY, LUCENT_ID, LUCENT_PW (선택: RECON_TOKEN).
// 반환: { ok, sumup:{count,eur}, lucent:{count,eur}, gap, date }  gap=lucent-sumup(설명 전).
export const config = { maxDuration: 30 };

const BERLIN_OFFSET_MIN = 120; // 여름(CEST=UTC+2). Python 자동화와 동일 기준.

export function berlinToday() {
  const now = new Date();
  const b = new Date(now.getTime() + BERLIN_OFFSET_MIN * 60000);
  return b.toISOString().slice(0, 10); // YYYY-MM-DD (베를린 날짜)
}

// ── SumUp: 오늘 사진 결제 건수/€ ─────────────────────────────
function normalize(s) {
  s = (s || "").toLowerCase();
  s = s.replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss");
  return s.replace(/[ \-_,.'’]/g, "");
}
const PHOTO_KW = ["angle", "passbild", "qrcode", "extra", "exta", "gutschein",
  "mehrfoto", "dutchpay", "기계error", "stampcoupon", "freeshot"];
function isPhoto(name) {
  const n = normalize(name);
  return PHOTO_KW.some(k => n.includes(k));
}

export async function getSumupToday(key, today) {
  const url = "https://api.sumup.com/v0.1/me/transactions/history?order=descending&limit=200";
  const r = await fetch(url, { headers: { Authorization: "Bearer " + key, Accept: "application/json" } });
  if (!r.ok) throw new Error("sumup " + r.status);
  const items = (await r.json()).items || [];
  let eur = 0, count = 0, cashEur = 0; // cashEur = 오늘 현금매출 전체(전 카테고리) — 서랍 기대값용
  for (const t of items) {
    if (t.status !== "SUCCESSFUL" || t.type !== "PAYMENT") continue;
    // 베를린 날짜 필터
    const d = new Date(new Date(t.timestamp).getTime() + BERLIN_OFFSET_MIN * 60000).toISOString().slice(0, 10);
    if (d !== today) continue;
    if (t.payment_type === "CASH") cashEur += Number(t.amount) || 0;
    if (!isPhoto(t.product_summary || "")) continue;
    eur += Number(t.amount) || 0;
    count += 1;
  }
  return { count, eur: Math.round(eur * 100) / 100, cashEur: Math.round(cashEur * 100) / 100 };
}

// ── 루센트: 오늘 쿠폰 세션 건수/€ (가격룰 적용) ───────────────
const LUCENT = "http://114.207.112.139";
function calcPrice(mode, qty) {
  const m = (mode || "").toLowerCase();
  if (/(46|64)\d$/.test(m)) return 4 + qty * 3;
  if (/(26|62)\d+$/.test(m)) return 6 + qty * 1.5;
  if ((mode || "").includes("여권") || m.includes("passbild") || m.includes("pass_bild")) return 7 + qty * 3;
  if ((mode || "").trim() === "123" || (mode || "").includes("미국여권")) return qty * 10;
  return null;
}
function stripTags(s) {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
export async function getLucentToday(id, pw, today) {
  const jar = {};
  const setCookie = (res) => {
    const sc = res.headers.get("set-cookie");
    if (sc) sc.split(/,(?=[^;]+=)/).forEach(c => { const [k, v] = c.split(";")[0].split("="); if (k) jar[k.trim()] = v; });
  };
  const cookieHdr = () => Object.entries(jar).map(([k, v]) => k + "=" + v).join("; ");
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
  // 1) 초기 쿠키
  const r0 = await fetch(LUCENT + "/h2/login.jsp", { headers: { "User-Agent": ua } });
  setCookie(r0);
  // 2) 로그인
  const body = "account_id=" + encodeURIComponent(id) + "&account_pwd=" + encodeURIComponent(pw);
  const r1 = await fetch(LUCENT + "/h2/loginProc.jsp", {
    method: "POST", redirect: "manual",
    headers: { "User-Agent": ua, "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHdr() },
    body,
  });
  setCookie(r1);
  const lbody = await r1.text();
  if (!lbody.includes('"res_cd":"0000"')) throw new Error("lucent login failed");
  // 3) payment.jsp (오늘)
  const end = new Date(new Date(today + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const purl = LUCENT + "/h2/payment.jsp?group_idx=-1&branch_idx=-1&device_idx=-1&start=" + today + "&end=" + end;
  const r2 = await fetch(purl, { headers: { "User-Agent": ua, Cookie: cookieHdr() } });
  const html = await r2.text();
  if (html.includes("frmLogin") && html.includes("loginProc")) throw new Error("lucent session lost");
  // 테이블 파싱
  const tbl = (html.match(/<table id="basic-datatable"[\s\S]*?<\/table>/) || [])[0] || "";
  const tbody = (tbl.match(/<tbody[\s\S]*?<\/tbody>/) || [])[0] || "";
  const rows = tbody.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  let eur = 0, count = 0;
  for (const row of rows) {
    const cs = (row.match(/<td[^>]*>[\s\S]*?<\/td>/g) || []).map(stripTags);
    if (cs.length < 8) continue;
    const ts = cs[0], qty = parseInt(cs[4], 10) || 0, method = cs[5], mode = cs[7];
    if (!ts.startsWith(today)) continue;
    if ((mode || "").trim().toLowerCase() === "no") continue;
    if (method !== "쿠폰") continue;
    const calc = calcPrice(mode, qty);
    if (calc == null) continue;
    eur += calc; count += 1;
  }
  return { count, eur: Math.round(eur * 100) / 100 };
}

export default async function handler(req, res) {
  const token = process.env.RECON_TOKEN;
  if (token && (req.query.token || "") !== token) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  // 기본은 오늘(베를린). ?date=YYYY-MM-DD 로 과거 조회 가능(검증/특정일용).
  const today = (/^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "")) ? req.query.date : berlinToday();
  const out = { ok: true, date: today, sumup: null, lucent: null };
  try { out.sumup = await getSumupToday(process.env.SUMUP_API_KEY, today); }
  catch (e) { out.sumup = { error: String(e).slice(0, 120) }; }
  try { out.lucent = await getLucentToday(process.env.LUCENT_ID, process.env.LUCENT_PW, today); }
  catch (e) { out.lucent = { error: String(e).slice(0, 120) }; }
  if (out.sumup && out.lucent && out.sumup.eur != null && out.lucent.eur != null) {
    out.gap = Math.round((out.lucent.eur - out.sumup.eur) * 100) / 100;
  }
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json(out);
}
