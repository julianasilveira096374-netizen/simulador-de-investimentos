"""
simulator.py
============
Núcleo (engine) do simulador de investimentos InvestSim.

Aqui fica TODA a lógica de negócio:
  - criação das cotas/investimentos
  - avanço do tempo (motor de aleatoriedade)
  - compra / venda de cotas
  - cálculo de patrimônio, lucro e estatísticas
  - eventos econômicos raros (crise, boom, etc.)

O Flask (app.py) apenas usa esta classe e expõe rotas JSON.
Manter a lógica separada deixa o código fácil de expandir e testar.
"""

import random
import math
import time


# ---------------------------------------------------------------------------
# Definição das cotas iniciais.
# Cada cota tem um "perfil de risco" que controla o comportamento aleatório.
#
#   volatility -> quão forte o preço oscila por dia (0.01 = calmo, 0.20 = caos)
#   trend      -> tendência diária média (drift). Positivo sobe, negativo cai.
#   up_chance  -> probabilidade de receber um "empurrão" para cima
#   down_chance-> probabilidade de receber um "empurrão" para baixo
#   risk       -> rótulo textual usado na interface (Baixo / Médio / Alto)
# ---------------------------------------------------------------------------
DEFAULT_ASSETS = [
    {
        "id": "tesouro",
        "name": "Tesouro Direto",
        "desc": "Investimento seguro. Sobe devagar e quase nunca cai forte.",
        "price": 100.0,
        "volatility": 0.010,
        "trend": 0.0006,
        "up_chance": 0.55,
        "down_chance": 0.25,
        "risk": "Baixo",
    },
    {
        "id": "banco",
        "name": "BancoNova S.A.",
        "desc": "Ação tradicional e estável. Oscilações moderadas.",
        "price": 80.0,
        "volatility": 0.025,
        "trend": 0.0005,
        "up_chance": 0.52,
        "down_chance": 0.40,
        "risk": "Baixo",
    },
    {
        "id": "tech",
        "name": "TechVerso",
        "desc": "Empresa de tecnologia em crescimento. Risco médio, bom potencial.",
        "price": 150.0,
        "volatility": 0.05,
        "trend": 0.0010,
        "up_chance": 0.53,
        "down_chance": 0.45,
        "risk": "Médio",
    },
    {
        "id": "energia",
        "name": "EnergiaVerde",
        "desc": "Setor de energia. Sensível a eventos econômicos.",
        "price": 60.0,
        "volatility": 0.045,
        "trend": 0.0004,
        "up_chance": 0.50,
        "down_chance": 0.48,
        "risk": "Médio",
    },
    {
        "id": "cripto",
        "name": "CriptoLuna",
        "desc": "Criptomoeda de alta volatilidade. Pode explodir... ou quebrar. Altíssimo risco.",
        "price": 30.0,
        "volatility": 0.14,
        "trend": 0.0008,
        "up_chance": 0.50,
        "down_chance": 0.50,
        "risk": "Alto",
    },
    {
        "id": "startup",
        "name": "Startup X",
        "desc": "Aposta agressiva. Sonho de lucro gigante com risco de virar pó.",
        "price": 20.0,
        "volatility": 0.18,
        "trend": 0.0009,
        "up_chance": 0.49,
        "down_chance": 0.52,
        "risk": "Alto",
    },
]

INITIAL_BALANCE = 10000.0  # saldo inicial do usuário


class Simulator:
    """Mantém todo o estado do simulador e a lógica de simulação."""

    def __init__(self, state=None):
        # Se recebermos um estado salvo (JSON), carregamos. Senão, começamos do zero.
        if state:
            self.__dict__.update(self._sanitize(state))
        else:
            self.reset()

    # ------------------------------------------------------------------ reset
    def reset(self):
        """Reinicia o simulador para o estado inicial padrão."""
        self.day = 0  # contador de dias simulados
        self.balance = INITIAL_BALANCE  # dinheiro disponível (caixa)
        # Cópia profunda das cotas, adicionando histórico de preço
        self.assets = []
        for a in DEFAULT_ASSETS:
            asset = dict(a)
            asset["history"] = [round(asset["price"], 2)]
            self.assets.append(asset)
        # Carteira: quantas cotas o usuário tem de cada ativo + preço médio de compra
        # estrutura: { asset_id: {"shares": float, "avg_price": float} }
        self.holdings = {}
        # Histórico de transações (compras/vendas)
        self.transactions = []
        # Histórico do patrimônio total ao longo do tempo (para o gráfico)
        self.net_worth_history = [round(INITIAL_BALANCE, 2)]
        # Último evento econômico ocorrido (para mostrar na interface)
        self.last_event = None
        # Linha do tempo de eventos
        self.events_log = []

    @staticmethod
    def _sanitize(state):
        """Garante que apenas chaves esperadas sejam carregadas de um estado salvo."""
        allowed = {
            "day", "balance", "assets", "holdings",
            "transactions", "net_worth_history", "last_event", "events_log",
        }
        return {k: v for k, v in state.items() if k in allowed}

    # ------------------------------------------------------------- utilidades
    def get_asset(self, asset_id):
        """Retorna o dicionário do ativo pelo id, ou None."""
        for a in self.assets:
            if a["id"] == asset_id:
                return a
        return None

    def net_worth(self):
        """Patrimônio total = caixa + valor de mercado de todas as cotas."""
        total = self.balance
        for asset_id, h in self.holdings.items():
            asset = self.get_asset(asset_id)
            if asset:
                total += h["shares"] * asset["price"]
        return total

    # ---------------------------------------------------- motor de simulação
    def _roll_global_event(self):
        """
        Sorteia, com baixa probabilidade, um evento econômico GLOBAL que
        afeta todos os ativos de uma vez. Retorna um multiplicador base
        aplicado a todos, ou None se nada acontecer.
        """
        r = random.random()
        if r < 0.012:  # ~1.2% ao dia -> CRISE
            self.last_event = {"type": "crise", "label": "📉 Crise econômica!",
                               "tone": "bad", "day": self.day}
            return -random.uniform(0.08, 0.20)
        elif r < 0.024:  # BOOM econômico
            self.last_event = {"type": "boom", "label": "🚀 Boom econômico!",
                               "tone": "good", "day": self.day}
            return random.uniform(0.07, 0.18)
        return None

    def _step_asset(self, asset, global_shock):
        """
        Avança UM dia para UM ativo, aplicando:
          - tendência (drift)
          - choque aleatório gaussiano proporcional à volatilidade
          - viés direcional (up_chance / down_chance)
          - eventos raros individuais (alta repentina / queda brusca)
          - choque econômico global (se houver)
        """
        vol = asset["volatility"]
        change = asset["trend"]  # começa com a tendência base

        # Choque aleatório (distribuição normal -> a maioria dos dias é calma,
        # mas dias extremos acontecem). Escala pela volatilidade do ativo.
        change += random.gauss(0, vol)

        # Viés direcional: às vezes o ativo recebe um empurrão extra.
        r = random.random()
        if r < asset["up_chance"]:
            change += vol * random.uniform(0, 0.8)
        elif r > 1 - asset["down_chance"]:
            change -= vol * random.uniform(0, 0.8)

        # Eventos individuais raros (mais prováveis em ativos voláteis).
        event_chance = 0.02 + vol  # cripto/startup têm muito mais chance
        if random.random() < event_chance:
            if random.random() < 0.5:
                spike = random.uniform(0.10, 0.45) * (0.5 + vol)
                change += spike
                self._log_event(f"📈 {asset['name']}: alta repentina!", "good")
            else:
                crash = random.uniform(0.10, 0.45) * (0.5 + vol)
                change -= crash
                self._log_event(f"💥 {asset['name']}: queda brusca!", "bad")

        # Choque global (crise/boom) afeta mais os ativos arriscados.
        if global_shock is not None:
            change += global_shock * (0.6 + vol * 3)

        # Aplica a variação ao preço, com piso para o preço nunca zerar.
        new_price = asset["price"] * (1 + change)
        asset["price"] = max(round(new_price, 2), 0.5)
        asset["history"].append(asset["price"])

        # Limita o histórico para não crescer infinitamente (mantém últimos 400 pontos).
        if len(asset["history"]) > 400:
            asset["history"] = asset["history"][-400:]

    def _log_event(self, label, tone):
        """Registra um evento na linha do tempo (limitada aos últimos 30)."""
        self.events_log.insert(0, {"label": label, "tone": tone, "day": self.day})
        self.events_log = self.events_log[:30]

    def advance(self, days=1):
        """Avança o tempo em N dias, simulando cada dia individualmente."""
        days = max(1, int(days))
        self.last_event = None
        for _ in range(days):
            self.day += 1
            global_shock = self._roll_global_event()
            if self.last_event:
                self._log_event(self.last_event["label"], self.last_event["tone"])
            for asset in self.assets:
                self._step_asset(asset, global_shock)
            # Registra o patrimônio do dia para o gráfico de evolução.
            self.net_worth_history.append(round(self.net_worth(), 2))
        if len(self.net_worth_history) > 600:
            self.net_worth_history = self.net_worth_history[-600:]
        return {"ok": True, "day": self.day}

    # ------------------------------------------------------- compra e venda
    def buy(self, asset_id, shares):
        """Compra `shares` cotas de um ativo, debitando do caixa."""
        asset = self.get_asset(asset_id)
        if not asset:
            return {"ok": False, "error": "Ativo inexistente."}
        try:
            shares = float(shares)
        except (TypeError, ValueError):
            return {"ok": False, "error": "Quantidade inválida."}
        if shares <= 0:
            return {"ok": False, "error": "Quantidade deve ser positiva."}

        cost = shares * asset["price"]
        if cost > self.balance + 1e-9:
            return {"ok": False, "error": "Saldo insuficiente."}

        self.balance -= cost

        # Atualiza a posição calculando o novo PREÇO MÉDIO de compra.
        pos = self.holdings.get(asset_id, {"shares": 0.0, "avg_price": 0.0})
        total_shares = pos["shares"] + shares
        # média ponderada: (qtd_antiga*preço_antigo + qtd_nova*preço_atual) / total
        pos["avg_price"] = (pos["shares"] * pos["avg_price"] + cost) / total_shares
        pos["shares"] = total_shares
        self.holdings[asset_id] = pos

        self._record_tx("compra", asset, shares, asset["price"], cost)
        return {"ok": True}

    def sell(self, asset_id, shares):
        """Vende `shares` cotas de um ativo, creditando o caixa."""
        asset = self.get_asset(asset_id)
        if not asset:
            return {"ok": False, "error": "Ativo inexistente."}
        pos = self.holdings.get(asset_id)
        if not pos or pos["shares"] <= 0:
            return {"ok": False, "error": "Você não possui esse ativo."}
        try:
            shares = float(shares)
        except (TypeError, ValueError):
            return {"ok": False, "error": "Quantidade inválida."}
        if shares <= 0:
            return {"ok": False, "error": "Quantidade deve ser positiva."}
        # Não permite vender mais do que possui (tolerância para floats).
        shares = min(shares, pos["shares"])

        revenue = shares * asset["price"]
        self.balance += revenue
        pos["shares"] -= shares

        # Se zerou a posição, remove da carteira.
        if pos["shares"] <= 1e-6:
            del self.holdings[asset_id]
        else:
            self.holdings[asset_id] = pos

        self._record_tx("venda", asset, shares, asset["price"], revenue)
        return {"ok": True}

    def sell_all(self, asset_id):
        """Encerra a posição: vende TODAS as cotas de um ativo."""
        pos = self.holdings.get(asset_id)
        if not pos:
            return {"ok": False, "error": "Você não possui esse ativo."}
        return self.sell(asset_id, pos["shares"])

    def _record_tx(self, kind, asset, shares, price, total):
        """Adiciona uma transação ao histórico (limite de 100 registros)."""
        self.transactions.insert(0, {
            "day": self.day,
            "kind": kind,                 # "compra" ou "venda"
            "asset": asset["name"],
            "asset_id": asset["id"],
            "shares": round(shares, 4),
            "price": round(price, 2),
            "total": round(total, 2),
            "ts": int(time.time()),
        })
        self.transactions = self.transactions[:100]

    # ------------------------------------------------------------ relatórios
    def portfolio_view(self):
        """Monta uma lista detalhada das posições da carteira para o frontend."""
        items = []
        for asset_id, pos in self.holdings.items():
            asset = self.get_asset(asset_id)
            if not asset:
                continue
            market_value = pos["shares"] * asset["price"]
            invested = pos["shares"] * pos["avg_price"]
            profit = market_value - invested
            profit_pct = (profit / invested * 100) if invested > 0 else 0.0
            items.append({
                "id": asset_id,
                "name": asset["name"],
                "shares": round(pos["shares"], 4),
                "avg_price": round(pos["avg_price"], 2),
                "current_price": asset["price"],
                "market_value": round(market_value, 2),
                "invested": round(invested, 2),
                "profit": round(profit, 2),
                "profit_pct": round(profit_pct, 2),
            })
        # Ordena por valor de mercado (maior primeiro).
        items.sort(key=lambda x: x["market_value"], reverse=True)
        return items

    def ranking(self):
        """Ranking das cotas pela variação percentual recente (desde o início)."""
        rank = []
        for a in self.assets:
            first = a["history"][0] if a["history"] else a["price"]
            change_pct = ((a["price"] - first) / first * 100) if first else 0.0
            # variação do último dia
            if len(a["history"]) >= 2:
                prev = a["history"][-2]
                day_pct = ((a["price"] - prev) / prev * 100) if prev else 0.0
            else:
                day_pct = 0.0
            rank.append({
                "id": a["id"],
                "name": a["name"],
                "price": a["price"],
                "change_pct": round(change_pct, 2),
                "day_pct": round(day_pct, 2),
                "risk": a["risk"],
            })
        rank.sort(key=lambda x: x["change_pct"], reverse=True)
        return rank

    def stats(self):
        """Estatísticas detalhadas do desempenho do usuário."""
        nw = self.net_worth()
        invested_total = sum(p["shares"] * p["avg_price"] for p in self.holdings.values())
        market_total = nw - self.balance
        profit_total = market_total - invested_total
        roi = ((nw - INITIAL_BALANCE) / INITIAL_BALANCE * 100) if INITIAL_BALANCE else 0.0
        buys = sum(1 for t in self.transactions if t["kind"] == "compra")
        sells = sum(1 for t in self.transactions if t["kind"] == "venda")
        peak = max(self.net_worth_history) if self.net_worth_history else nw
        return {
            "net_worth": round(nw, 2),
            "balance": round(self.balance, 2),
            "invested": round(invested_total, 2),
            "market_value": round(market_total, 2),
            "profit": round(profit_total, 2),
            "roi": round(roi, 2),
            "initial_balance": INITIAL_BALANCE,
            "peak": round(peak, 2),
            "buys": buys,
            "sells": sells,
        }

    def to_dict(self):
        """Serializa o estado completo do simulador para enviar como JSON."""
        return {
            "day": self.day,
            "balance": round(self.balance, 2),
            "assets": self.assets,
            "holdings": self.holdings,
            "transactions": self.transactions,
            "net_worth_history": self.net_worth_history,
            "portfolio": self.portfolio_view(),
            "ranking": self.ranking(),
            "stats": self.stats(),
            "events_log": self.events_log,
            "last_event": self.last_event,
        }
