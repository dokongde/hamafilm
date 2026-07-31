import { useState } from "react";
import { todayStr } from "../../lib/utils";

// CSV 자동 매출 입력 모달
// 체크리스트 실행 모달 (직원용)
function ChecklistRunModal({ modal, data, persist, close, toast, gSt }) {
  const checklist = (data.checklists||[]).find(c => c.id === modal.checklistId);
  const staff = gSt(modal.staffId);
  const today = todayStr();

  // 오늘 이 체크리스트의 기존 완료 기록 (있으면 이어서)
  const existing = (data.completions||[]).find(c =>
    c.checklistId === modal.checklistId &&
    c.date === today &&
    c.staffId === modal.staffId
  );

  const [checked, setChecked] = useState(new Set(existing?.checkedItems || []));
  const [note, setNote] = useState(existing?.note || "");

  if (!checklist) {
    return (
      <div className="ov" onClick={close}>
        <div className="modal"><h3>체크리스트 없음</h3><div className="mf"><button className="btn bs" onClick={close}>닫기</button></div></div>
      </div>
    );
  }

  const toggle = (id) => {
    const s = new Set(checked);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setChecked(s);
  };

  const save = async () => {
    const allChecked = checklist.items.every(i => checked.has(i.id));
    const entry = {
      id: existing?.id || Date.now(),
      checklistId: modal.checklistId,
      staffId: modal.staffId,
      staffName: staff?.name || "?",
      date: today,
      checkedItems: [...checked],
      totalItems: checklist.items.length,
      complete: allChecked,
      note,
      completedAt: new Date().toISOString()
    };
    let nd;
    if (existing) {
      nd = {...data, completions: (data.completions||[]).map(c => c.id===existing.id ? entry : c)};
    } else {
      nd = {...data, completions: [...(data.completions||[]), entry]};
    }
    await persist(nd);
    close();
    toast(allChecked ? `✅ ${checklist.name} 완료!` : "💾 진행상황 저장됨");
  };

  const checkAll = () => setChecked(new Set(checklist.items.map(i => i.id)));
  const uncheckAll = () => setChecked(new Set());

  const progress = checklist.items.length > 0
    ? Math.round([...checked].filter(id => checklist.items.find(i => i.id === id)).length / checklist.items.length * 100)
    : 0;

  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" style={{maxWidth:480}}>
        <h3>{checklist.icon} {checklist.name} 체크리스트</h3>
        <div style={{fontSize:11,color:"#888",marginBottom:10}}>
          {staff?.name} · {today}
        </div>

        {/* 진행률 바 */}
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
            <span style={{fontSize:11,color:"#666",fontWeight:600}}>
              {[...checked].filter(id => checklist.items.find(i => i.id === id)).length} / {checklist.items.length} 완료
            </span>
            <span style={{fontSize:11,color: progress === 100 ? "#20a060" : "#1971c2",fontWeight:700}}>
              {progress}%
            </span>
          </div>
          <div style={{background:"#f0f0f0",borderRadius:4,height:6,overflow:"hidden"}}>
            <div style={{
              height:"100%",
              width: progress + "%",
              background: progress === 100 ? "#2ed573" : "#4dabf7",
              transition:"width .3s"
            }} />
          </div>
        </div>

        {/* 액션 버튼 */}
        <div style={{display:"flex",gap:5,marginBottom:10}}>
          <button className="btn bs sm" onClick={checkAll} style={{flex:1}}>✓ 모두 체크</button>
          <button className="btn bs sm" onClick={uncheckAll} style={{flex:1}}>✗ 모두 해제</button>
        </div>

        {/* 체크 항목들 */}
        <div style={{maxHeight:300,overflowY:"auto",marginBottom:10}}>
          {checklist.items.map(item => {
            const isChecked = checked.has(item.id);
            return (
              <div
                key={item.id}
                onClick={()=>toggle(item.id)}
                style={{
                  display:"flex",
                  alignItems:"center",
                  gap:10,
                  padding:"10px 12px",
                  background: isChecked ? "rgba(46,213,115,.1)" : "#f5f5f7",
                  border: isChecked ? "1px solid #2ed573" : "1px solid transparent",
                  borderRadius:7,
                  marginBottom:5,
                  cursor:"pointer",
                  transition:"all .15s"
                }}>
                <div style={{
                  width:22,height:22,borderRadius:5,
                  background: isChecked ? "#2ed573" : "#fff",
                  border: isChecked ? "none" : "2px solid #d0d0d0",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  flexShrink:0,
                  color:"#fff",fontSize:12,fontWeight:700
                }}>
                  {isChecked ? "✓" : ""}
                </div>
                <span style={{
                  fontSize:13,
                  color: isChecked ? "#888" : "#1a1a1a",
                  textDecoration: isChecked ? "line-through" : "none"
                }}>
                  {item.text}
                </span>
              </div>
            );
          })}
        </div>

        {/* 메모 */}
        <div className="fr">
          <div>
            <label>📝 메모 (선택사항 — 사장님께 전달)</label>
            <input
              value={note}
              onChange={e=>setNote(e.target.value)}
              placeholder="예: 카메라 1번 렌즈 고장, 휴지 부족"
            />
          </div>
        </div>

        <div className="mf">
          <button className="btn bs" onClick={close}>나가기</button>
          <button className="btn bp" onClick={save}>
            {progress === 100 ? "✅ 완료" : "💾 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// 체크리스트 관리 모달 (관리자가 항목 편집)
function ChecklistManageModal({ data, persist, close, toast }) {
  const [editingList, setEditingList] = useState(null); // 현재 편집 중인 체크리스트 객체
  const [newItemText, setNewItemText] = useState("");

  // 새 체크리스트 추가
  const addList = async () => {
    const name = prompt("체크리스트 이름 (예: 청소, 비품관리)");
    if (!name) return;
    const icon = prompt("이모지 1개 (예: 🧹, 📦, ⚠️)", "📋") || "📋";
    const typeAns = prompt(
      "언제 보여줄까요?\n\n" +
      "1 = 🌅 오프닝 시프트일 때만\n" +
      "2 = 🌙 클로징 시프트일 때만\n" +
      "3 = 항상 (오프닝/클로징 상관없이)",
      "3"
    );
    const type = typeAns === "1" ? "opening" : typeAns === "2" ? "closing" : "all";
    const newList = {
      id: Date.now(),
      name,
      icon,
      type,
      order: (data.checklists||[]).length + 1,
      items: []
    };
    await persist({...data, checklists: [...(data.checklists||[]), newList]});
    setEditingList(newList);
  };

  // 체크리스트 삭제
  const removeList = async (id) => {
    if (!confirm("이 체크리스트를 삭제할까요? (지난 기록은 그대로 유지)")) return;
    await persist({...data, checklists: (data.checklists||[]).filter(c => c.id !== id)});
    if (editingList?.id === id) setEditingList(null);
    toast("삭제됨");
  };

  // 항목 추가
  const addItem = async () => {
    if (!newItemText.trim() || !editingList) return;
    const newItem = { id: Date.now(), text: newItemText.trim() };
    const updatedList = { ...editingList, items: [...editingList.items, newItem] };
    setEditingList(updatedList);
    await persist({...data, checklists: (data.checklists||[]).map(c => c.id === editingList.id ? updatedList : c)});
    setNewItemText("");
  };

  // 항목 삭제
  const removeItem = async (itemId) => {
    if (!editingList) return;
    const updatedList = { ...editingList, items: editingList.items.filter(i => i.id !== itemId) };
    setEditingList(updatedList);
    await persist({...data, checklists: (data.checklists||[]).map(c => c.id === editingList.id ? updatedList : c)});
  };

  // 항목 수정
  const editItem = async (itemId) => {
    const item = editingList.items.find(i => i.id === itemId);
    if (!item) return;
    const newText = prompt("수정", item.text);
    if (!newText || newText === item.text) return;
    const updatedList = {
      ...editingList,
      items: editingList.items.map(i => i.id === itemId ? {...i, text: newText} : i)
    };
    setEditingList(updatedList);
    await persist({...data, checklists: (data.checklists||[]).map(c => c.id === editingList.id ? updatedList : c)});
  };

  // 체크리스트 이름/아이콘 변경
  const editListMeta = async () => {
    if (!editingList) return;
    const name = prompt("이름 변경", editingList.name);
    if (!name) return;
    const icon = prompt("이모지", editingList.icon) || editingList.icon;
    const curType = editingList.type || "all";
    const curTypeNum = curType === "opening" ? "1" : curType === "closing" ? "2" : "3";
    const typeAns = prompt(
      "언제 보여줄까요?\n\n" +
      "1 = 🌅 오프닝 시프트일 때만\n" +
      "2 = 🌙 클로징 시프트일 때만\n" +
      "3 = 항상",
      curTypeNum
    );
    const type = typeAns === "1" ? "opening" : typeAns === "2" ? "closing" : typeAns === "3" ? "all" : curType;
    const updated = {...editingList, name, icon, type};
    setEditingList(updated);
    await persist({...data, checklists: (data.checklists||[]).map(c => c.id === editingList.id ? updated : c)});
  };

  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" style={{maxWidth:520}}>
        <h3>📋 체크리스트 관리</h3>

        {!editingList ? (
          <>
            <div style={{fontSize:11,color:"#888",marginBottom:10}}>
              💡 체크리스트를 클릭해서 편집하거나 새로 만드세요
            </div>
            {(data.checklists||[]).map(cl => (
              <div key={cl.id} style={{
                background:"#f5f5f7",
                borderRadius:7,
                padding:"10px 12px",
                marginBottom:6,
                display:"flex",
                alignItems:"center",
                justifyContent:"space-between",
                cursor:"pointer"
              }}
              onClick={()=>setEditingList(cl)}>
                <div>
                  <span style={{fontSize:18,marginRight:6}}>{cl.icon}</span>
                  <strong>{cl.name}</strong>
                  <span style={{
                    fontSize:9,
                    marginLeft:6,
                    padding:"2px 6px",
                    borderRadius:3,
                    fontWeight:700,
                    background: cl.type === "opening" ? "rgba(245,197,24,.25)" : cl.type === "closing" ? "rgba(165,94,234,.2)" : "rgba(77,171,247,.15)",
                    color: cl.type === "opening" ? "#b8860b" : cl.type === "closing" ? "#7950f2" : "#1971c2"
                  }}>
                    {cl.type === "opening" ? "🌅 오프닝" : cl.type === "closing" ? "🌙 클로징" : "전체"}
                  </span>
                  <span style={{fontSize:11,color:"#888",marginLeft:6}}>{cl.items.length}개 항목</span>
                </div>
                <div style={{display:"flex",gap:4}}>
                  <button className="btn bs sm" onClick={e=>{e.stopPropagation(); setEditingList(cl);}}>편집</button>
                  <button className="btn bd sm" onClick={e=>{e.stopPropagation(); removeList(cl.id);}}>삭제</button>
                </div>
              </div>
            ))}
            <button className="btn bp" style={{width:"100%",marginTop:10}} onClick={addList}>
              + 새 체크리스트
            </button>
            <div className="mf">
              <button className="btn bs" onClick={close}>닫기</button>
            </div>
          </>
        ) : (
          <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <button className="btn bs sm" onClick={()=>setEditingList(null)}>← 뒤로</button>
              <button className="btn bs sm" onClick={editListMeta}>이름 변경</button>
            </div>
            <div style={{fontSize:16,fontWeight:700,marginBottom:10}}>
              {editingList.icon} {editingList.name}
            </div>

            <div style={{maxHeight:300,overflowY:"auto",marginBottom:10}}>
              {editingList.items.length === 0 ? (
                <div style={{textAlign:"center",color:"#aaa",padding:20,fontSize:12}}>아직 항목이 없어요</div>
              ) : editingList.items.map((item, idx) => (
                <div key={item.id} style={{
                  display:"flex",
                  alignItems:"center",
                  gap:8,
                  padding:"7px 10px",
                  background:"#f5f5f7",
                  borderRadius:6,
                  marginBottom:4
                }}>
                  <span style={{fontSize:11,color:"#888",width:18}}>{idx+1}.</span>
                  <span style={{flex:1,fontSize:13}}>{item.text}</span>
                  <button className="btn bs sm" onClick={()=>editItem(item.id)}>✏️</button>
                  <button className="btn bd sm" onClick={()=>removeItem(item.id)}>🗑</button>
                </div>
              ))}
            </div>

            <div style={{display:"flex",gap:5,marginBottom:10}}>
              <input
                value={newItemText}
                onChange={e=>setNewItemText(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter") addItem();}}
                placeholder="새 항목 입력 후 Enter"
                style={{flex:1}}
              />
              <button className="btn bp" onClick={addItem}>추가</button>
            </div>

            <div className="mf">
              <button className="btn bs" onClick={close}>완료</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export { ChecklistRunModal, ChecklistManageModal };
