// 월간 손익 리포트 — GAS에 쌓인 일별 매출을 월별로 집계하고 마진을 추정.
// 매출 필드: mc/mk(기계 현금/카드) pc/pk(사진) ac/ak(악세서리) nc/nk(네일) jc/jk(조에보물) sk(슈킹).
// 마진 추정: 순매출(총매출/1.19) − 월세 − 알바 − 세무사. 월세는 rentVat=1(기본)이면 브루토/1.19로 순액 처리.
// GET /api/monthly-report?months=12&rent=3300&wages=2500&stb=500&rentVat=1&token=...
// RECON_TOKEN 설정 시 token 필수 (매출 데이터 노출 방지).
export const config = { maxDuration: 30 };

const GAS_URL = "https://script.google.com/macros/s/AKfycbw48A5z_PANeJWD-GRZbNc0SPj2uZmurngM1TQiq3tx69VDR9zDC153IOsVcxGSGaV8/exec";

const CASH_FIELDS = ["mc", "pc", "ac", "nc", "jc"];
const CARD_FIELDS = ["mk", "pk", "ak", "nk", "jk"];
const CATS = { machine: ["mc", "mk"], photo: ["pc", "pk"], accessory: ["ac", "ak"], nagel: ["nc", "nk"], zoebomul: ["jc", "jk"] };

function r2(x) { return Math.round(x * 100) / 100; }

export default async function handler(req, res) {
  const token = process.env.RECON_TOKEN;
  if (token && (req.query.token || "") !== token) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const months = Math.min(24, Math.max(1, parseInt(req.query.months, 10) || 12));
  const rent = Number(req.query.rent ?? 3300);
  const wages = Number(req.query.wages ?? 2500);
  const stb = Number(req.query.stb ?? 500);
  const rentVat = (req.query.rentVat ?? "1") !== "0"; // 월세 브루토에 19% 포함 여부

  try {
    const state = await (await fetch(GAS_URL)).json();
    const parsed = JSON.parse(state?.data?.sales || "[]");
    const sales = (parsed && !Array.isArray(parsed) && "sales" in parsed) ? parsed.sales : parsed;

    const byMonth = {};
    for (const s of sales) {
      if (!s || !/^\d{4}-\d{2}/.test(s.date || "")) continue;
      const m = s.date.slice(0, 7);
      const b = byMonth[m] ||= {
        month: m, days: 0, revenue: 0, cash: 0, card: 0, sk: 0,
        cats: { machine: 0, photo: 0, accessory: 0, nagel: 0, zoebomul: 0 },
      };
      b.days++;
      let cash = 0, card = 0;
      for (const f of CASH_FIELDS) cash += Number(s[f] || 0);
      for (const f of CARD_FIELDS) card += Number(s[f] || 0);
      const sk = Number(s.sk || 0);
      b.cash += cash; b.card += card; b.sk += sk;
      b.revenue += cash + card + sk;
      for (const [cat, fs] of Object.entries(CATS)) {
        b.cats[cat] += Number(s[fs[0]] || 0) + Number(s[fs[1]] || 0);
      }
    }

    const rentNet = rentVat ? rent / 1.19 : rent;
    const rows = Object.values(byMonth).sort((a, b) => b.month.localeCompare(a.month)).slice(0, months)
      .map(b => {
        const netRevenue = b.revenue / 1.19;
        const margin = netRevenue - rentNet - wages - stb;
        return {
          month: b.month, days: b.days,
          revenue_gross: r2(b.revenue), cash: r2(b.cash), card: r2(b.card), schucking: r2(b.sk),
          categories: Object.fromEntries(Object.entries(b.cats).map(([k, v]) => [k, r2(v)])),
          vat_19: r2(b.revenue - netRevenue),
          revenue_net: r2(netRevenue),
          margin_est: r2(margin),
        };
      });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      ok: true,
      assumptions: { rent_gross: rent, rent_net: r2(rentNet), rent_includes_vat: rentVat, wages, steuerberater: stb,
        note: "margin_est = 순매출(총매출/1.19) − 월세(순액) − 알바 − 세무사. 전기·소모품·SumUp수수료 등 잔비용 미포함." },
      months: rows,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e).slice(0, 200) });
  }
}
