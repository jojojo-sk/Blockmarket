const $ = (id) => document.getElementById(id);
let catalogue = [];
let cart = new Map();
let selectedCategory = "Alle";
let adminPoll = null;
let lastPending = 0;

function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function renderItems() {
  const query = $("search").value.trim().toLocaleLowerCase("de");
  const filtered = catalogue.filter(item =>
    (selectedCategory === "Alle" || item.category === selectedCategory) &&
    (item.name.toLocaleLowerCase("de").includes(query) || item.id.includes(query))
  );
  $("result-count").textContent = `${filtered.length} Items`;
  $("all-count").textContent = catalogue.length;
  $("items").innerHTML = filtered.length ? filtered.map(item => `
    <article class="item-card">
      <div class="item-image"><img loading="lazy" src="${escapeHtml(item.image)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span class="fallback" style="display:none">▦</span></div>
      <h3 title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h3>
      <div class="item-meta">${escapeHtml(item.category)} · Stack: ${item.stackSize}</div>
      <div class="quantity-row"><input type="number" min="1" max="100000" value="1" aria-label="Menge für ${escapeHtml(item.name)}"><button data-add="${escapeHtml(item.id)}">Hinzufügen</button></div>
    </article>`).join("") : `<div class="loading">Keine passenden Items gefunden.</div>`;
  $("items").querySelectorAll("[data-add]").forEach(button => button.addEventListener("click", () => {
    const input = button.parentElement.querySelector("input");
    const qty = Number(input.value);
    if (!Number.isInteger(qty) || qty < 1 || qty > 100000) return toast("Bitte eine gültige Menge eingeben.");
    const id = button.dataset.add;
    cart.set(id, (cart.get(id) || 0) + qty);
    renderCart(); toast("Zum Warenkorb hinzugefügt.");
  }));
}
function renderCart() {
  const total = [...cart.values()].reduce((a,b)=>a+b,0);
  $("cart-count").textContent = total;
  $("cart-lines").innerHTML = cart.size ? [...cart.entries()].map(([id,qty]) => {
    const item = catalogue.find(x => x.id === id);
    return `<div class="cart-line"><div><strong>${escapeHtml(item?.name || id)}</strong><small>${escapeHtml(id)}</small></div><input type="number" min="1" max="100000" value="${qty}" data-qty="${escapeHtml(id)}" aria-label="Menge"><button class="remove" data-remove="${escapeHtml(id)}">×</button></div>`;
  }).join("") : `<div class="empty">Dein Warenkorb ist noch leer.</div>`;
  $("cart-lines").querySelectorAll("[data-qty]").forEach(input => input.addEventListener("change", () => {
    const n = Number(input.value), id = input.dataset.qty;
    if (!Number.isInteger(n) || n < 1 || n > 100000) { input.value = cart.get(id); return; }
    cart.set(id,n); renderCart();
  }));
  $("cart-lines").querySelectorAll("[data-remove]").forEach(btn => btn.addEventListener("click", () => { cart.delete(btn.dataset.remove); renderCart(); }));
}
function openCart() { $("cart-drawer").classList.remove("hidden"); renderCart(); }
function closeCart() { $("cart-drawer").classList.add("hidden"); }
async function submitOrder() {
  const message = $("checkout-message"); message.textContent = "";
  if (!cart.size) return message.textContent = "Dein Warenkorb ist leer.";
  const payload = { player: $("player").value.trim(), note: $("note").value.trim(), items: [...cart.entries()].map(([id,quantity])=>({id,quantity})) };
  const button = $("submit-order"); button.disabled = true; button.textContent = "Wird gesendet …";
  try {
    const response = await fetch("/api/orders", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Fehler beim Senden.");
    cart.clear(); renderCart(); $("note").value = "";
    message.textContent = `Danke! Bestellung #${data.orderId} wurde gesendet. Du bekommst die Lieferung nach persönlicher Absprache im Spiel.`;
    toast("Bestellung erfolgreich gesendet!");
  } catch(err) { message.textContent = err.message; }
  finally { button.disabled = false; button.textContent = "Bestellung absenden"; }
}
async function checkAdmin() {
  const res = await fetch("/api/admin/me"); const data = await res.json();
  $("admin-login").classList.toggle("hidden", data.loggedIn);
  $("admin-panel").classList.toggle("hidden", !data.loggedIn);
  if (data.loggedIn) { await loadOrders(); startAdminPoll(); } else stopAdminPoll();
}
async function adminLogin() {
  const msg = $("admin-login-message"); msg.textContent = "";
  try {
    const res = await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:$("admin-password").value})});
    const data = await res.json(); if (!res.ok) throw new Error(data.error || "Anmeldung fehlgeschlagen.");
    $("admin-password").value = ""; await checkAdmin();
  } catch(err) { msg.textContent = err.message; }
}
function startAdminPoll() { stopAdminPoll(); adminPoll = setInterval(loadOrders, 12000); }
function stopAdminPoll() { if (adminPoll) clearInterval(adminPoll); adminPoll = null; }
async function loadOrders() {
  try {
    const res = await fetch("/api/admin/orders"); if (res.status === 401) return checkAdmin();
    const orders = await res.json();
    const pending = orders.filter(o=>o.status==="pending").length;
    if (pending > lastPending && lastPending !== 0) toast("🔔 Neue Minecraft-Bestellung eingegangen!");
    lastPending = pending;
    $("pending-count").textContent = `${pending} offen`;
    $("orders-list").innerHTML = orders.length ? orders.map(order => `
      <article class="order-card">
        <div class="order-top"><strong>Bestellung #${order.id} · ${escapeHtml(order.player)}</strong><span class="status ${order.status}">${statusName(order.status)}</span></div>
        <p>${order.items.map(i=>`${escapeHtml(i.name)} × ${i.quantity}`).join("<br>")}${order.note ? `<br><br><b>Notiz:</b> ${escapeHtml(order.note)}` : ""}<br><br><small>Erstellt: ${escapeHtml(order.created_at)}</small></p>
        <div class="order-actions">
          ${order.status==="pending" ? `<button class="accept" data-status="accepted" data-id="${order.id}">✓ Annehmen</button><button class="reject" data-status="rejected" data-id="${order.id}">✕ Ablehnen</button>` : ""}
          ${order.status==="accepted" ? `<button class="deliver" data-status="delivered" data-id="${order.id}">Als geliefert markieren</button>` : ""}
          ${order.status!=="pending" ? `<button class="secondary" data-status="pending" data-id="${order.id}">Zurück auf offen</button>` : ""}
        </div>
      </article>`).join("") : `<div class="empty-state">Noch keine Bestellungen vorhanden.</div>`;
    $("orders-list").querySelectorAll("[data-status]").forEach(btn => btn.addEventListener("click",()=>updateOrder(btn.dataset.id,btn.dataset.status)));
  } catch(err) { $("orders-list").textContent = "Bestellungen konnten nicht geladen werden."; }
}
function statusName(status) { return ({pending:"Offen",accepted:"Angenommen",rejected:"Abgelehnt",delivered:"Geliefert"})[status] || status; }
async function updateOrder(id,status) {
  const res = await fetch(`/api/admin/orders/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});
  const data = await res.json(); if (!res.ok) return toast(data.error || "Status konnte nicht geändert werden.");
  toast("Bestellstatus aktualisiert."); loadOrders();
}
async function adminLogout() {
  await fetch("/api/admin/logout",{method:"POST"}); stopAdminPoll(); lastPending=0; await checkAdmin();
}
async function init() {
  try {
    const res = await fetch("/api/items"); const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Fehler");
    catalogue = data.items; renderItems();
    $("result-count").textContent = `${catalogue.length} Items · Java ${data.version}`;
  } catch(err) { $("items").innerHTML = `<div class="loading">${escapeHtml(err.message)}</div>`; }
  document.querySelectorAll(".category").forEach(btn=>btn.addEventListener("click",()=>{
    document.querySelector(".category.active")?.classList.remove("active"); btn.classList.add("active");
    selectedCategory=btn.dataset.category; renderItems();
  }));
  $("search").addEventListener("input",renderItems);
  $("cart-open").addEventListener("click",openCart); $("cart-close").addEventListener("click",closeCart);
  $("cart-drawer").addEventListener("click",e=>{if(e.target===$("cart-drawer"))closeCart();});
  $("submit-order").addEventListener("click",submitOrder);
  $("admin-open").addEventListener("click",()=>{$("admin-modal").classList.remove("hidden");checkAdmin();});
  $("admin-close").addEventListener("click",()=>$("admin-modal").classList.add("hidden"));
  $("admin-modal").addEventListener("click",e=>{if(e.target===$("admin-modal"))$("admin-modal").classList.add("hidden");});
  $("admin-login-button").addEventListener("click",adminLogin);
  $("admin-password").addEventListener("keydown",e=>{if(e.key==="Enter")adminLogin();});
  $("admin-logout").addEventListener("click",adminLogout);
  $("refresh-orders").addEventListener("click",loadOrders);
}
init();
