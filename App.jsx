import React, { useEffect, useMemo, useState } from "react";
import { KeyRound, ShieldCheck, Copy, LogOut, Plus, Trash2, RefreshCw, Boxes, History, LockKeyhole } from "lucide-react";
import { configured, supabase } from "./supabase";

const getDeviceId = () => {
  let id = localStorage.getItem("key-dispenser-device");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("key-dispenser-device", id);
  }
  return id;
};

export default function App() {
  const [tab, setTab] = useState("claim");
  const [deviceId] = useState(getDeviceId);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastKey, setLastKey] = useState("");
  const [remaining, setRemaining] = useState(null);
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [keys, setKeys] = useState([]);
  const [claims, setClaims] = useState([]);
  const [newKeys, setNewKeys] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const notify = (text) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 4500);
  };

  async function refreshPublic() {
    if (!configured) return;
    const { data, error } = await supabase.rpc("get_my_claim_status", { p_device_id: deviceId });
    if (!error && data) setRemaining(data.remaining);
  }

  async function claimKey() {
    if (!configured) return notify("Bạn cần cấu hình Supabase trước.");
    setBusy(true);
    setLastKey("");
    const { data, error } = await supabase.rpc("claim_key", { p_device_id: deviceId });
    setBusy(false);
    if (error) return notify(error.message);
    if (!data?.ok) {
      setRemaining(data?.remaining ?? 0);
      return notify(data?.message || "Hiện không có Key khả dụng.");
    }
    setLastKey(data.key);
    setRemaining(data.remaining);
    notify("Nhận Key thành công!");
  }

  async function signIn(e) {
    e.preventDefault();
    if (!configured) return notify("Bạn cần cấu hình Supabase trước.");
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return notify("Đăng nhập thất bại: " + error.message);
    setSession(data.session);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setIsAdmin(false);
    setTab("claim");
  }

  async function loadAdmin() {
    if (!session) return;
    const { data: admin, error: adminError } = await supabase
      .from("admin_users").select("user_id").eq("user_id", session.user.id).maybeSingle();
    if (adminError || !admin) {
      setIsAdmin(false);
      notify("Tài khoản này chưa được cấp quyền Admin.");
      return;
    }
    setIsAdmin(true);
    const [{ data: keyRows }, { data: claimRows }] = await Promise.all([
      supabase.from("keys").select("id,key_value,status,created_at,used_at").order("created_at", { ascending: false }),
      supabase.from("claims").select("id,key_value,device_label,claimed_at").order("claimed_at", { ascending: false }).limit(100)
    ]);
    setKeys(keyRows || []);
    setClaims(claimRows || []);
  }

  async function addKeys(e) {
    e.preventDefault();
    const values = [...new Set(newKeys.split(/\r?\n/).map(x => x.trim()).filter(Boolean))];
    if (!values.length) return notify("Hãy nhập ít nhất một Key.");
    const { error } = await supabase.from("keys").insert(values.map(key_value => ({ key_value })));
    if (error) return notify(error.message);
    setNewKeys("");
    notify(`Đã thêm ${values.length} Key.`);
    loadAdmin();
  }

  async function deleteKey(id) {
    if (!confirm("Bạn chắc chắn muốn xóa Key này?")) return;
    const { error } = await supabase.from("keys").delete().eq("id", id).eq("status", "available");
    if (error) return notify(error.message);
    notify("Đã xóa Key chưa phát.");
    loadAdmin();
  }

  useEffect(() => {
    if (!configured) return;
    refreshPublic();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) loadAdmin(); }, [session]);

  const availableCount = useMemo(() => keys.filter(k => k.status === "available").length, [keys]);
  const usedCount = keys.length - availableCount;

  return <main className="shell">
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-icon"><KeyRound size={20}/></span><span>KEY<span className="accent">HUB</span></span></a>
      <div className="top-actions">
        <button className={tab === "claim" ? "nav active" : "nav"} onClick={() => setTab("claim")}>Nhận Key</button>
        <button className={tab === "admin" ? "nav active" : "nav"} onClick={() => setTab("admin")}>Quản trị</button>
      </div>
    </header>

    {!configured && <div className="notice warning">Chưa cấu hình Supabase. Hãy tạo file <code>.env</code> theo hướng dẫn trong README.</div>}
    {message && <div className="toast">{message}</div>}

    {tab === "claim" && <section className="hero">
      <div className="eyebrow"><span className="pulse"/> HỆ THỐNG PHÁT KEY TỰ ĐỘNG</div>
      <h1>Nhận Key<br/><span className="gradient">nhanh chóng.</span></h1>
      <p className="subtitle">Nhấn nút bên dưới để hệ thống cấp một Key chưa được sử dụng.</p>
      <div className="claim-card">
        <div className="card-top"><div className="round-icon"><KeyRound size={22}/></div><span className="secure"><ShieldCheck size={15}/> Cấp phát tự động</span></div>
        <div className="key-area">
          {lastKey ? <><span className="key-label">KEY CỦA BẠN</span><div className="key-value">{lastKey}</div><button className="copy-btn" onClick={() => {navigator.clipboard.writeText(lastKey); notify("Đã sao chép Key.");}}><Copy size={16}/> Sao chép Key</button></> :
          <div className="empty-key"><LockKeyhole size={26}/><span>Key sẽ hiển thị tại đây</span></div>}
        </div>
        <button className="primary-btn" disabled={busy || !configured} onClick={claimKey}>
          {busy ? <RefreshCw className="spin" size={18}/> : <KeyRound size={18}/>}
          {busy ? "Đang cấp Key..." : "NHẬN KEY NGAY"}
        </button>
        <div className="limit-row"><span>Giới hạn mỗi thiết bị</span><strong>2 Key / 24 giờ</strong></div>
        {remaining !== null && <div className="limit-row"><span>Lượt nhận còn lại</span><strong>{remaining} lượt</strong></div>}
      </div>
      <p className="footnote">Mỗi lần nhấn chỉ cấp một Key. Key đã cấp sẽ không được phát lại.</p>
    </section>}

    {tab === "admin" && <section className="admin-wrap">
      {!session ? <div className="login-card">
        <div className="round-icon"><ShieldCheck size={23}/></div><h2>Đăng nhập Admin</h2>
        <p className="muted">Đăng nhập bằng tài khoản đã được tạo trong Supabase Auth và cấp quyền quản trị.</p>
        <form onSubmit={signIn} className="stack">
          <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@example.com" required/></label>
          <label>Mật khẩu<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mật khẩu Admin" required/></label>
          <button className="primary-btn" disabled={busy}>ĐĂNG NHẬP</button>
        </form>
      </div> : !isAdmin ? <div className="login-card"><p>Đang kiểm tra quyền Admin...</p></div> :
      <div className="dashboard">
        <div className="dash-heading"><div><div className="eyebrow">CONTROL PANEL</div><h2>Quản lý hệ thống</h2></div><button className="outline-btn" onClick={signOut}><LogOut size={16}/> Đăng xuất</button></div>
        <div className="stats">
          <div className="stat"><Boxes/><span>Tổng Key</span><strong>{keys.length}</strong></div>
          <div className="stat"><KeyRound/><span>Chưa phát</span><strong>{availableCount}</strong></div>
          <div className="stat"><History/><span>Đã phát</span><strong>{usedCount}</strong></div>
        </div>
        <div className="panel">
          <h3><Plus size={18}/> Thêm Key mới</h3><p className="muted">Mỗi dòng là một Key. Key trùng trong cùng lần nhập sẽ tự loại bỏ.</p>
          <form onSubmit={addKeys} className="stack"><textarea value={newKeys} onChange={e=>setNewKeys(e.target.value)} rows="5" placeholder={"KEY-ABC-123\nKEY-XYZ-456"} /><button className="primary-btn"><Plus size={17}/> THÊM VÀO KHO</button></form>
        </div>
        <div className="panel">
          <div className="panel-heading"><h3>Kho Key</h3><button className="icon-btn" onClick={loadAdmin}><RefreshCw size={16}/></button></div>
          <div className="table-wrap"><table><thead><tr><th>Key</th><th>Trạng thái</th><th>Ngày tạo</th><th></th></tr></thead><tbody>
            {keys.map(k=><tr key={k.id}><td className="mono">{k.key_value}</td><td><span className={k.status==="available"?"status green":"status gray"}>{k.status==="available"?"Chưa phát":"Đã phát"}</span></td><td>{new Date(k.created_at).toLocaleString("vi-VN")}</td><td>{k.status==="available"&&<button className="delete-btn" onClick={()=>deleteKey(k.id)}><Trash2 size={15}/></button>}</td></tr>)}
            {!keys.length&&<tr><td colSpan="4" className="empty">Chưa có Key nào.</td></tr>}
          </tbody></table></div>
        </div>
        <div className="panel">
          <div className="panel-heading"><h3>Lịch sử nhận Key gần đây</h3><span className="muted">Tối đa 100 bản ghi</span></div>
          <div className="table-wrap"><table><thead><tr><th>Key đã phát</th><th>Thiết bị</th><th>Thời gian</th></tr></thead><tbody>
            {claims.map(c=><tr key={c.id}><td className="mono">{c.key_value}</td><td>{c.device_label || "Thiết bị"}</td><td>{new Date(c.claimed_at).toLocaleString("vi-VN")}</td></tr>)}
            {!claims.length&&<tr><td colSpan="3" className="empty">Chưa có lịch sử.</td></tr>}
          </tbody></table></div>
        </div>
      </div>}
    </section>}
    <footer>© {new Date().getFullYear()} KEYHUB <span>•</span> Secure key distribution</footer>
  </main>;
}