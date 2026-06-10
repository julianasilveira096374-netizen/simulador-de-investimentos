"""
app.py
======
Servidor Flask do InvestSim — Simulador de Investimentos.

Responsabilidades:
  - servir a página principal (HTML/CSS/JS)
  - expor rotas JSON para o frontend conversar com o motor (simulator.py)
  - persistir o estado em um arquivo JSON simples (sem banco de dados)

Execução:
  pip install -r requirements.txt
  python app.py
  abra http://127.0.0.1:5000 no navegador
"""

import json
import os

from flask import Flask, jsonify, render_template, request

from simulator import Simulator

app = Flask(__name__)

# Caminho do arquivo de salvamento (armazenamento simples, sem banco de dados).
SAVE_FILE = os.path.join(os.path.dirname(__file__), "data.json")

# Estado global do simulador, mantido em memória durante a execução do servidor.
sim = None


# ---------------------------------------------------------------------------
# Persistência: carregar / salvar o estado em data.json
# ---------------------------------------------------------------------------
def load_state():
    """Carrega o estado salvo do disco (se existir) ou cria um novo simulador."""
    global sim
    if os.path.exists(SAVE_FILE):
        try:
            with open(SAVE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            sim = Simulator(state=data)
            return
        except (json.JSONDecodeError, OSError):
            # Arquivo corrompido -> recomeça do zero.
            pass
    sim = Simulator()


def save_state():
    """Grava o estado atual no arquivo JSON."""
    try:
        with open(SAVE_FILE, "w", encoding="utf-8") as f:
            json.dump(sim.to_dict(), f, ensure_ascii=False, indent=2)
    except OSError:
        pass  # falha de escrita não deve derrubar a aplicação


# ---------------------------------------------------------------------------
# Rotas de página
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    """Serve a interface principal do simulador."""
    return render_template("index.html")


# ---------------------------------------------------------------------------
# Rotas de API (JSON)
# ---------------------------------------------------------------------------
@app.route("/api/state")
def api_state():
    """Retorna o estado completo do simulador."""
    return jsonify(sim.to_dict())


@app.route("/api/advance", methods=["POST"])
def api_advance():
    """Avança o tempo. Corpo: { "days": <int> }  (1=dia, 7=semana, 30=mês)."""
    data = request.get_json(silent=True) or {}
    days = data.get("days", 1)
    sim.advance(days)
    save_state()
    return jsonify(sim.to_dict())


@app.route("/api/buy", methods=["POST"])
def api_buy():
    """Compra cotas. Corpo: { "asset_id": str, "shares": float }."""
    data = request.get_json(silent=True) or {}
    result = sim.buy(data.get("asset_id"), data.get("shares"))
    if result["ok"]:
        save_state()
    return jsonify({**result, "state": sim.to_dict()})


@app.route("/api/sell", methods=["POST"])
def api_sell():
    """Vende cotas. Corpo: { "asset_id": str, "shares": float }."""
    data = request.get_json(silent=True) or {}
    result = sim.sell(data.get("asset_id"), data.get("shares"))
    if result["ok"]:
        save_state()
    return jsonify({**result, "state": sim.to_dict()})


@app.route("/api/sell_all", methods=["POST"])
def api_sell_all():
    """Encerra uma posição (vende tudo). Corpo: { "asset_id": str }."""
    data = request.get_json(silent=True) or {}
    result = sim.sell_all(data.get("asset_id"))
    if result["ok"]:
        save_state()
    return jsonify({**result, "state": sim.to_dict()})


@app.route("/api/reset", methods=["POST"])
def api_reset():
    """Reinicia o simulador para o estado inicial e zera o arquivo salvo."""
    sim.reset()
    save_state()
    return jsonify(sim.to_dict())


# Carrega o estado assim que o módulo é importado (funciona com `flask run`
# e com `python app.py`).
load_state()


if __name__ == "__main__":
    # debug=True recarrega automaticamente ao editar o código (ótimo para desenvolver).
    app.run(host="127.0.0.1", port=5000, debug=True)
