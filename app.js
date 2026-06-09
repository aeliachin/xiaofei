// 小猫消费 - 第一版
// 1) 到 Supabase Project Settings / API 里复制 Project URL 和 anon/publishable key。
// 2) 粘贴到下面两行。
// 3) 注意：这里只能放 anon/publishable key，绝对不要放 service_role key。
const SUPABASE_URL = "https://mhwqsogjmbhdsoafygkd.supabase.co";
const SUPABASE_KEY = "sb_publishable_HpBX5n6gVJoq87l8I02g-Q_y02Sh3y9";

const isConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("填你的") &&
  SUPABASE_KEY &&
  !SUPABASE_KEY.includes("填你的");

const sb = isConfigured
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

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

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  if (!isConfigured) {
    el("setupWarning").classList.remove("hidden");
    el("loginBtn").disabled = true;
    el("loginMsg").textContent = "请先配置 app.js。";
    return;
  }

  const { data } = await sb.auth.getSession();
  currentUser = data.session?.user || null;

  sb.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    renderAuthState();
  });

  renderAuthState();
}

function bindEvents() {
  el("loginBtn").addEventListener("click", login);
  el("emailInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });

  el("logoutBtn").addEventListener("click", logout);
  el("cashTab").addEventListener("click", () => switchWallet("cash"));
  el("cardTab").addEventListener("click", () => switchWallet("card"));

  el("addRechargeBtn").addEventListener("click", () => openModal("recharge"));
  el("addTransferBtn").addEventListener("click", () => openModal("transfer"));
  el("deleteSelectedBtn").addEventListener("click", deleteSelected);

  el("saveBtn").addEventListener("click", saveRecord);
  el("cancelBtn").addEventListener("click", closeModal);
  el("closeModalBtn").addEventListener("click", closeModal);

  el("modal").addEventListener("click", (e) => {
    if (e.target === el("modal")) closeModal();
  });
}

async function login() {
  const email = el("emailInput").value.trim();
  if (!email) {
    el("loginMsg").textContent = "请先输入邮箱。";
    return;
  }

  el("loginBtn").disabled = true;
  el("loginMsg").textContent = "正在发送……";

  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo }
  });

  el("loginBtn").disabled = false;

  if (error) {
    el("loginMsg").textContent = "发送失败：" + error.message;
  } else {
    el("loginMsg").textContent = "登录链接已发送，请打开邮箱点击链接。";
  }
}

async function logout() {
  await sb.auth.signOut();
}

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
  el("userEmail").textContent = currentUser.email || "";

  await loadRecords();
  subscribeRealtime();
}

function subscribeRealtime() {
  if (realtimeChannel) return;

  realtimeChannel = sb
    .channel("money_records_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "money_records" },
      async () => await loadRecords()
    )
    .subscribe();
}

async function loadRecords() {
  const { data, error } = await sb
    .from("money_records")
    .select("*")
    .eq("deleted", false)
    .order("created_at", { ascending: false });

  if (error) {
    alert("读取失败：" + error.message);
    return;
  }

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
  el("walletTitle").textContent = `${walletName}余额`;

  const walletRecords = records.filter((r) => r.wallet_type === currentWallet);
  const balance = walletRecords.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  el("balanceValue").textContent = formatMoney(balance);

  const list = el("recordsList");
  list.innerHTML = "";

  if (walletRecords.length === 0) {
    list.innerHTML = `<div class="empty">暂无明细</div>`;
    return;
  }

  walletRecords.forEach((record) => {
    const row = document.createElement("div");
    row.className = "record";

    const checked = selectedIds.has(record.id) ? "checked" : "";
    const amountNum = Number(record.amount || 0);
    const amountClass = amountNum >= 0 ? "plus" : "minus";
    const typeText = record.action_type === "recharge" ? "充值" : "划账";

    row.innerHTML = `
      <input type="checkbox" class="check" ${checked} aria-label="选择明细" />
      <div class="recordMain">
        <div class="purpose">${escapeHtml(record.purpose)}</div>
        <div class="meta">
          ${typeText} · ${formatDate(record.created_at)}
          ${record.note ? " · " + escapeHtml(record.note) : ""}
        </div>
      </div>
      <div class="amount ${amountClass}">${amountNum >= 0 ? "+" : ""}${formatMoney(amountNum)}</div>
      <button class="editBtn" type="button">编辑</button>
    `;

    row.querySelector(".check").addEventListener("change", (e) => {
      if (e.target.checked) selectedIds.add(record.id);
      else selectedIds.delete(record.id);
    });

    row.querySelector(".editBtn").addEventListener("click", () => {
      openModal(record.action_type, record);
    });

    list.appendChild(row);
  });
}

function openModal(type, record = null) {
  editingRecord = record;

  el("modalTitle").textContent = record ? "编辑明细" : "新增明细";
  el("formType").value = record ? record.action_type : type;
  el("formAmount").value = record ? Math.abs(Number(record.amount)) : "";
  el("formPurpose").value = record ? record.purpose : "";
  el("formNote").value = record ? record.note || "" : "";

  el("modal").classList.remove("hidden");
  setTimeout(() => el("formAmount").focus(), 50);
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

  if (!rawAmount || rawAmount <= 0) {
    alert("请输入大于 0 的金额。");
    return;
  }

  if (!purpose) {
    alert("请填写用途。");
    return;
  }

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
    result = await sb.from("money_records").insert({
      ...payload,
      created_by_email: currentUser.email
    });
  }

  if (result.error) {
    alert("保存失败：" + result.error.message);
    return;
  }

  closeModal();
  await loadRecords();
}

async function deleteSelected() {
  const ids = Array.from(selectedIds);
  if (ids.length === 0) {
    alert("请先选择要删除的明细。");
    return;
  }

  if (!confirm(`确定删除选中的 ${ids.length} 条明细吗？`)) return;

  const { error } = await sb
    .from("money_records")
    .update({ deleted: true, updated_at: new Date().toISOString() })
    .in("id", ids);

  if (error) {
    alert("删除失败：" + error.message);
    return;
  }

  selectedIds.clear();
  await loadRecords();
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
