// 매일 마감 자동화 (Vercel Cron) — 로컬 PC 없이도 매일 매출이 올라가게.
// 파이썬 run_daily.py의 서버 포팅: SumUp+루센트 추출 → 11필드 계산(슈킹=사진기준)
// → 세션 대사(rc) → GAS 저장(앱 필드 보존 + POST 검증·재시도).
// cron: vercel.json에서 매일 20:05 UTC(=베를린 여름 22:05) 호출.
// 수동: GET /api/daily-close?date=YYYY-MM-DD&token=... (RECON_TOKEN 설정 시 필요)
export const config = { maxDuration: 60 };

const GAS_URL = "https://script.google.com/macros/s/AKfycbw48A5z_PANeJWD-GRZbNc0SPj2uZmurngM1TQiq3tx69VDR9zDC153IOsVcxGSGaV8/exec";
const BERLIN_OFFSET_MIN = 120; // 파이썬 BERLIN(+2h 고정)과 동일 기준

function berlinToday() {
  return new Date(Date.now() + BERLIN_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}

// ── 휴무(일요일 + 헤센 공휴일) — 파이썬 is_closed 포팅 ─────────────
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
    f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4), k = c % 4, L = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * L) / 451), mo = Math.floor((h + L - 7 * m + 114) / 31),
    dy = ((h + L - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, mo - 1, dy));
}
function addD(d, n) { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; }
function iso(d) { return d.toISOString().slice(0, 10); }
function isClosed(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  if (d.getUTCDay() === 0) return "일요일";
  const y = d.getUTCFullYear(), e = easter(y);
  const hols = {
    [`${y}-01-01`]: "Neujahr", [`${y}-05-01`]: "Tag der Arbeit",
    [`${y}-10-03`]: "Tag der deutschen Einheit",
    [`${y}-12-25`]: "1. Weihnachtstag", [`${y}-12-26`]: "2. Weihnachtstag",
    [iso(addD(e, -2))]: "Karfreitag", [iso(addD(e, 1))]: "Ostermontag",
    [iso(addD(e, 39))]: "Himmelfahrt", [iso(addD(e, 50))]: "Pfingstmontag",
    [iso(addD(e, 60))]: "Fronleichnam",
  };
  return hols[dateStr] || null;
}

// ── SumUp: 상세 포함 하루 거래 (파이썬 fetch_today_transactions 포팅) ──
function normalize(s) {
  s = (s || "").toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss");
  return s.replace(/[ \-_,.'’]/g, "");
}
const KEYWORD_RULES = [
  ["photo", ["angle", "passbild", "qrcode", "extra", "exta", "gutschein", "mehrfoto", "dutchpay", "기계error", "stampcoupon", "freeshot"]],
  ["zoebomul", ["zoesbomul", "zoebomul", "zoes"]],
  ["nagel", ["nagel"]],
  ["accessory", ["cosmetics", "shemonbred", "sunscreen", "mist", "bag", "clothing", "earing",
    "keyring", "keychain", "schlusselanhanger", "accessor", "pimple", "patch", "kitty", "blackbear"]],
];
function categorize(name) {
  const n = normalize(name);
  for (const [cat, kws] of KEYWORD_RULES) if (kws.some(k => n.includes(k))) return cat;
  return null;
}
async function sumupGet(path, key) {
  const r = await fetch("https://api.sumup.com" + path, {
    headers: { Authorization: "Bearer " + key, Accept: "application/json" },
  });
  if (!r.ok) throw new Error("sumup " + r.status + " " + path.slice(0, 40));
  return r.json();
}
async function fetchSumupDay(key, day) {
  // 날짜필터 미작동 → next 커서로 목표 날짜까지 페이지네이션 (파이썬과 동일)
  let href = "/v0.1/me/transactions/history?order=descending&limit=200";
  const dayItems = [];
  for (let page = 0; page < 40; page++) {
    const listing = await sumupGet(href, key);
    const items = listing.items || [];
    if (!items.length) break;
    for (const t of items) {
      const d = new Date(new Date(t.timestamp).getTime() + BERLIN_OFFSET_MIN * 60000).toISOString().slice(0, 10);
      if (d === day && t.status === "SUCCESSFUL") dayItems.push(t);
    }
    const oldest = new Date(new Date(items[items.length - 1].timestamp).getTime() + BERLIN_OFFSET_MIN * 60000)
      .toISOString().slice(0, 10);
    if (oldest < day) break;
    let nxt = null;
    for (const l of listing.links || []) if (l.rel === "next") nxt = l.href;
    if (!nxt) break;
    href = nxt.startsWith("/") ? nxt : "/v0.1/me/transactions/history?" + nxt;
  }
  const detailed = [];
  for (const t of dayItems) {
    detailed.push(await sumupGet("/v0.1/me/transactions?id=" + t.id, key));
  }
  return detailed;
}
function classify(txs) {
  const totals = { photo: { cash: 0, card: 0 }, accessory: { cash: 0, card: 0 },
    nagel: { cash: 0, card: 0 }, zoebomul: { cash: 0, card: 0 } };
  const unknown = [];
  let suPhotos = 0, qrCount = 0;
  const gutscheinZeros = [];
  for (const tx of txs) {
    const isCash = tx.payment_type === "CASH";
    for (const p of tx.products || []) {
      const name = p.name || "";
      const amt = Number(p.total_with_vat ?? p.total_price ?? 0);
      const norm = normalize(name);
      if (norm.includes("passbild") && norm.includes("qrcode")) qrCount += Number(p.quantity || 1);
      const cat = categorize(name);
      if (cat === "photo") {
        suPhotos += Number(p.quantity || 1);
        if (amt === 0) gutscheinZeros.push({ t: tx.timestamp });
      }
      if (!cat) { unknown.push({ name, amount: amt }); continue; }
      totals[cat][isCash ? "cash" : "card"] += amt;
    }
  }
  return { totals, unknown, suPhotos, qrCount, gutscheinZeros };
}

// ── 루센트: 하루 세션 (파이썬 lucent_extract 포팅, qr bump 포함) ─────
const LUCENT = "http://114.207.112.139";
function calcPrice(mode, qty) {
  const m = (mode || "").toLowerCase();
  if (/(46|64)\d$/.test(m)) return 4 + qty * 3;
  if (/(26|62)\d+$/.test(m)) return 6 + qty * 1.5;
  if ((mode || "").includes("여권") || m.includes("passbild") || m.includes("pass_bild")) return 7 + qty * 3;
  if ((mode || "").trim() === "123" || (mode || "").includes("미국여권")) return qty * 10;
  return null;
}
async function fetchLucentDay(id, pw, day, qrCount) {
  const jar = {};
  const setCookie = res => {
    const sc = res.headers.get("set-cookie");
    if (sc) sc.split(/,(?=[^;]+=)/).forEach(c => { const [k, v] = c.split(";")[0].split("="); if (k) jar[k.trim()] = v; });
  };
  const hdr = () => ({ "User-Agent": "Mozilla/5.0", Cookie: Object.entries(jar).map(([k, v]) => k + "=" + v).join("; ") });
  setCookie(await fetch(LUCENT + "/h2/login.jsp", { headers: hdr() }));
  const r1 = await fetch(LUCENT + "/h2/loginProc.jsp", {
    method: "POST", redirect: "manual",
    headers: { ...hdr(), "Content-Type": "application/x-www-form-urlencoded" },
    body: "account_id=" + encodeURIComponent(id) + "&account_pwd=" + encodeURIComponent(pw),
  });
  setCookie(r1);
  if (!(await r1.text()).includes('"res_cd":"0000"')) throw new Error("lucent login failed");
  const end = iso(addD(new Date(day + "T00:00:00Z"), 1));
  const html = await (await fetch(
    `${LUCENT}/h2/payment.jsp?group_idx=-1&branch_idx=-1&device_idx=-1&start=${day}&end=${end}`,
    { headers: hdr() })).text();
  if (html.includes("frmLogin") && html.includes("loginProc")) throw new Error("lucent session lost");
  const tbl = (html.match(/<table id="basic-datatable"[\s\S]*?<\/table>/) || [""])[0];
  const tbody = (tbl.match(/<tbody[\s\S]*?<\/tbody>/) || [""])[0];
  const strip = s => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  let cash = 0, card = 0, coupon = 0, qrLeft = qrCount;
  const sessions = [];
  for (const row of tbody.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []) {
    const cs = (row.match(/<td[^>]*>[\s\S]*?<\/td>/g) || []).map(strip);
    if (cs.length < 8 || !cs[0].startsWith(day)) continue;
    const qty = parseInt(cs[4], 10) || 0, method = cs[5], mode = cs[7];
    if ((mode || "").trim().toLowerCase() === "no") continue;
    let calc = calcPrice(mode, qty);
    const isPass = (mode || "").includes("여권") || (mode || "").toLowerCase().includes("passbild");
    if (isPass && qty === 1 && method === "쿠폰" && qrLeft > 0) { calc = 15; qrLeft--; }
    if (calc == null) continue;
    if (method === "카드") card += calc;
    else if (method === "현금") cash += calc;
    else if (method === "쿠폰") { coupon += calc; sessions.push({ t: cs[0].slice(11, 16), v: Math.round(calc * 100) / 100 }); }
  }
  return { cash, card, coupon, couponSessions: sessions };
}

// ── 세션 대사 rc (파이썬 reconcile_sessions 묶음매칭 포팅) ─────────
function reconcile(couponSessions, txs) {
  const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const cps = couponSessions.map(s => ({ ...s, sec: toMin(s.t) * 60 }));
  const sus = [];
  let suPhotos = 0;
  for (const tx of txs) {
    const lines = (tx.products || []).filter(p => categorize(p.name || "") === "photo");
    const amt = lines.reduce((a, p) => a + Number(p.total_with_vat ?? p.total_price ?? 0), 0);
    if (amt <= 0) continue;
    suPhotos += lines.reduce((a, p) => a + Number(p.quantity || 1), 0);
    const d = new Date(new Date(tx.timestamp).getTime() + BERLIN_OFFSET_MIN * 60000);
    sus.push({ sec: d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds(), v: Math.round(amt * 100) / 100 });
  }
  const tol = 0.5, used = new Set();
  const minV = cps.length ? Math.min(...cps.map(c => c.v)) : 0;
  for (const su of [...sus].sort((a, b) => a.sec - b.sec)) {
    let rem = su.v;
    while (rem >= minV - tol) {
      const cand = cps.map((c, i) => ({ c, i }))
        .filter(({ i, c }) => !used.has(i) && c.v <= rem + tol)
        .sort((A, B) => {
          const exA = Math.abs(A.c.v - rem) > tol ? 1 : 0, exB = Math.abs(B.c.v - rem) > tol ? 1 : 0;
          if (exA !== exB) return exA - exB;
          if (A.c.v !== B.c.v) return B.c.v - A.c.v;
          return Math.abs(A.c.sec - su.sec) - Math.abs(B.c.sec - su.sec);
        });
      if (!cand.length) break;
      used.add(cand[0].i);
      rem -= cand[0].c.v;
    }
  }
  const matched = cps.filter((_, i) => used.has(i)).map(c => ({ t: c.t, v: c.v }));
  const un = cps.filter((_, i) => !used.has(i)).map(c => ({ t: c.t, v: c.v })).sort((a, b) => a.t.localeCompare(b.t));
  const cpEur = Math.round(cps.reduce((a, c) => a + c.v, 0) * 100) / 100;
  const suEur = Math.round(sus.reduce((a, s) => a + s.v, 0) * 100) / 100;
  return { cp_n: cps.length, cp_eur: cpEur, su_n: sus.length, su_eur: suEur,
    su_photos: suPhotos, gap: Math.max(0, Math.round((cpEur - suEur) * 100) / 100), matched, un };
}

// ── GAS 저장 (앱 필드 보존 + 검증·재시도 — 파이썬 push_sales 포팅) ──
const SALES_FIELDS = ["mc", "mk", "pc", "pk", "ac", "ak", "nc", "nk", "jc", "jk", "sk"];
async function pushSales(dateStr, rows, rc) {
  const state = await (await fetch(GAS_URL)).json();
  const raw = state?.data?.sales || "[]";
  const parsed = JSON.parse(raw);
  const isNs = parsed && !Array.isArray(parsed) && "sales" in parsed;
  const sales = isNs ? parsed.sales : parsed;
  const idx = sales.findIndex(s => s && s.date === dateStr);
  const rec = { id: idx >= 0 ? sales[idx].id : (Math.max(0, ...sales.map(s => Number(s.id) || 0)) + 1), date: dateStr };
  for (const f of SALES_FIELDS) rec[f] = Math.round(Number(rows[f] || 0));
  rec.rc = rc;
  if (idx >= 0) for (const f of ["fs", "cc", "kd", "note", "nx", "adm"]) if (f in sales[idx]) rec[f] = sales[idx][f];
  if (idx >= 0) sales[idx] = rec; else sales.push(rec);
  const body = JSON.stringify({ multi: true, buckets: { sales: JSON.stringify(isNs ? { sales } : sales) } });
  let lastResp = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    lastResp = await (await fetch(GAS_URL, { method: "POST", body, headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow" })).json().catch(() => null);
    await new Promise(r => setTimeout(r, 1500));
    try {
      const chk = await (await fetch(GAS_URL)).json();
      const cp = JSON.parse(chk?.data?.sales || "[]");
      const cs = (cp && !Array.isArray(cp) && "sales" in cp) ? cp.sales : cp;
      const got = cs.find(s => s && s.date === dateStr);
      if (got && SALES_FIELDS.every(f => Math.round(Number(got[f] || 0)) === rec[f])) {
        return { ok: true, attempts: attempt + 1, resp: lastResp, rec };
      }
    } catch { /* 재시도 */ }
  }
  return { ok: false, attempts: 3, resp: lastResp, rec };
}

export default async function handler(req, res) {
  const token = process.env.RECON_TOKEN;
  const isCron = !!req.headers["x-vercel-cron"] ||
    (process.env.CRON_SECRET && req.headers.authorization === "Bearer " + process.env.CRON_SECRET);
  const qDate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "") ? req.query.date : null;
  // 날짜 지정(과거 재계산)은 토큰 필요(설정 시). 기본(오늘)은 멱등이라 개방.
  if (qDate && token && (req.query.token || "") !== token && !isCron) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const day = qDate || berlinToday();
  const out = { ok: true, date: day, source: isCron ? "cron" : "manual" };
  try {
    const closed = isClosed(day);
    if (closed) { out.skipped = "휴무: " + closed; return res.status(200).json(out); }
    const txs = await fetchSumupDay(process.env.SUMUP_API_KEY, day);
    const { totals, unknown, qrCount } = classify(txs);
    const luc = await fetchLucentDay(process.env.LUCENT_ID, process.env.LUCENT_PW, day, qrCount);
    const sumupPhoto = totals.photo.cash + totals.photo.card;
    const rows = {
      mc: luc.cash, mk: luc.card,
      pc: totals.photo.cash, pk: totals.photo.card,
      ac: totals.accessory.cash, ak: totals.accessory.card,
      nc: totals.nagel.cash, nk: totals.nagel.card,
      jc: totals.zoebomul.cash, jk: totals.zoebomul.card,
      sk: Math.max(0, luc.coupon - sumupPhoto), // 슈킹 = 쿠폰 − SumUp사진 (사진 기준)
    };
    const rc = reconcile(luc.couponSessions, txs);
    const push = await pushSales(day, rows, rc);
    out.rows = rows;
    out.rc_summary = { cp: rc.cp_n, cp_eur: rc.cp_eur, su_eur: rc.su_eur, un: rc.un.length };
    out.unknown_products = unknown;
    out.push = { ok: push.ok, attempts: push.attempts };
    if (!push.ok) { out.ok = false; out.error = "GAS 저장 검증 실패(3회)"; }
  } catch (e) {
    out.ok = false; out.error = String(e).slice(0, 200);
  }
  res.setHeader("Cache-Control", "no-store");
  return res.status(out.ok ? 200 : 500).json(out);
}
