/* =========================================================================
   app.js — Lógica do frontend do InvestSim.
   Responsável por:
     - buscar o estado no Flask (fetch / JSON)
     - renderizar mercado, carteira, estatísticas, ranking e históricos
     - controlar tempo (manual e automático)
     - abrir o modal de compra/venda
     - tocar sons opcionais e salvar preferências no localStorage
   ========================================================================= */

// Estado atual recebido do backend (fonte da verdade vem do Flask).
let STATE = null;
// Ativo selecionado no modal de negociação.
let SELECTED = null;
// Identificador do gráfico ativo: "networth" ou "assets".
let chartMode = "networth";
// Loop do modo automático.
let autoTimer = null;
let soundOn = localStorage.getItem("investsim_sound") !== "off";

const $ = (sel) => document.querySelector(sel);
const fmt = (v) =>
  "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ----------------------------------------------------------- comunicação API */
async function api(path, body) {
  const opts = { headers: { "Content-Type": "application/json" } };
  if (body) { opts.method = "POST"; opts.body = JSON.stringify(body); }
  const res = await fetch(path, opts);
  return res.json();
}

/** Busca o estado completo e re-renderiza tudo. */
async function refresh() {
  STATE = await api("/api/state");
  renderAll();
}

/* ----------------------------------------------------------- renderização */
function renderAll() {
  renderTopbar();
  renderMarket();
  renderPortfolio();
  renderStats();
  renderRanking();
  renderTransactions();
  renderEvents();
  renderChart();
  // Se o modal estiver aberto, atualiza os números dele também.
  if (SELECTED && !$("#trade-modal").classList.contains("hidden")) updateModal();
}

function renderTopbar() {
  const s = STATE.stats;
  setFlash($("#t-networth"), s.net_worth, fmt(s.net_worth));
  $("#t-balance").textContent = fmt(s.balance);
  $("#t-day").textContent = STATE.day;
  const profitEl = $("#t-profit");
  profitEl.textContent = (s.profit >= 0 ? "+" : "") + fmt(s.profit) + ` (${s.roi}%)`;
  profitEl.className = "stat-value " + (s.profit >= 0 ? "up" : "down");
}

// Mantém o valor anterior para animar (flash verde/vermelho) quando muda.
const prevValues = {};
function setFlash(el, value, text) {
  el.textContent = text;
  const key = el.id;
  if (prevValues[key] !== undefined && value !== prevValues[key]) {
    el.classList.remove("flash-up", "flash-down");
    void el.offsetWidth; // força reinício da animação
    el.classList.add(value > prevValues[key] ? "flash-up" : "flash-down");
  }
  prevValues[key] = value;
}

function renderMarket() {
  const list = $("#market-list");
  list.innerHTML = "";
  STATE.assets.forEach((a) => {
    // Variação do último dia.
    const hist = a.history;
    const prev = hist.length >= 2 ? hist[hist.length - 2] : a.price;
    const dayPct = prev ? ((a.price - prev) / prev) * 100 : 0;
    const cls = dayPct >= 0 ? "up" : "down";

    const el = document.createElement("div");
    el.className = "asset";
    el.dataset.tip = a.desc; // tooltip explicando o investimento
    el.innerHTML = `
      <div class="a-name">${a.name}
        <span class="risk-badge risk-${a.risk}">${a.risk}</span>
      </div>
      <div class="a-price">${fmt(a.price)}</div>
      <div class="a-change ${cls}">${dayPct >= 0 ? "▲" : "▼"} ${Math.abs(dayPct).toFixed(2)}%</div>
      <div class="a-meta">vol ${(a.volatility * 100).toFixed(0)}%</div>
      <canvas class="a-spark"></canvas>
    `;
    el.addEventListener("click", () => openModal(a.id));
    list.appendChild(el);
    // Desenha o sparkline (últimos 40 pontos).
    ChartLib.sparkline(el.querySelector(".a-spark"), hist.slice(-40));
  });
}

function renderPortfolio() {
  const list = $("#portfolio-list");
  list.innerHTML = "";
  if (!STATE.portfolio.length) {
    list.innerHTML = `<div class="empty">Você ainda não possui cotas. Compre no mercado!</div>`;
    return;
  }
  STATE.portfolio.forEach((p) => {
    const cls = p.profit >= 0 ? "up" : "down";
    const el = document.createElement("div");
    el.className = "pos";
    el.innerHTML = `
      <div class="p-name">${p.name}</div>
      <div class="p-val">${fmt(p.market_value)}</div>
      <div class="p-sub">${p.shares} cotas · médio ${fmt(p.avg_price)}</div>
      <div class="p-profit ${cls}">${p.profit >= 0 ? "+" : ""}${fmt(p.profit)} (${p.profit_pct}%)</div>
    `;
    el.style.cursor = "pointer";
    el.addEventListener("click", () => openModal(p.id));
    list.appendChild(el);
  });
}

function renderStats() {
  const s = STATE.stats;
  const cls = s.profit >= 0 ? "up" : "down";
  $("#stats").innerHTML = `
    <div class="stat-box"><span>Patrimônio total</span><strong>${fmt(s.net_worth)}</strong></div>
    <div class="stat-box"><span>Investido</span><strong>${fmt(s.invested)}</strong></div>
    <div class="stat-box"><span>Lucro/Prejuízo</span><strong class="${cls}">${fmt(s.profit)}</strong></div>
    <div class="stat-box"><span>Retorno (ROI)</span><strong class="${cls}">${s.roi}%</strong></div>
    <div class="stat-box"><span>Pico de patrimônio</span><strong>${fmt(s.peak)}</strong></div>
    <div class="stat-box"><span>Operações</span><strong>${s.buys} compras · ${s.sells} vendas</strong></div>
  `;
}

function renderRanking() {
  const list = $("#ranking");
  list.innerHTML = "";
  STATE.ranking.forEach((r, i) => {
    const cls = r.change_pct >= 0 ? "up" : "down";
    const el = document.createElement("div");
    el.className = "rank-row";
    el.innerHTML = `
      <span class="pos-num">${i + 1}º</span>
      <span>${r.name} <span class="risk-badge risk-${r.risk}">${r.risk}</span></span>
      <span>${fmt(r.price)}</span>
      <span class="${cls}">${r.change_pct >= 0 ? "+" : ""}${r.change_pct}%</span>
    `;
    list.appendChild(el);
  });
}

function renderTransactions() {
  const list = $("#tx-list");
  list.innerHTML = "";
  if (!STATE.transactions.length) {
    list.innerHTML = `<div class="empty">Nenhuma transação ainda.</div>`;
    return;
  }
  STATE.transactions.forEach((t) => {
    const el = document.createElement("div");
    el.className = "tx";
    el.innerHTML = `
      <span class="tag ${t.kind}">${t.kind.toUpperCase()}</span>
      <div>${t.asset}<div class="tx-sub">${t.shares} cotas a ${fmt(t.price)} · dia ${t.day}</div></div>
      <strong>${fmt(t.total)}</strong>
    `;
    list.appendChild(el);
  });
}

function renderEvents() {
  const list = $("#events-list");
  list.innerHTML = "";
  if (!STATE.events_log.length) {
    list.innerHTML = `<div class="empty">Avance o tempo para ver eventos do mercado.</div>`;
    return;
  }
  STATE.events_log.forEach((e) => {
    const el = document.createElement("div");
    el.className = "ev " + e.tone;
    el.innerHTML = `${e.label} <small>· dia ${e.day}</small>`;
    list.appendChild(el);
  });
}

function renderChart() {
  const canvas = $("#chart");
  let series, opts;
  if (chartMode === "networth") {
    series = [{ label: "Patrimônio", data: STATE.net_worth_history, color: "#4f8cff" }];
    opts = { fill: true };
  } else {
    // Mostra a evolução de todas as cotas (normalizada não é necessária; usamos preço real).
    series = STATE.assets.map((a, i) => ({
      label: a.name,
      data: a.history.slice(-120),
      color: ChartLib.COLORS[i % ChartLib.COLORS.length],
    }));
    opts = { fill: false };
  }
  const legend = ChartLib.draw(canvas, series, opts);
  $("#chart-legend").innerHTML = legend
    .map((l) => `<span><i style="background:${l.color}"></i>${l.label}</span>`)
    .join("");
}

/* ----------------------------------------------------------- modal de negociação */
function openModal(assetId) {
  SELECTED = STATE.assets.find((a) => a.id === assetId);
  if (!SELECTED) return;
  $("#m-error").textContent = "";
  $("#trade-modal").classList.remove("hidden");
  updateModal();
}

function closeModal() {
  $("#trade-modal").classList.add("hidden");
  SELECTED = null;
}

function updateModal() {
  const a = SELECTED;
  const pos = STATE.portfolio.find((p) => p.id === a.id);
  $("#m-name").textContent = a.name;
  $("#m-desc").textContent = a.desc;
  $("#m-price").textContent = fmt(a.price);
  $("#m-risk").textContent = a.risk;
  $("#m-shares").textContent = pos ? pos.shares : 0;
  $("#m-avg").textContent = pos ? fmt(pos.avg_price) : "—";
  updateCost();
}

function updateCost() {
  const qty = parseFloat($("#m-qty").value) || 0;
  $("#m-cost").textContent = fmt(qty * (SELECTED ? SELECTED.price : 0));
}

async function doTrade(action) {
  if (!SELECTED) return;
  const qty = parseFloat($("#m-qty").value);
  let res;
  if (action === "buy") res = await api("/api/buy", { asset_id: SELECTED.id, shares: qty });
  else if (action === "sell") res = await api("/api/sell", { asset_id: SELECTED.id, shares: qty });
  else res = await api("/api/sell_all", { asset_id: SELECTED.id });

  if (!res.ok) {
    $("#m-error").textContent = res.error || "Operação falhou.";
    play("error");
    return;
  }
  $("#m-error").textContent = "";
  STATE = res.state;
  // Atualiza referência do ativo selecionado com novos dados.
  SELECTED = STATE.assets.find((x) => x.id === SELECTED.id);
  renderAll();
  play(action === "buy" ? "buy" : "sell");
}

/* ----------------------------------------------------------- controle de tempo */
async function advance(days) {
  const res = await api("/api/advance", { days });
  STATE = res;
  renderAll();
  // Mostra banner se ocorreu evento econômico global.
  if (STATE.last_event) showEventBanner(STATE.last_event);
  play("tick");
}

function showEventBanner(ev) {
  const b = $("#event-banner");
  b.textContent = ev.label;
  b.className = "event-banner " + ev.tone;
  play(ev.tone === "good" ? "boom" : "crash");
  setTimeout(() => b.classList.add("hidden"), 3500);
}

// Velocidade do modo automático: slider 1..10 -> intervalo entre 1500ms e 250ms.
function autoInterval() {
  const v = parseInt($("#speed").value, 10);
  return 1700 - v * 150;
}

function toggleAuto() {
  const btn = $("#btn-auto");
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
    btn.textContent = "▶ Auto";
    btn.classList.remove("active");
  } else {
    btn.textContent = "⏸ Pausar";
    btn.classList.add("active");
    autoTimer = setInterval(() => advance(1), autoInterval());
  }
}

/* ----------------------------------------------------------- sons opcionais */
// A síntese de áudio fica no módulo Sounds (static/js/sounds.js).
// Aqui só repassamos a chamada, respeitando a preferência do usuário.
function play(type) {
  Sounds.play(type);
}

function updateSoundBtn() {
  $("#btn-sound").textContent = soundOn ? "🔊" : "🔇";
}

/* ----------------------------------------------------------- eventos da UI */
function bindEvents() {
  // Botões de avanço de tempo (+1 dia / semana / mês).
  document.querySelectorAll(".time-btn[data-days]").forEach((b) =>
    b.addEventListener("click", () => advance(parseInt(b.dataset.days, 10)))
  );
  $("#btn-auto").addEventListener("click", toggleAuto);
  $("#speed").addEventListener("input", () => {
    $("#speed-val").textContent = $("#speed").value;
    // Se estiver em auto, reinicia com a nova velocidade.
    if (autoTimer) { toggleAuto(); toggleAuto(); }
  });

  // Reset (com confirmação).
  $("#btn-reset").addEventListener("click", async () => {
    if (!confirm("Reiniciar a simulação? Todo o progresso será perdido.")) return;
    if (autoTimer) toggleAuto();
    STATE = await api("/api/reset", {});
    renderAll();
  });

  // Som on/off (salvo no localStorage).
  $("#btn-sound").addEventListener("click", () => {
    soundOn = !soundOn;
    Sounds.setEnabled(soundOn);
    localStorage.setItem("investsim_sound", soundOn ? "on" : "off");
    updateSoundBtn();
    if (soundOn) Sounds.play("click"); // feedback ao reativar
  });

  // Abas do gráfico.
  document.querySelectorAll(".chart-tabs .tab").forEach((t) =>
    t.addEventListener("click", () => {
      document.querySelectorAll(".chart-tabs .tab").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      chartMode = t.dataset.chart;
      renderChart();
    })
  );

  // Modal.
  $("#modal-close").addEventListener("click", closeModal);
  $("#trade-modal").addEventListener("click", (e) => {
    if (e.target.id === "trade-modal") closeModal();
  });
  $("#m-qty").addEventListener("input", updateCost);
  $("#m-buy").addEventListener("click", () => doTrade("buy"));
  $("#m-sell").addEventListener("click", () => doTrade("sell"));
  $("#m-sellall").addEventListener("click", () => doTrade("sellall"));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  // Redesenha o gráfico ao redimensionar a janela (responsivo).
  window.addEventListener("resize", () => { if (STATE) { renderChart(); renderMarket(); } });
}

/* ----------------------------------------------------------- inicialização */
document.addEventListener("DOMContentLoaded", () => {
  Sounds.setEnabled(soundOn); // aplica a preferência salva no localStorage
  updateSoundBtn();
  bindEvents();
  refresh();
});
