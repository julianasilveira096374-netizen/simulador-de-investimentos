/* =========================================================================
   sounds.js — Sistema de sons do InvestSim.
   Todos os sons são SINTETIZADOS na hora pela Web Audio API — não há nenhum
   arquivo de áudio para baixar. Isso mantém o projeto leve e sem dependências.

   Cada som é montado a partir de "notas" (osciladores) com envelope de volume,
   o que dá um resultado bem mais agradável do que um simples bipe.
   ========================================================================= */

const Sounds = (() => {
  let ctx = null;           // AudioContext (criado só no 1º uso — regra dos navegadores)
  let enabled = true;       // liga/desliga global
  let master = null;        // ganho mestre (volume geral)

  /** Garante que o AudioContext exista e esteja "resumido". */
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;            // navegador sem suporte
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;         // volume mestre
      master.connect(ctx.destination);
    }
    // Navegadores suspendem o áudio até a 1ª interação do usuário.
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  /**
   * Toca uma nota única.
   * @param {number} freq   frequência em Hz
   * @param {number} start  atraso (s) a partir de agora
   * @param {number} dur    duração (s)
   * @param {string} type   forma de onda: sine | triangle | square | sawtooth
   * @param {number} vol    volume de pico (0..1)
   */
  function note(freq, start, dur, type = "sine", vol = 0.2) {
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);

    // Envelope ADSR simplificado: ataque rápido + decaimento exponencial.
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Glissando: varre a frequência de `f1` até `f2` (usado em boom/crash). */
  function sweep(f1, f2, start, dur, type = "sawtooth", vol = 0.2) {
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f1, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // ---- Biblioteca de efeitos. Cada um monta uma pequena "melodia". ----
  const FX = {
    // Compra: dois tons subindo (sensação positiva de confirmação).
    buy() { note(523, 0, 0.12, "triangle", 0.22); note(784, 0.09, 0.18, "triangle", 0.22); },
    // Venda: dois tons descendo (caixa registradora).
    sell() { note(660, 0, 0.12, "triangle", 0.22); note(440, 0.09, 0.2, "triangle", 0.22); },
    // Avanço de tempo: clique curto e discreto.
    tick() { note(300, 0, 0.05, "square", 0.08); },
    // Erro: zumbido grave curto.
    error() { note(150, 0, 0.18, "sawtooth", 0.18); note(120, 0.05, 0.2, "sawtooth", 0.15); },
    // Boom econômico: arpejo ascendente alegre.
    boom() {
      [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.08, 0.22, "triangle", 0.2));
      sweep(400, 1200, 0, 0.4, "sine", 0.08);
    },
    // Crise: varredura descendente sombria.
    crash() {
      sweep(400, 60, 0, 0.6, "sawtooth", 0.22);
      note(110, 0.1, 0.5, "square", 0.12);
    },
    // Clique genérico de interface.
    click() { note(420, 0, 0.04, "sine", 0.08); },
  };

  /** Toca um efeito pelo nome (não faz nada se o som estiver desligado). */
  function play(name) {
    if (!enabled) return;
    if (!ensure()) return;            // sem suporte de áudio
    const fx = FX[name];
    if (fx) {
      try { fx(); } catch (e) { /* ignora falhas de áudio */ }
    }
  }

  /** Liga/desliga os sons e retorna o novo estado. */
  function setEnabled(on) { enabled = !!on; return enabled; }
  function isEnabled() { return enabled; }

  return { play, setEnabled, isEnabled };
})();
