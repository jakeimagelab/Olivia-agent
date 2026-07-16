"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Edit2, Package } from "lucide-react";

const C = { teal:"#155855", orange:"#E85D2C", green:"#22876A", bg:"#F0F9F8", white:"#FFFFFF", border:"rgba(21,88,85,.12)", muted:"#5A7470", hint:"#9BB5B0", txt:"#1C2B28", light:"#EAF4F2" };

const CATEGORIES = ["전체","의료진 이미지","병원 공간 소품","향기/공간 경험","고객 응대","VIP 선물","촬영 준비 제품","포토클리닉 굿즈","별도 문의 상품"];
const STATUS_LABEL: Record<string,string> = { active:"판매 중", hidden:"비공개", sold_out:"품절", inquiry_only:"별도 문의" };
const STATUS_COLOR: Record<string,string> = { active:C.green, hidden:C.hint, sold_out:"#EF4444", inquiry_only:C.orange };

const EMPTY_FORM = { name:"", category:"의료진 이미지", description:"", price:"", required_points:"", stock:"999", supplier:"", shipping_fee:"0", status:"active", is_featured:false, admin_memo:"", image_url:"" };
const iS: React.CSSProperties = { width:"100%", border:`1.5px solid ${C.border}`, borderRadius:8, padding:"0 12px", height:40, fontSize:13, outline:"none", background:C.white, color:C.txt, fontFamily:"inherit", boxSizing:"border-box" };
const taS: React.CSSProperties = { ...iS, height:"auto", padding:"10px 12px", resize:"vertical" };

export default function PerProductsPage() {
  const [products,  setProducts]  = useState<any[]>([]);
  const [cat,       setCat]       = useState("전체");
  const [statusF,   setStatusF]   = useState("전체");
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(false);
  const [editing,   setEditing]   = useState<any>(null);
  const [form,      setForm]      = useState<any>(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);

  const load = () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (cat !== "전체") p.set("category", cat);
    if (statusF !== "전체") p.set("status", statusF);
    fetch(`/api/per/products?${p}`).then(r => r.json()).then(d => setProducts(d.products ?? [])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [cat, statusF]);

  const openAdd  = () => { setEditing(null); setForm(EMPTY_FORM); setModal(true); };
  const openEdit = (p: any) => {
    setEditing(p);
    setForm({ name:p.name, category:p.category, description:p.description, price:String(p.price), required_points:String(p.required_points), stock:String(p.stock), supplier:p.supplier, shipping_fee:String(p.shipping_fee), status:p.status, is_featured:p.is_featured, admin_memo:p.admin_memo, image_url:p.image_url });
    setModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const body = { ...form, price:Number(form.price), required_points:Number(form.required_points), stock:Number(form.stock), shipping_fee:Number(form.shipping_fee) };
    if (editing) {
      await fetch("/api/per/products", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id:editing.id, ...body }) });
    } else {
      await fetch("/api/per/products", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
    }
    setSaving(false);
    setModal(false);
    load();
  };

  return (
    <main style={{ minHeight:"100vh", background:C.bg, color:C.txt }}>
      <header className="pc-header">
        <div className="pc-header-left">
          <div className="pc-header-brand">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">리워드 카탈로그</span>
          </div>
        </div>
        <div className="pc-header-actions">
          <button onClick={openAdd} className="pc-btn pc-btn--orange pc-btn--sm">
            <Plus size={13}/> 제품 등록
          </button>
        </div>
      </header>

      <div style={{ maxWidth:1000, margin:"0 auto", padding:"24px 20px 100px" }}>
        {/* 필터 */}
        <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCat(c)} className={`pc-btn pc-btn--sm ${cat===c ? "pc-btn--primary" : "pc-btn--ghost"}`}>{c}</button>
          ))}
        </div>
        <div style={{ display:"flex", gap:6, marginBottom:20 }}>
          {["전체","active","hidden","sold_out","inquiry_only"].map(s => (
            <button key={s} onClick={() => setStatusF(s)} className={`pc-btn pc-btn--sm ${statusF===s ? "pc-btn--orange" : "pc-btn--ghost"}`}>
              {STATUS_LABEL[s] ?? s}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign:"center", padding:40, color:C.hint }}>로딩 중...</div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
            {products.map((p: any) => (
              <div key={p.id} style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, overflow:"hidden", position:"relative" }}>
                {p.is_featured && <div style={{ position:"absolute", top:10, left:10, background:C.orange, color:"#fff", fontSize:10, fontWeight:700, borderRadius:4, padding:"2px 7px" }}>추천</div>}
                <div style={{ background:C.light, height:140, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {p.image_url ? <img src={p.image_url} alt={p.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : <Package size={36} color={C.hint} />}
                </div>
                <div style={{ padding:"14px 16px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                    <div>
                      <div style={{ fontSize:10, color:C.muted, fontWeight:600 }}>{p.category}</div>
                      <div style={{ fontSize:14, fontWeight:700, color:C.txt, marginTop:2 }}>{p.name}</div>
                    </div>
                    <span style={{ fontSize:10, background:`${STATUS_COLOR[p.status]}20`, color:STATUS_COLOR[p.status], borderRadius:4, padding:"2px 7px", fontWeight:700, whiteSpace:"nowrap" }}>{STATUS_LABEL[p.status]}</span>
                  </div>
                  <div style={{ fontSize:12, color:C.muted, marginBottom:10, lineHeight:1.5 }}>{p.description}</div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <span style={{ fontSize:16, fontWeight:800, color:C.green }}>{p.required_points?.toLocaleString()}P</span>
                      {p.price > 0 && <span style={{ fontSize:11, color:C.hint, marginLeft:6 }}>({p.price?.toLocaleString()}원)</span>}
                    </div>
                    <button onClick={() => openEdit(p)} className="pc-btn pc-btn--secondary pc-btn--sm">
                      <Edit2 size={11}/> 수정
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {products.length === 0 && <div style={{ gridColumn:"1/-1", textAlign:"center", padding:40, color:C.hint, fontSize:13 }}>등록된 제품이 없습니다.</div>}
          </div>
        )}
      </div>

      {/* 등록/수정 모달 */}
      {modal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }} onClick={() => setModal(false)}>
          <div style={{ background:C.white, borderRadius:16, padding:28, width:480, maxWidth:"95vw", maxHeight:"90vh", overflow:"auto" }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin:"0 0 20px", fontSize:16, fontWeight:800 }}>{editing?"제품 수정":"제품 등록"}</h2>
            {[
              { label:"제품명", key:"name", type:"text" },
              { label:"이미지 URL", key:"image_url", type:"text" },
              { label:"가격(원)", key:"price", type:"number" },
              { label:"필요 포인트", key:"required_points", type:"number" },
              { label:"재고", key:"stock", type:"number" },
              { label:"공급처", key:"supplier", type:"text" },
              { label:"배송비(원)", key:"shipping_fee", type:"number" },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:4 }}>{f.label}</label>
                <input type={f.type} value={form[f.key]} onChange={e => setForm((p:any) => ({ ...p, [f.key]:e.target.value }))} style={iS} />
              </div>
            ))}
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:4 }}>카테고리</label>
              <select value={form.category} onChange={e => setForm((p:any) => ({ ...p, category:e.target.value }))} style={iS}>
                {CATEGORIES.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:4 }}>상태</label>
              <select value={form.status} onChange={e => setForm((p:any) => ({ ...p, status:e.target.value }))} style={iS}>
                {Object.entries(STATUS_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:4 }}>설명</label>
              <textarea value={form.description} onChange={e => setForm((p:any) => ({ ...p, description:e.target.value }))} rows={3} style={taS} />
            </div>
            <div style={{ marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
              <input type="checkbox" id="featured" checked={form.is_featured} onChange={e => setForm((p:any) => ({ ...p, is_featured:e.target.checked }))} />
              <label htmlFor="featured" style={{ fontSize:13, fontWeight:600 }}>추천 제품으로 표시</label>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setModal(false)} className="pc-btn pc-btn--secondary" style={{ flex:1 }}>취소</button>
              <button onClick={handleSave} disabled={saving} className="pc-btn pc-btn--primary" style={{ flex:2 }}>{saving?"저장 중...":"저장"}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
