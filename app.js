const CONFIG = {
  supabaseUrl: "https://jlgqvvwzrscqbhakbgvk.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZ3F2dnd6cnNjcWJoYWtiZ3ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNjUxMjEsImV4cCI6MjEwMzg0MTEyMX0.YD311wK_Q9UOlmM2GWpZmdh9l-KdefVkTT6Jn6HkFzg",
};


const ACCOUNT_TYPES = {
  cash: "Dinheiro",
  checking: "Corrente",
  savings: "Poupanca",
  credit: "Credito",
  other: "Outra",
};

const state = {
  client: null,
  user: null,
  profile: null,
  accounts: [],
  categories: [],
  transactions: [],
  view: "dashboard",
  editingId: null,
  filters: {
    month: toMonthValue(new Date()),
    type: "all",
    accountId: "all",
  },
};

function $(id) {
  return document.getElementById(id);
}

function toMonthValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function todayValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(value) {
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function monthRange(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function configReady() {
  return (
    CONFIG.supabaseUrl.startsWith("http") &&
    CONFIG.supabaseAnonKey.length > 20 &&
    !CONFIG.supabaseUrl.includes("COLE_AQUI") &&
    !CONFIG.supabaseAnonKey.includes("COLE_AQUI")
  );
}

function toast(message, type = "ok") {
  const el = $("toast");
  el.textContent = message;
  el.className = `toast toast-${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    el.classList.remove("show");
  }, 3200);
}

function setBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.dataset.label = button.dataset.label || button.textContent;
  button.textContent = busy ? "Aguarde..." : button.dataset.label;
}

function showScreen(name) {
  $("setup-screen").hidden = name !== "setup";
  $("auth-screen").hidden = name !== "auth";
  $("app-screen").hidden = name !== "app";
}

function resetRedirectUrl() {
  const url = new URL("redefinir.html", window.location.href);
  return url.href;
}

function filterLabel() {
  const typeMap = { all: "Todos", income: "Receitas", expense: "Despesas" };
  const account =
    state.filters.accountId === "all"
      ? "Todas as contas"
      : accountById(state.filters.accountId)?.name || "Conta";
  const [year, month] = state.filters.month.split("-");
  return `Mes ${month}/${year} · ${typeMap[state.filters.type] || "Todos"} · ${account}`;
}

function setView(view) {
  state.view = view;
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== view;
  });
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
}

function accountById(id) {
  return state.accounts.find((item) => item.id === id);
}

function categoryById(id) {
  return state.categories.find((item) => item.id === id);
}

function filteredTransactions() {
  const { start, end } = monthRange(state.filters.month);
  return state.transactions.filter((item) => {
    const inMonth = item.occurred_at >= start && item.occurred_at <= end;
    const typeOk = state.filters.type === "all" || item.type === state.filters.type;
    const accountOk =
      state.filters.accountId === "all" || item.account_id === state.filters.accountId;
    return inMonth && typeOk && accountOk;
  });
}

function monthTotals() {
  return filteredTransactions().reduce(
    (acc, item) => {
      if (item.type === "income") acc.income += Number(item.amount);
      else acc.expense += Number(item.amount);
      return acc;
    },
    { income: 0, expense: 0 }
  );
}

function accountBalance(account) {
  const movement = state.transactions.reduce((sum, item) => {
    if (item.account_id !== account.id) return sum;
    return item.type === "income"
      ? sum + Number(item.amount)
      : sum - Number(item.amount);
  }, 0);
  return Number(account.initial_balance) + movement;
}

function fillSelect(el, options, placeholder) {
  const current = el.value;
  el.innerHTML = "";
  if (placeholder) {
    const option = document.createElement("option");
    option.value = placeholder.value;
    option.textContent = placeholder.label;
    el.appendChild(option);
  }
  options.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    el.appendChild(option);
  });
  if ([...el.options].some((opt) => opt.value === current)) {
    el.value = current;
  }
}

function fillAccountSelects() {
  const active = state.accounts
    .filter((item) => !item.is_archived)
    .map((item) => ({ value: item.id, label: item.name }));
  fillSelect($("tx-account"), active);
  fillSelect($("filter-account"), active, { value: "all", label: "Todas as contas" });
  $("filter-account").value = state.filters.accountId;
}

function fillCategorySelect() {
  const type = $("tx-type").value;
  const options = state.categories
    .filter((item) => !item.is_archived && item.type === type)
    .map((item) => ({ value: item.id, label: item.name }));
  fillSelect($("tx-category"), options, { value: "", label: "Sem categoria" });
}

function renderProfile() {
  const name = state.profile?.display_name || state.user?.email || "Usuario";
  $("user-name").textContent = name;
  $("user-email").textContent = state.user?.email || "";
  $("profile-name").value = state.profile?.display_name || "";
  $("avatar").textContent = name.slice(0, 1).toUpperCase();
}

function renderKpis() {
  const totals = monthTotals();
  const balance = state.accounts.reduce((sum, account) => sum + accountBalance(account), 0);
  $("kpi-income").textContent = formatMoney(totals.income);
  $("kpi-expense").textContent = formatMoney(totals.expense);
  $("kpi-result").textContent = formatMoney(totals.income - totals.expense);
  $("kpi-balance").textContent = formatMoney(balance);
  $("kpi-result").classList.toggle("negative", totals.income - totals.expense < 0);
}

function renderTransactionRows(targetId, items, emptyText) {
  const el = $(targetId);
  if (!items.length) {
    el.innerHTML = `<div class="empty">${emptyText}</div>`;
    return;
  }
  el.innerHTML = items
    .map((item) => {
      const account = accountById(item.account_id);
      const category = categoryById(item.category_id);
      const sign = item.type === "income" ? "+" : "-";
      return `
        <article class="tx-row" data-id="${item.id}">
          <div class="tx-dot ${item.type}"></div>
          <div class="tx-main">
            <strong>${item.description || (item.type === "income" ? "Receita" : "Despesa")}</strong>
            <span>${formatDate(item.occurred_at)} · ${account?.name || "Conta"} · ${category?.name || "Sem categoria"}</span>
          </div>
          <div class="tx-amount ${item.type}">${sign} ${formatMoney(item.amount)}</div>
          <div class="tx-actions">
            <button type="button" data-edit="${item.id}">Editar</button>
            <button type="button" class="danger" data-delete="${item.id}">Excluir</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderDashboard() {
  const recent = filteredTransactions().slice(0, 8);
  renderTransactionRows("dash-list", recent, "Nenhum lancamento neste mes.");
  $("month-label").textContent = state.filters.month.split("-").reverse().join("/");
}

function renderAccounts() {
  const el = $("accounts-list");
  if (!state.accounts.length) {
    el.innerHTML = `<div class="empty">Nenhuma conta cadastrada.</div>`;
    return;
  }
  el.innerHTML = state.accounts
    .map((account) => {
      const balance = accountBalance(account);
      return `
        <article class="card-item ${account.is_archived ? "archived" : ""}">
          <div class="card-head">
            <span class="swatch" style="background:${account.color}"></span>
            <div>
              <strong>${account.name}</strong>
              <span>${ACCOUNT_TYPES[account.type] || account.type} · ${account.currency}</span>
            </div>
          </div>
          <div class="card-balance ${balance < 0 ? "negative" : ""}">${formatMoney(balance)}</div>
          <div class="tx-actions">
            <button type="button" data-archive-account="${account.id}">${account.is_archived ? "Reativar" : "Arquivar"}</button>
            <button type="button" class="danger" data-delete-account="${account.id}">Excluir</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderCategories() {
  const el = $("categories-list");
  if (!state.categories.length) {
    el.innerHTML = `<div class="empty">Nenhuma categoria cadastrada.</div>`;
    return;
  }
  el.innerHTML = state.categories
    .map((category) => {
      return `
        <article class="card-item ${category.is_archived ? "archived" : ""}">
          <div class="card-head">
            <span class="swatch" style="background:${category.color}"></span>
            <div>
              <strong>${category.name}</strong>
              <span>${category.type === "income" ? "Receita" : "Despesa"}</span>
            </div>
          </div>
          <div class="tx-actions">
            <button type="button" data-archive-category="${category.id}">${category.is_archived ? "Reativar" : "Arquivar"}</button>
            <button type="button" class="danger" data-delete-category="${category.id}">Excluir</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderAll() {
  renderProfile();
  fillAccountSelects();
  fillCategorySelect();
  renderKpis();
  renderDashboard();
  renderTransactionRows(
    "tx-list",
    filteredTransactions(),
    "Nenhum lancamento com os filtros atuais."
  );
  renderAccounts();
  renderCategories();
}

async function loadAll() {
  const userId = state.user.id;
  const [profileRes, accountsRes, categoriesRes, txRes] = await Promise.all([
    state.client.from("profiles").select("*").eq("id", userId).single(),
    state.client.from("accounts").select("*").eq("user_id", userId).order("created_at"),
    state.client.from("categories").select("*").eq("user_id", userId).order("name"),
    state.client
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (profileRes.error) throw profileRes.error;
  if (accountsRes.error) throw accountsRes.error;
  if (categoriesRes.error) throw categoriesRes.error;
  if (txRes.error) throw txRes.error;

  state.profile = profileRes.data;
  state.accounts = accountsRes.data || [];
  state.categories = categoriesRes.data || [];
  state.transactions = txRes.data || [];
  renderAll();
}

function resetTransactionForm() {
  state.editingId = null;
  $("tx-form").reset();
  $("tx-date").value = todayValue();
  $("tx-type").value = "expense";
  $("tx-submit").dataset.label = "Salvar lancamento";
  $("tx-submit").textContent = "Salvar lancamento";
  $("tx-cancel").hidden = true;
  fillCategorySelect();
  fillAccountSelects();
}

function fillTransactionForm(item) {
  state.editingId = item.id;
  $("tx-type").value = item.type;
  fillCategorySelect();
  $("tx-amount").value = item.amount;
  $("tx-date").value = item.occurred_at;
  $("tx-account").value = item.account_id;
  $("tx-category").value = item.category_id || "";
  $("tx-description").value = item.description || "";
  $("tx-submit").dataset.label = "Atualizar lancamento";
  $("tx-submit").textContent = "Atualizar lancamento";
  $("tx-cancel").hidden = false;
  setView("transactions");
}

async function onAuthState(session) {
  state.user = session?.user || null;
  if (!state.user) {
    state.profile = null;
    state.accounts = [];
    state.categories = [];
    state.transactions = [];
    showScreen("auth");
    return;
  }
  showScreen("app");
  await loadAll();
}

function setAuthMode(mode) {
  const form = $("auth-form");
  form.dataset.mode = mode;
  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";
  $("auth-name-wrap").hidden = !isSignup;
  $("auth-password-wrap").hidden = isForgot;
  $("auth-password").required = !isForgot;
  $("auth-forgot").hidden = isForgot;
  $("auth-submit").dataset.label = isForgot
    ? "Enviar link"
    : isSignup
      ? "Criar conta"
      : "Entrar";
  $("auth-submit").textContent = $("auth-submit").dataset.label;
  $("auth-toggle").textContent = isSignup || isForgot ? "Ja tenho conta" : "Criar uma conta";
  $("auth-title").textContent = isForgot
    ? "Redefinir senha"
    : isSignup
      ? "Criar conta"
      : "Entrar";
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const mode = $("auth-form").dataset.mode || "login";
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  const name = $("auth-name").value.trim();
  const button = $("auth-submit");
  setBusy(button, true);
  try {
    if (mode === "forgot") {
      if (!email) throw new Error("Informe o e-mail da conta.");
      const { error } = await state.client.auth.resetPasswordForEmail(email, {
        redirectTo: resetRedirectUrl(),
      });
      if (error) throw error;
      toast("Se o e-mail existir, o link de redefinicao foi enviado.");
      setAuthMode("login");
      return;
    }
    if (mode === "signup") {
      const { data, error } = await state.client.auth.signUp({
        email,
        password,
        options: { data: { display_name: name || email.split("@")[0] } },
      });
      if (error) throw error;
      if (!data.session) {
        toast("Conta criada. Confirme o e-mail se o Supabase exigir.", "ok");
      }
    } else {
      const { error } = await state.client.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (error) {
    toast(error.message, "err");
  } finally {
    setBusy(button, false);
  }
}

function toggleAuthMode() {
  const form = $("auth-form");
  const next = form.dataset.mode === "signup" || form.dataset.mode === "forgot" ? "login" : "signup";
  setAuthMode(next);
}

function exportPdf() {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) {
    toast("Biblioteca de PDF nao carregou.", "err");
    return;
  }
  const items = filteredTransactions();
  const totals = monthTotals();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const userName = state.profile?.display_name || state.user?.email || "Usuario";
  doc.setFontSize(16);
  doc.text("Relatorio de carteira", 14, 18);
  doc.setFontSize(10);
  doc.text(userName, 14, 26);
  doc.text(filterLabel(), 14, 32);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 38);
  doc.text(
    `Receitas ${formatMoney(totals.income)}  |  Despesas ${formatMoney(totals.expense)}  |  Resultado ${formatMoney(totals.income - totals.expense)}`,
    14,
    46
  );

  const rows = items.map((item) => {
    const account = accountById(item.account_id);
    const category = categoryById(item.category_id);
    return [
      formatDate(item.occurred_at),
      item.type === "income" ? "Receita" : "Despesa",
      item.description || "-",
      account?.name || "-",
      category?.name || "-",
      formatMoney(item.amount),
    ];
  });

  if (typeof doc.autoTable === "function") {
    doc.autoTable({
      startY: 52,
      head: [["Data", "Tipo", "Descricao", "Conta", "Categoria", "Valor"]],
      body: rows.length ? rows : [["-", "-", "Nenhum lancamento", "-", "-", "-"]],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [212, 160, 23], textColor: [27, 20, 6] },
      columnStyles: { 5: { halign: "right" } },
    });
  } else {
    let y = 54;
    rows.forEach((row) => {
      doc.text(row.join(" | "), 14, y);
      y += 6;
    });
  }

  const fileMonth = state.filters.month.replace("-", "");
  doc.save(`relatorio-carteira-${fileMonth}.pdf`);
}

async function handleTransactionSubmit(event) {
  event.preventDefault();
  const payload = {
    user_id: state.user.id,
    type: $("tx-type").value,
    amount: Number($("tx-amount").value),
    occurred_at: $("tx-date").value,
    account_id: $("tx-account").value,
    category_id: $("tx-category").value || null,
    description: $("tx-description").value.trim(),
  };
  if (!payload.account_id) {
    toast("Cadastre uma conta antes de lancar.", "err");
    return;
  }
  const button = $("tx-submit");
  setBusy(button, true);
  try {
    const query = state.editingId
      ? state.client.from("transactions").update(payload).eq("id", state.editingId).eq("user_id", state.user.id)
      : state.client.from("transactions").insert(payload);
    const { error } = await query;
    if (error) throw error;
    toast(state.editingId ? "Lancamento atualizado." : "Lancamento salvo.");
    resetTransactionForm();
    await loadAll();
  } catch (error) {
    toast(error.message, "err");
  } finally {
    setBusy(button, false);
  }
}

async function deleteTransaction(id) {
  if (!confirm("Excluir este lancamento?")) return;
  const { error } = await state.client
    .from("transactions")
    .delete()
    .eq("id", id)
    .eq("user_id", state.user.id);
  if (error) return toast(error.message, "err");
  toast("Lancamento excluido.");
  if (state.editingId === id) resetTransactionForm();
  await loadAll();
}

async function handleAccountSubmit(event) {
  event.preventDefault();
  const payload = {
    user_id: state.user.id,
    name: $("account-name").value.trim(),
    type: $("account-type").value,
    initial_balance: Number($("account-balance").value || 0),
    color: $("account-color").value,
  };
  const button = $("account-submit");
  setBusy(button, true);
  try {
    const { error } = await state.client.from("accounts").insert(payload);
    if (error) throw error;
    event.target.reset();
    $("account-color").value = "#d4a017";
    toast("Conta criada.");
    await loadAll();
  } catch (error) {
    toast(error.message, "err");
  } finally {
    setBusy(button, false);
  }
}

async function toggleAccountArchive(id) {
  const account = accountById(id);
  if (!account) return;
  const { error } = await state.client
    .from("accounts")
    .update({ is_archived: !account.is_archived })
    .eq("id", id)
    .eq("user_id", state.user.id);
  if (error) return toast(error.message, "err");
  await loadAll();
}

async function deleteAccount(id) {
  if (!confirm("Excluir esta conta? So funciona se nao houver lancamentos vinculados.")) return;
  const { error } = await state.client
    .from("accounts")
    .delete()
    .eq("id", id)
    .eq("user_id", state.user.id);
  if (error) return toast(error.message, "err");
  toast("Conta excluida.");
  await loadAll();
}

async function handleCategorySubmit(event) {
  event.preventDefault();
  const payload = {
    user_id: state.user.id,
    name: $("category-name").value.trim(),
    type: $("category-type").value,
    color: $("category-color").value,
  };
  const button = $("category-submit");
  setBusy(button, true);
  try {
    const { error } = await state.client.from("categories").insert(payload);
    if (error) throw error;
    event.target.reset();
    $("category-color").value = "#6b7c93";
    toast("Categoria criada.");
    await loadAll();
  } catch (error) {
    toast(error.message, "err");
  } finally {
    setBusy(button, false);
  }
}

async function toggleCategoryArchive(id) {
  const category = categoryById(id);
  if (!category) return;
  const { error } = await state.client
    .from("categories")
    .update({ is_archived: !category.is_archived })
    .eq("id", id)
    .eq("user_id", state.user.id);
  if (error) return toast(error.message, "err");
  await loadAll();
}

async function deleteCategory(id) {
  if (!confirm("Excluir esta categoria?")) return;
  const { error } = await state.client
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("user_id", state.user.id);
  if (error) return toast(error.message, "err");
  toast("Categoria excluida.");
  await loadAll();
}

async function handleProfileSubmit(event) {
  event.preventDefault();
  const display_name = $("profile-name").value.trim();
  const { error } = await state.client
    .from("profiles")
    .update({ display_name })
    .eq("id", state.user.id);
  if (error) return toast(error.message, "err");
  toast("Perfil atualizado.");
  await loadAll();
}

function bindEvents() {
  $("auth-form").addEventListener("submit", handleAuthSubmit);
  $("auth-toggle").addEventListener("click", toggleAuthMode);
  $("auth-forgot").addEventListener("click", () => setAuthMode("forgot"));
  $("pdf-btn").addEventListener("click", exportPdf);
  $("pdf-btn-dash").addEventListener("click", exportPdf);
  $("tx-form").addEventListener("submit", handleTransactionSubmit);
  $("tx-cancel").addEventListener("click", resetTransactionForm);
  $("tx-type").addEventListener("change", fillCategorySelect);
  $("account-form").addEventListener("submit", handleAccountSubmit);
  $("category-form").addEventListener("submit", handleCategorySubmit);
  $("profile-form").addEventListener("submit", handleProfileSubmit);
  $("filter-month").addEventListener("change", (event) => {
    state.filters.month = event.target.value;
    renderAll();
  });
  $("filter-type").addEventListener("change", (event) => {
    state.filters.type = event.target.value;
    renderAll();
  });
  $("filter-account").addEventListener("change", (event) => {
    state.filters.accountId = event.target.value;
    renderAll();
  });
  $("logout-btn").addEventListener("click", async () => {
    await state.client.auth.signOut();
  });
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });
  document.body.addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-edit]");
    const del = event.target.closest("[data-delete]");
    const archiveAccount = event.target.closest("[data-archive-account]");
    const deleteAccountBtn = event.target.closest("[data-delete-account]");
    const archiveCategory = event.target.closest("[data-archive-category]");
    const deleteCategoryBtn = event.target.closest("[data-delete-category]");
    if (edit) {
      const item = state.transactions.find((row) => row.id === edit.dataset.edit);
      if (item) fillTransactionForm(item);
    }
    if (del) await deleteTransaction(del.dataset.delete);
    if (archiveAccount) await toggleAccountArchive(archiveAccount.dataset.archiveAccount);
    if (deleteAccountBtn) await deleteAccount(deleteAccountBtn.dataset.deleteAccount);
    if (archiveCategory) await toggleCategoryArchive(archiveCategory.dataset.archiveCategory);
    if (deleteCategoryBtn) await deleteCategory(deleteCategoryBtn.dataset.deleteCategory);
  });
}

async function boot() {
  $("tx-date").value = todayValue();
  $("filter-month").value = state.filters.month;
  bindEvents();
  if (!configReady()) {
    showScreen("setup");
    return;
  }
  state.client = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  state.client.auth.onAuthStateChange((_event, session) => {
    onAuthState(session).catch((error) => toast(error.message, "err"));
  });
  const { data, error } = await state.client.auth.getSession();
  if (error) toast(error.message, "err");
  await onAuthState(data.session);
}

document.addEventListener("DOMContentLoaded", boot);
