/* =========================================================================
   chart.js — Mini biblioteca de gráficos em <canvas> puro (sem dependências).
   Desenha gráficos de linha com várias séries, grade e área preenchida.
   Mantido simples de propósito para ser fácil de entender e expandir.
   ========================================================================= */

const ChartLib = (() => {
  // Paleta de cores usada para diferenciar as séries (cotas).
  const COLORS = ["#4f8cff", "#2ec27e", "#ffce5c", "#7c5cff", "#ff5470", "#3ddbd9"];

  /**
   * Desenha um ou mais gráficos de linha no canvas.
   * @param {HTMLCanvasElement} canvas
   * @param {Array<{label:string, data:number[], color?:string}>} series
   * @param {{fill?:boolean}} opts
   * @returns {Array} legenda [{label, color}]
   */
  function draw(canvas, series, opts = {}) {
    const ctx = canvas.getContext("2d");

    // Ajusta a resolução do canvas para telas retina (nitidez).
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 600;
    const cssH = canvas.clientHeight || 260;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const pad = { l: 52, r: 12, t: 14, b: 22 };
    const w = cssW - pad.l - pad.r;
    const h = cssH - pad.t - pad.b;

    // Calcula os limites (mínimo/máximo) considerando todas as séries.
    let min = Infinity, max = -Infinity, maxLen = 0;
    series.forEach((s) => {
      maxLen = Math.max(maxLen, s.data.length);
      s.data.forEach((v) => { if (v < min) min = v; if (v > max) max = v; });
    });
    if (!isFinite(min)) { min = 0; max = 1; }
    if (min === max) { min -= 1; max += 1; }
    const padRange = (max - min) * 0.08;
    min -= padRange; max += padRange;

    // Funções de mapeamento dado -> pixel.
    const xAt = (i, len) => pad.l + (len <= 1 ? 0 : (i / (len - 1)) * w);
    const yAt = (v) => pad.t + h - ((v - min) / (max - min)) * h;

    // ---- Grade horizontal + rótulos do eixo Y ----
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.fillStyle = "#8a96ab";
    ctx.font = "11px Segoe UI, sans-serif";
    ctx.lineWidth = 1;
    const lines = 4;
    for (let i = 0; i <= lines; i++) {
      const y = pad.t + (h / lines) * i;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + w, y);
      ctx.stroke();
      const val = max - ((max - min) / lines) * i;
      ctx.fillText(formatShort(val), 6, y + 4);
    }

    // ---- Desenha cada série ----
    series.forEach((s, idx) => {
      const color = s.color || COLORS[idx % COLORS.length];
      const len = s.data.length;
      if (len === 0) return;

      // Área preenchida (gradiente) — só quando há uma única série (patrimônio).
      if (opts.fill && series.length === 1) {
        const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + h);
        grad.addColorStop(0, hexToRgba(color, 0.35));
        grad.addColorStop(1, hexToRgba(color, 0));
        ctx.beginPath();
        ctx.moveTo(xAt(0, len), yAt(s.data[0]));
        s.data.forEach((v, i) => ctx.lineTo(xAt(i, len), yAt(v)));
        ctx.lineTo(xAt(len - 1, len), pad.t + h);
        ctx.lineTo(xAt(0, len), pad.t + h);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Linha principal.
      ctx.beginPath();
      s.data.forEach((v, i) => {
        const x = xAt(i, len), y = yAt(v);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.stroke();
    });

    // Retorna info de legenda para o app montar embaixo do gráfico.
    return series.map((s, idx) => ({
      label: s.label,
      color: s.color || COLORS[idx % COLORS.length],
    }));
  }

  /** Desenha um mini "sparkline" (linha pequena, sem eixos) dentro de um canvas. */
  function sparkline(canvas, data) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, hgt = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = hgt * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    if (data.length < 2) return;

    let min = Math.min(...data), max = Math.max(...data);
    if (min === max) { min -= 1; max += 1; }
    const up = data[data.length - 1] >= data[0];
    const color = up ? "#2ec27e" : "#ff5470";
    const x = (i) => (i / (data.length - 1)) * w;
    const y = (v) => hgt - ((v - min) / (max - min)) * (hgt - 4) - 2;

    ctx.beginPath();
    data.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // ---- Helpers ----
  function formatShort(v) {
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + "k";
    return v.toFixed(0);
  }
  function hexToRgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  return { draw, sparkline, COLORS };
})();
