import { useState } from "react";
import { fmtE, nid } from "../../lib/utils";

// 매뉴얼 URL 설정 모달
function ManualSettingsModal({ data, persist, close, toast }) {
  const [url, setUrl] = useState(data.settings?.manualUrl || "");

  const save = async () => {
    await persist({...data, settings: {...(data.settings||{}), manualUrl: url.trim()}});
    close();
    toast("매뉴얼 링크 저장!");
  };

  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h3>📘 매뉴얼 링크 설정</h3>
        <div style={{fontSize:11,color:"#888",marginBottom:10,background:"#f5f5f7",padding:10,borderRadius:6}}>
          💡 Google Docs / Notion 등에 만든 매뉴얼 페이지의 공유 링크를 붙여넣으세요.
          <br/>직원 화면에 "📘 매뉴얼 보기" 버튼이 표시됩니다.
        </div>
        <div className="fr">
          <div>
            <label>매뉴얼 URL</label>
            <input
              type="url"
              value={url}
              onChange={e=>setUrl(e.target.value)}
              placeholder="https://docs.google.com/document/d/..."
            />
          </div>
        </div>
        {url ? (
          <div style={{marginTop:10}}>
            <a href={url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#1971c2"}}>
              🔗 링크 미리 열어보기
            </a>
          </div>
        ) : null}
        <div className="mf">
          <button className="btn bs" onClick={close}>취소</button>
          <button className="btn bp" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

function CsvImportModal({ data, persist, close, toast }) {
  const [parsed, setParsed] = useState(null); // {date: {pc,pk,...}}
  const [affectedKeys, setAffectedKeys] = useState([]); // 이번 업로드에서 영향받는 카테고리 키들
  const [unknown, setUnknown] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [files, setFiles] = useState({ sumup: null, hama: null });

  // 분류 함수: SUMUP의 Beschreibung 보고 카테고리 결정
  const classifySumup = (desc) => {
    const d = (desc || "").toLowerCase();
    // 사진 매출
    if (d.includes("hamafilm") || d.includes("angle")) return "sumup";
    if (d.includes("pass bild") || d.includes("passbild")) return "sumup";
    if (d.includes("stamp coupon") || d.includes("extra foto") || d.includes("dutch pay")) return "sumup";
    if (d.includes("exta") || d.includes("extra")) return "sumup"; // 오타 대응
    // 네일
    if (d.includes("nägel") || d.includes("nagel") || d.includes("nail")) return "nail";
    // 조이스보물
    if (d.includes("zoesbomul") || d.includes("zoes") || d.includes("조이스")) return "joys";
    // 악세서리
    if (d.includes("accessor") || d.includes("clothing") ||
        d.includes("key ring") || d.includes("keyring") ||
        d.includes("keychain") || d.includes("kette") ||
        d.includes("schmuck")) return "acc";
    return "unknown";
  };

  const parseAmt = (s) => {
    if (!s) return 0;
    return parseFloat(String(s).replace(",", ".").replace(/[^\d.\-]/g, "")) || 0;
  };

  // CSV 파서 (간단 구현, 따옴표 처리)
  const parseCsv = (text) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const result = [];
    for (const line of lines) {
      const row = [];
      let inQ = false, cur = "";
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQ && line[i+1] === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (c === "," && !inQ) {
          row.push(cur);
          cur = "";
        } else {
          cur += c;
        }
      }
      row.push(cur);
      result.push(row);
    }
    return result;
  };

  const processFiles = async () => {
    if (!files.sumup && !files.hama) {
      toast("최소 한 파일 선택");
      return;
    }
    setParsing(true);
    const dailyData = {}; // {date: {pc,pk,...}}
    const unknownList = [];
    const ensure = (date) => {
      if (!dailyData[date]) {
        dailyData[date] = {pc:0,pk:0,mc:0,mk:0,ac:0,ak:0,nc:0,nk:0,jc:0,jk:0,sk:0};
      }
      return dailyData[date];
    };

    // 어떤 카테고리(키)들이 이번 업로드에 포함되는지 추적
    // SUMUP만 올렸으면 mc/mk 건드리지 않고, HAMAFILM만 올렸으면 pc/pk/ac/ak/nc/nk/jc/jk 건드리지 않음
    const affectedKeys = new Set();

    // SUMUP 처리
    if (files.sumup) {
      // SUMUP은 사진/악세/네일/조이스 카테고리에 영향
      ["pc","pk","ac","ak","nc","nk","jc","jk"].forEach(k => affectedKeys.add(k));

      const text = await files.sumup.text();
      const rows = parseCsv(text);
      if (rows.length > 0) {
        const headers = rows[0].map(h => h.trim());
        const idx = (name) => headers.indexOf(name);
        const iDate = idx("Datum");
        const iTyp = idx("Typ");
        const iMethod = idx("Zahlungsmethode");
        const iDesc = idx("Beschreibung");
        const iAmount = idx("Preis (brutto)");
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r[iDate]) continue;
          const dpart = r[iDate].split(",")[0].trim();
          const m = dpart.match(/(\d{2})\.(\d{2})\.(\d{4})/);
          if (!m) continue;
          const date = `${m[3]}-${m[2]}-${m[1]}`;
          let amt = parseAmt(r[iAmount]);
          // 환불(Rückerstattung)의 경우 CSV에 이미 음수(-)로 기록되어 있음 → 그대로 사용
          const cat = classifySumup(r[iDesc]);
          const isCash = (r[iMethod] || "") === "Bar";
          const day = ensure(date);
          if (cat === "sumup") day[isCash?"pc":"pk"] += amt;
          else if (cat === "acc") day[isCash?"ac":"ak"] += amt;
          else if (cat === "nail") day[isCash?"nc":"nk"] += amt;
          else if (cat === "joys") day[isCash?"jc":"jk"] += amt;
          else { unknownList.push({desc: r[iDesc], date, amount: amt}); day[isCash?"pc":"pk"] += amt; }
        }
      }
    }

    // HAMAFILM 처리
    if (files.hama) {
      // HAMAFILM은 기계 카테고리에만 영향
      ["mc","mk"].forEach(k => affectedKeys.add(k));

      const text = await files.hama.text();
      const rows = parseCsv(text);
      if (rows.length > 0) {
        const headers = rows[0].map(h => h.trim().replace(/^\uFEFF/, ""));
        const idx = (name) => headers.indexOf(name);
        const iDate = idx("거래일");
        const iMethod = idx("결재방식");
        const iAmount = idx("금액");
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r[iDate]) continue;
          const date = r[iDate].slice(0, 10);
          const amt = parseAmt(r[iAmount]);
          const method = r[iMethod] || "";
          const day = ensure(date);
          if (method === "현금") day.mc += amt;
          else day.mk += amt;
        }
      }
    }

    // 빈 날짜 제거 (모든 영향받는 키가 0인 경우)
    Object.keys(dailyData).forEach(d => {
      let sum = 0;
      affectedKeys.forEach(k => { sum += dailyData[d][k] || 0; });
      if (sum === 0) delete dailyData[d];
    });

    setParsed(dailyData);
    setAffectedKeys([...affectedKeys]);
    setUnknown(unknownList);
    setParsing(false);
  };

  const doImport = async (mode) => {
    // mode: "merge" (기존+신규) 또는 "overwrite" (덮어쓰기)
    if (!parsed) return;
    const fileLabel = files.sumup && files.hama ? "SUMUP + HAMAFILM" :
                       files.sumup ? "SUMUP" : "HAMAFILM";
    if (!confirm(mode === "overwrite"
      ? `${fileLabel} 카테고리만 덮어쓸까요?\n(다른 카테고리는 그대로 유지됩니다)`
      : `${fileLabel} 데이터를 기존에 더할까요?`)) return;

    let newSales = [...(data.sales||[])];
    let added = 0, updated = 0;

    Object.entries(parsed).forEach(([date, vals]) => {
      const existing = newSales.find(s => s.date === date);
      if (existing) {
        if (mode === "overwrite") {
          // ⚠️ affectedKeys (이번 업로드에 포함된 카테고리)만 덮어씀
          // 다른 카테고리(예: SUMUP만 올렸으면 mc/mk = 기계)는 그대로 유지
          affectedKeys.forEach(k => {
            existing[k] = vals[k] || 0;
          });
          updated++;
        } else {
          // 합산: affectedKeys만 더함
          affectedKeys.forEach(k => {
            existing[k] = (existing[k]||0) + (vals[k]||0);
          });
          updated++;
        }
      } else {
        // 새 날짜 — affectedKeys만 채워서 추가 (나머지는 0)
        const newRow = {
          id: nid(newSales),
          date,
          pc:0,pk:0,mc:0,mk:0,ac:0,ak:0,nc:0,nk:0,jc:0,jk:0,sk:0
        };
        affectedKeys.forEach(k => {
          newRow[k] = vals[k] || 0;
        });
        newSales.push(newRow);
        added++;
      }
    });

    await persist({...data, sales: newSales});
    close();
    toast(`✅ ${added}일 추가, ${updated}일 ${mode==="overwrite"?"덮어씀":"합산"}!`);
  };

  // 미리보기 합계
  const totals = parsed ? Object.values(parsed).reduce((acc, day) => {
    Object.keys(day).forEach(k => acc[k] = (acc[k]||0) + day[k]);
    return acc;
  }, {}) : null;

  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" style={{maxWidth:560}}>
        <h3>📥 CSV 자동 매출 입력</h3>

        {!parsed ? (
          <>
            <div style={{fontSize:11,color:"#666",marginBottom:12,background:"#f5f5f7",padding:10,borderRadius:6}}>
              💡 SUMUP 매출보고서와 HAMAFILM 거래내역 CSV를 업로드하면<br/>
              자동으로 카테고리별로 분류해서 매출에 입력합니다.
            </div>

            <div className="fr">
              <div>
                <label>💳 SUMUP CSV (Verkaufsbericht...)</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={e => setFiles(f => ({...f, sumup: e.target.files[0]}))}
                  style={{padding:6}}
                />
                {files.sumup ? (
                  <div style={{fontSize:10,color:"#20a060",marginTop:3}}>
                    ✓ {files.sumup.name}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="fr">
              <div>
                <label>🖨 HAMAFILM CSV (루센트-매출관리...)</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={e => setFiles(f => ({...f, hama: e.target.files[0]}))}
                  style={{padding:6}}
                />
                {files.hama ? (
                  <div style={{fontSize:10,color:"#20a060",marginTop:3}}>
                    ✓ {files.hama.name}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mf">
              <button className="btn bs" onClick={close}>취소</button>
              <button className="btn bp" onClick={processFiles} disabled={parsing}>
                {parsing ? "분석중..." : "📊 분석하기"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{fontSize:12,color:"#666",marginBottom:10}}>
              📊 분석 완료 — 아래 내용 확인 후 입력하세요
            </div>

            {/* 영향받는 카테고리 안내 */}
            <div style={{background:"rgba(46,213,115,.1)",border:"1px solid rgba(46,213,115,.3)",borderRadius:8,padding:"10px 12px",marginBottom:10,fontSize:11}}>
              <div style={{color:"#20a060",fontWeight:700,marginBottom:4}}>
                ✅ 이번 업로드는 다음 카테고리만 영향:
              </div>
              <div style={{color:"#666"}}>
                {files.sumup ? "💳 SUMUP, 💍 악세서리, 💅 네일, 💎 조이스보물 " : ""}
                {files.hama ? "🖨 기계 " : ""}
              </div>
              <div style={{color:"#888",fontSize:10,marginTop:3}}>
                💡 다른 카테고리(슈킹{!files.hama ? ", 기계" : ""}{!files.sumup ? ", SUMUP/악세/네일/조이스" : ""})는 그대로 유지됩니다
              </div>
            </div>

            {/* 합계 미리보기 */}
            {totals ? (
              <div style={{background:"#e7f5ff",border:"1px solid #4dabf7",borderRadius:8,padding:12,marginBottom:10,fontSize:12}}>
                <div style={{fontWeight:700,color:"#1971c2",marginBottom:6}}>📈 카테고리별 합계</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,fontFamily:"monospace"}}>
                  <div>💳 SUMUP: €{fmtE(totals.pc + totals.pk)}</div>
                  <div style={{fontSize:10,color:"#666"}}>현 €{fmtE(totals.pc)} / 카 €{fmtE(totals.pk)}</div>
                  <div>🖨 기계: €{fmtE(totals.mc + totals.mk)}</div>
                  <div style={{fontSize:10,color:"#666"}}>현 €{fmtE(totals.mc)} / 카 €{fmtE(totals.mk)}</div>
                  <div>💍 악세서리: €{fmtE(totals.ac + totals.ak)}</div>
                  <div style={{fontSize:10,color:"#666"}}>현 €{fmtE(totals.ac)} / 카 €{fmtE(totals.ak)}</div>
                  <div>💅 네일: €{fmtE(totals.nc + totals.nk)}</div>
                  <div style={{fontSize:10,color:"#666"}}>현 €{fmtE(totals.nc)} / 카 €{fmtE(totals.nk)}</div>
                  <div>💎 조이스보물: €{fmtE(totals.jc + totals.jk)}</div>
                  <div style={{fontSize:10,color:"#666"}}>현 €{fmtE(totals.jc)} / 카 €{fmtE(totals.jk)}</div>
                </div>
                <div style={{borderTop:"1px solid #4dabf7",marginTop:8,paddingTop:6,display:"flex",justifyContent:"space-between",fontWeight:700,color:"#1971c2"}}>
                  <span>총합 ({Object.keys(parsed).length}일):</span>
                  <span className="mn">€{fmtE(Object.values(totals).reduce((a,b)=>a+b,0))}</span>
                </div>
              </div>
            ) : null}

            {/* 일별 미리보기 */}
            <div style={{maxHeight:200,overflowY:"auto",border:"1px solid #e0e0e0",borderRadius:6,padding:6,marginBottom:10,fontSize:11,fontFamily:"monospace"}}>
              {Object.keys(parsed).sort().map(date => {
                const d = parsed[date];
                const sum = Object.values(d).reduce((a,b)=>a+b,0);
                const existing = (data.sales||[]).find(s => s.date === date);
                return (
                  <div key={date} style={{
                    display:"flex",
                    justifyContent:"space-between",
                    padding:"3px 6px",
                    background: existing ? "rgba(255,212,0,.15)" : "transparent",
                    borderRadius:3
                  }}>
                    <span>{date} {existing ? "⚠️" : ""}</span>
                    <span>€{fmtE(sum)}</span>
                  </div>
                );
              })}
            </div>
            <div style={{fontSize:10,color:"#888",marginBottom:10}}>
              ⚠️ 표시 = 이미 매출이 있는 날짜
            </div>

            {/* 미분류 항목 경고 */}
            {unknown.length > 0 ? (
              <div style={{background:"rgba(255,212,0,.15)",border:"1px solid #ffd400",borderRadius:6,padding:8,marginBottom:10,fontSize:11}}>
                <strong style={{color:"#b8860b"}}>⚠️ 분류 불명확 ({unknown.length}건) — SUMUP 매출로 처리됨:</strong>
                <div style={{marginTop:4,maxHeight:60,overflowY:"auto"}}>
                  {unknown.map((u, i) => (
                    <div key={i} style={{color:"#666"}}>
                      {u.date} · "{u.desc}" · €{fmtE(u.amount)}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mf" style={{flexWrap:"wrap"}}>
              <button className="btn bs" onClick={()=>setParsed(null)}>← 다시</button>
              <button className="btn bs" onClick={close}>취소</button>
              <button className="btn bd sm" onClick={()=>doImport("overwrite")}>덮어쓰기</button>
              <button className="btn bp" onClick={()=>doImport("merge")}>합산 입력</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export { ManualSettingsModal, CsvImportModal };
