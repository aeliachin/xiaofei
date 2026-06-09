// 小猫消费 - 邮箱+密码登录版
// 填写你的 Supabase Project URL 和 anon/publishable key。不要填写 service_role/secret key。
const SUPABASE_URL = "https://mhwqsogjmbhdsoafygkd.supabase.co";
const SUPABASE_KEY = "sb_publishable_HpBX5n6gVJoq87l8I02g-Q_y02Sh3y9";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentWallet = "cash";
let records = [];
let selectedIds = new Set();
let editingRecord = null;
let currentUser = null;
let realtimeChannel = null;

const el = (id) => document.getElementById(id);
document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  const { data } = await sb.auth.getSession();
  currentUser = data.session?.user || null;
  sb.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    await renderAuthState();
  });
  await renderAuthState();
}

function bindEvents() {
  el("loginBtn").addEventListener("click", loginWithPassword);
  el("registerBtn").addEventListener("click", registerWithPassword);
  el("logoutBtn").addEventListener("click", logout);
  el("cashTab").addEventListener("click", () => switchWallet("cash"));
  el("cardTab").addEventListener("click", () => switchWallet("card"));
  el("addRechargeBtn").addEventListener("click", () => openModal("recharge"));
  el("addTransferBtn").addEventListener("click", () => openModal("transfer"));
  el("deleteSelectedBtn").addEventListener("click", deleteSelected);
  el("saveBtn").addEventListener("click", saveRecord);
  el("cancelBtn").addEventListener("click", closeModal);
}

function getLoginInput() {
  return {
    email: el("emailInput").value.trim().toLowerCase(),
    password: el("passwordInput").value
  };
}

async function registerWithPassword() {
  const { email, password } = getLoginInput();
  if (!email) return el("loginMsg").textContent = "请先输入邮箱。";
  if (!password || password.length < 6) return el("loginMsg").textContent = "密码至少 6 位。";
  el("loginMsg").textContent = "正在注册...";
  const { error } = await sb.auth.signUp({ email, password });
  if (error) return el("loginMsg").textContent = "注册失败：" + error.message;
  el("loginMsg").textContent = "注册成功。如果 Supabase 要求邮箱确认，请先去邮箱点确认链接；否则可以直接登录。";
}

async function loginWithPassword() {
  const { email, password } = getLoginInput();
  if (!email) return el("loginMsg").textContent = "请先输入邮箱。";
  if (!password) return el("loginMsg").textContent = "请输入密码。";
  el("loginMsg").textContent = "正在登录...";
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return el("loginMsg").textContent = "登录失败：" + error.message;
  el("loginMsg").textContent = "";
}

async function logout() { await sb.auth.signOut(); }

async function renderAuthState() {
  if (!currentUser) {
    el("loginBox").classList.remove("hidden");
    el("appBox").classList.add("hidden");
    records = [];
    selectedIds.clear();
    if (realtimeChannel) {
      await sb.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    return;
  }
  el("loginBox").classList.add("hidden");
  el("appBox").classList.remove("hidden");
  el("userEmail").textContent = currentUser.email;
  await loadRecords();
  subscribeRealtime();
}

function subscribeRealtime() {
  if (realtimeChannel) return;
  realtimeChannel = sb
    .channel("money_records_changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "money_records" }, async () => {
      await loadRecords();
    })
    .subscribe();
}

async function loadRecords() {
  const { data, error } = await sb
    .from("money_records")
    .select("*")
    .eq("deleted", false)
    .order("created_at", { ascending: false });
  if (error) return alert("读取失败：" + error.message);
  records = data || [];
  render();
}

function switchWallet(wallet) {
  currentWallet = wallet;
  selectedIds.clear();
  el("cashTab").classList.toggle("active", wallet === "cash");
  el("cardTab").classList.toggle("active", wallet === "card");
  render();
}

function render() {
  const walletName = currentWallet === "cash" ? "现金" : "卡";
  el("walletTitle").textContent = walletName + "余额";
  const walletRecords = records.filter(r => r.wallet_type === currentWallet);
  const balance = walletRecords.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  el("balanceValue").textContent = formatMoney(balance);

  const list = el("recordsList");
  list.innerHTML = "";
  if (walletRecords.length === 0) {
    list.innerHTML = '<div class="empty">暂无明细</div>';
    return;
  }

  walletRecords.forEach(record => {
    const row = document.createElement("div");
    row.className = "record";
    const checked = selectedIds.has(record.id) ? "checked" : "";
    const amountClass = Number(record.amount) >= 0 ? "plus" : "minus";
    const typeText = record.action_type === "recharge" ? "充值" : "划账";
    row.innerHTML = `
      <input type="checkbox" class="check" ${checked} />
      <div class="recordMain">
        <div class="purpose">${escapeHtml(record.purpose)}</div>
        <div class="meta">${typeText} · ${formatDate(record.created_at)}${record.note ? " · " + escapeHtml(record.note) : ""}</div>
      </div>
      <div class="amount ${amountClass}">${Number(record.amount) >= 0 ? "+" : ""}${formatMoney(record.amount)}</div>
      <button class="editBtn">编辑</button>
    `;
    row.querySelector(".check").addEventListener("change", (e) => {
      e.target.checked ? selectedIds.add(record.id) : selectedIds.delete(record.id);
    });
    row.querySelector(".editBtn").addEventListener("click", () => openModal(record.action_type, record));
    list.appendChild(row);
  });
}

function openModal(type, record = null) {
  editingRecord = record;
  el("modalTitle").textContent = record ? "编辑明细" : "新增明细";
  el("formType").value = record ? record.action_type : type;
  el("formAmount").value = record ? Math.abs(Number(record.amount)) : "";
  el("formPurpose").value = record ? record.purpose : "";
  el("formNote").value = record ? (record.note || "") : "";
  el("modal").classList.remove("hidden");
}

function closeModal() {
  editingRecord = null;
  el("modal").classList.add("hidden");
}

async function saveRecord() {
  const actionType = el("formType").value;
  const rawAmount = Number(el("formAmount").value);
  const purpose = el("formPurpose").value.trim();
  const note = el("formNote").value.trim();

  if (!rawAmount || rawAmount <= 0) return alert("请输入大于 0 的金额。");
  if (!purpose) return alert("请填写用途。");

  const amount = actionType === "recharge" ? Math.abs(rawAmount) : -Math.abs(rawAmount);
  const payload = {
    wallet_type: editingRecord ? editingRecord.wallet_type : currentWallet,
    action_type: actionType,
    amount,
    purpose,
    note: note || null,
    updated_at: new Date().toISOString()
  };

  let result;
  if (editingRecord) {
    result = await sb.from("money_records").update(payload).eq("id", editingRecord.id);
  } else {
    result = await sb.from("money_records").insert({ ...payload, created_by_email: currentUser.email });
  }
  if (result.error) return alert("保存失败：" + result.error.message);

  closeModal();
  await loadRecords();
}

async function deleteSelected() {
  const ids = Array.from(selectedIds);
  if (ids.length === 0) return alert("请先选择要删除的明细。");
  if (!confirm(`确定删除选中的 ${ids.length} 条明细吗？`)) return;

  const { error } = await sb
    .from("money_records")
    .update({ deleted: true, updated_at: new Date().toISOString() })
    .in("id", ids);
  if (error) return alert("删除失败：" + error.message);
  selectedIds.clear();
  await loadRecords();
}

function formatMoney(value) { return Number(value || 0).toFixed(2); }

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
