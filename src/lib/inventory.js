// ============================================================
// 소품 재고 로직
// - inventory: 상품 마스터 [{sku, name_ko, name_de, sumup_name, category,
//     supplier, options, cost_krw, landed_krw, price_eur, margin_pct, note, qty_status, active}]
// - stockMoves: 재고 장부 [{date, sku, type(입고|판매|환불|조정), qty, sourceId, memo}]
//   현재 재고 = 이동 합계. 입고/환불 +, 판매 −, 조정은 입력한 부호 그대로(+/−).
// ============================================================

export const EUR_KRW = 1500;         // 표시용 환율 (€1 = ₩1,500)
export const MOVE_TYPES = ["입고", "판매", "환불", "조정"];

// 한 이동이 재고에 주는 부호 있는 변화량
export function moveDelta(m) {
  const q = Number(m.qty) || 0;
  if (m.type === "판매") return -Math.abs(q);
  if (m.type === "조정") return q;              // 조정은 부호 그대로 (음수 가능)
  return Math.abs(q);                            // 입고·환불 = +
}

// sku → 현재 재고 수량
export function stockBySku(moves) {
  const map = {};
  (moves || []).forEach(m => {
    if (!m || !m.sku) return;
    map[m.sku] = (map[m.sku] || 0) + moveDelta(m);
  });
  return map;
}

// 재고 색상: 0 빨강, 1 주황, 그 외 기본
export function stockColor(n) {
  if (n <= 0) return "#e03131";
  if (n === 1) return "#e8590c";
  return "#2f9e44";
}

// VAT(19%) 제외 순매출 (€)
export function netEur(price_eur) {
  return (Number(price_eur) || 0) / 1.19;
}

// 개당 순익 (€) = 순매출 − 부대원가(landed, ₩→€)
export function unitProfitEur(it) {
  return netEur(it.price_eur) - (Number(it.landed_krw) || 0) / EUR_KRW;
}

// 상품 1줄 요약 (재고·가치·판매·순익)
export function itemRow(it, moves) {
  const stock = stockBySku(moves)[it.sku] || 0;
  const sold = (moves || []).filter(m => m.sku === it.sku && m.type === "판매")
    .reduce((a, m) => a + Math.abs(Number(m.qty) || 0), 0);
  const refunded = (moves || []).filter(m => m.sku === it.sku && m.type === "환불")
    .reduce((a, m) => a + Math.abs(Number(m.qty) || 0), 0);
  const netSold = Math.max(sold - refunded, 0);
  return {
    stock,
    sold: netSold,
    stockCostKrw: stock * (Number(it.landed_krw) || 0),   // 보유 재고 원가(부대 포함) ₩
    stockValueEur: stock * (Number(it.price_eur) || 0),   // 보유 재고 판매가치 €
    profitEur: netSold * unitProfitEur(it),               // 누적 순익 €
  };
}

// 전체 합계 (관리자 요약)
export function inventoryTotals(inventory, moves) {
  const t = { units: 0, skus: 0, stockCostKrw: 0, stockValueEur: 0, soldUnits: 0, profitEur: 0, outOfStock: 0 };
  (inventory || []).filter(it => it.active !== false).forEach(it => {
    const r = itemRow(it, moves);
    t.skus += 1;
    t.units += r.stock;
    t.stockCostKrw += r.stockCostKrw;
    t.stockValueEur += r.stockValueEur;
    t.soldUnits += r.sold;
    t.profitEur += r.profitEur;
    if (r.stock <= 0) t.outOfStock += 1;
  });
  return t;
}
