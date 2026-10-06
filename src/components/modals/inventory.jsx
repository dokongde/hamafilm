import { useState } from "react";
import { todayStr, nid } from "../../lib/utils";
import { MOVE_TYPES, stockBySku } from "../../lib/inventory";

const CATEGORIES = ["키링", "이어폰·홀더", "그립톡", "가방·파우치", "안경", "기타"];

// ─── 입출고 (재고 이동) ───
function StockMoveModal({ modal, data, persist, close, toast }) {
  const inv = data.inventory || [];
  const it = inv.find(x => x.sku === modal.sku) || null;
  const cur = (stockBySku(data.stockMoves || [])[modal.sku]) || 0;
  const [type, setType] = useState(modal.moveType || "판매");
  const [qty, setQty] = useState("1");
  const [memo, setMemo] = useState("");
  const [date, setDate] = useState(todayStr());

  const n = parseInt(qty, 10);
  const delta = type === "판매" ? -Math.abs(n || 0) : type === "조정" ? (n || 0) : Math.abs(n || 0);
  const after = cur + delta;

  const save = async () => {
    if (!it) { toast("상품을 찾을 수 없어요"); return; }
    if (!n && type !== "조정") { toast("수량을 입력하세요"); return; }
    if (type === "조정" && !Number.isFinite(n)) { toast("수량을 입력하세요 (예: -1)"); return; }
    const move = {
      id: nid(data.stockMoves || []),
      date, sku: modal.sku, type,
      qty: type === "조정" ? n : Math.abs(n),
      sourceId: "manual", memo,
      savedAt: new Date().toISOString()
    };
    await persist({ ...data, stockMoves: [...(data.stockMoves || []), move] });
    close();
    toast(`${it.name_ko} ${type} ${type === "조정" ? (n > 0 ? "+" + n : n) : Math.abs(n)}개 (재고 ${after})`);
  };

  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>📦 입·출고</h3>
        <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>{it ? it.name_ko : modal.sku}</div>
        <div style={{fontSize:12,color:"#888",marginBottom:12}}>현재 재고 <b style={{color:"#1a1a1a"}}>{cur}개</b>{it && it.options ? ` · ${it.options}` : ""}</div>
        <div className="fr fc2">
          <div>
            <label>종류</label>
            <select value={type} onChange={e=>setType(e.target.value)}>
              {MOVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label>수량 {type === "조정" ? "(±)" : ""}</label>
            <input type="number" value={qty} onChange={e=>setQty(e.target.value)} placeholder={type === "조정" ? "예: -1" : "1"} />
          </div>
        </div>
        <div className="fr">
          <div>
            <label>날짜</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
          </div>
        </div>
        <div className="fr">
          <div>
            <label>메모 (선택)</label>
            <input value={memo} onChange={e=>setMemo(e.target.value)} placeholder="예: 재입고 / 파손 폐기" />
          </div>
        </div>
        <div style={{fontSize:13,textAlign:"center",padding:"8px",background:"#f5f5f7",borderRadius:7,margin:"4px 0 2px"}}>
          재고 {cur} → <b style={{color: after < 0 ? "#e03131" : "#1a1a1a"}}>{after}</b>개
        </div>
        <div className="mf">
          <button className="btn bs" onClick={close}>취소</button>
          <button className="btn bp" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

// ─── 상품 추가 / 수정 ───
function ItemEditModal({ modal, data, persist, close, toast }) {
  const ed = modal.edit || null;
  const inv = data.inventory || [];
  const [sku, setSku] = useState(ed?.sku || nextSku(inv));
  const [name_ko, setNameKo] = useState(ed?.name_ko || "");
  const [name_de, setNameDe] = useState(ed?.name_de || "");
  const [sumup_name, setSumup] = useState(ed?.sumup_name || "");
  const [category, setCategory] = useState(ed?.category || "키링");
  const [supplier, setSupplier] = useState(ed?.supplier || "");
  const [options, setOptions] = useState(ed?.options || "");
  const [cost_krw, setCost] = useState(ed?.cost_krw ?? "");
  const [landed_krw, setLanded] = useState(ed?.landed_krw ?? "");
  const [price_eur, setPrice] = useState(ed?.price_eur ?? "");
  const [active, setActive] = useState(ed ? ed.active !== false : true);

  const save = async () => {
    if (!name_ko.trim()) { toast("상품명을 입력하세요"); return; }
    if (!sku.trim()) { toast("SKU를 입력하세요"); return; }
    const entry = {
      ...(ed || {}),
      sku: sku.trim(), name_ko: name_ko.trim(), name_de: name_de.trim(),
      sumup_name: sumup_name.trim() || (name_de.trim() ? `${name_de.trim()} (${name_ko.trim()})` : name_ko.trim()),
      category, supplier: supplier.trim(), options: options.trim(),
      cost_krw: Number(cost_krw) || 0,
      landed_krw: Number(landed_krw) || Math.round((Number(cost_krw) || 0) * 1.3),
      price_eur: Number(price_eur) || 0,
      active
    };
    let nd;
    if (ed) nd = { ...data, inventory: inv.map(x => x.sku === ed.sku ? entry : x) };
    else {
      if (inv.some(x => x.sku === entry.sku)) { toast("이미 있는 SKU예요"); return; }
      nd = { ...data, inventory: [...inv, entry] };
    }
    await persist(nd);
    close();
    toast(ed ? "상품 수정됨" : "상품 추가됨");
  };

  const del = async () => {
    if (!ed) return;
    if (!confirm(`${ed.name_ko} 상품을 목록에서 숨길까요? (재고 기록은 남습니다)`)) return;
    await persist({ ...data, inventory: inv.map(x => x.sku === ed.sku ? { ...x, active: false } : x) });
    close();
    toast("상품 숨김 처리");
  };

  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>{ed ? "상품 수정" : "상품 추가"}</h3>
        <div className="fr fc2">
          <div><label>SKU</label><input value={sku} onChange={e=>setSku(e.target.value)} disabled={!!ed} /></div>
          <div>
            <label>분류</label>
            <select value={category} onChange={e=>setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="fr"><div><label>상품명 (한글)</label><input value={name_ko} onChange={e=>setNameKo(e.target.value)} placeholder="예: 민트 키티 키링" /></div></div>
        <div className="fr"><div><label>독일어명 (영수증 표기)</label><input value={name_de} onChange={e=>setNameDe(e.target.value)} placeholder="Herz-Anhänger Mint" /></div></div>
        <div className="fr fc2">
          <div><label>거래처</label><input value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder="젤리젤리" /></div>
          <div><label>옵션 (색상 등)</label><input value={options} onChange={e=>setOptions(e.target.value)} placeholder="블랙 1 · 핑크 1" /></div>
        </div>
        <div className="fr fc2">
          <div><label>원가 (₩)</label><input type="number" value={cost_krw} onChange={e=>setCost(e.target.value)} placeholder="3500" /></div>
          <div><label>부대포함 원가 (₩)</label><input type="number" value={landed_krw} onChange={e=>setLanded(e.target.value)} placeholder="비우면 ×1.3" /></div>
        </div>
        <div className="fr"><div><label>판매가 (€)</label><input type="number" value={price_eur} onChange={e=>setPrice(e.target.value)} placeholder="11" /></div></div>
        <label style={{display:"flex",alignItems:"center",gap:7,fontSize:12,color:"#666",cursor:"pointer",marginTop:4}}>
          <input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)} style={{width:"auto"}} />
          판매 중 (끄면 목록에서 숨김)
        </label>
        <div className="mf">
          {ed ? <button className="btn bs" style={{color:"#e03131"}} onClick={del}>숨기기</button> : null}
          <button className="btn bs" onClick={close}>취소</button>
          <button className="btn bp" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

function nextSku(inv) {
  let max = 0;
  (inv || []).forEach(it => { const m = /^HF-(\d+)$/.exec(it.sku || ""); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  return "HF-" + String(max + 1).padStart(3, "0");
}

export { StockMoveModal, ItemEditModal };
