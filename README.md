# 📈 InvestSim — Simulador de Investimentos Fictício

Um mini "mercado financeiro" **100% fictício, interativo e visual**, feito com
**Python + Flask** no backend e **HTML, CSS e JavaScript puro** no frontend
(sem frameworks pesados). Compre cotas imaginárias, avance o tempo e acompanhe
lucros, prejuízos e eventos econômicos aleatórios em um painel estilo plataforma
de trading.

> ⚠️ Tudo aqui é fictício e educacional. Nenhum valor representa o mercado real.

---

## ✨ Funcionalidades

- **6 cotas** com perfis de risco diferentes (Baixo / Médio / Alto)
- **Motor de aleatoriedade inteligente**: tendência, volatilidade, viés de alta/queda
- **Eventos econômicos raros**: 📉 crise, 🚀 boom, altas repentinas e quedas bruscas
- **Controle de tempo**: avançar +1 dia, +1 semana, +1 mês, **modo automático** com
  **velocidade ajustável** e **pausa**
- **Compra e venda**: comprar, comprar mais (preço médio), vender parcial e vender tudo
- **Carteira detalhada**: lucro/prejuízo, preço médio, patrimônio total, saldo restante
- **Gráficos** em `<canvas>` puro: patrimônio ao longo do tempo e evolução das cotas + sparklines
- **Estatísticas**, **ranking das melhores cotas**, **indicador de risco** e **tooltips**
- **Históricos** de transações e de eventos do mercado
- **Sons opcionais** (Web Audio API, sem arquivos), **salvamento automático** (JSON) e **reset**
- **Tema escuro, moderno e responsivo**, com animações suaves

---

## 📁 Estrutura do projeto

```
simulador-de-investimentos/
├── app.py                 # Servidor Flask: rotas e persistência
├── simulator.py           # Motor do simulador (lógica de negócio)
├── requirements.txt       # Dependências (Flask)
├── data.json              # Estado salvo (criado automaticamente)
├── README.md
├── templates/
│   └── index.html         # Página principal
└── static/
    ├── css/
    │   └── style.css      # Tema escuro / layout responsivo
    ├── js/
    │   ├── chart.js       # Mini biblioteca de gráficos em canvas
    │   └── app.js         # Lógica do frontend
    └── img/               # Imagens (opcional)
```

---

## 🚀 Instalação e execução

Pré-requisito: **Python 3.9+**.

### 1. (Opcional, recomendado) Crie um ambiente virtual

**Windows (PowerShell):**
```powershell
python -m venv venv
venv\Scripts\Activate.ps1
```

**Linux / macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### 2. Instale as dependências
```bash
pip install -r requirements.txt
```

### 3. Rode o servidor
```bash
python app.py
```

### 4. Abra no navegador
```
http://127.0.0.1:5000
```

---

## 🔌 Rotas da API (JSON)

| Método | Rota             | Descrição                                  |
|--------|------------------|--------------------------------------------|
| GET    | `/`              | Página principal (HTML)                    |
| GET    | `/api/state`     | Estado completo do simulador               |
| POST   | `/api/advance`   | Avança o tempo `{ "days": 1 \| 7 \| 30 }`  |
| POST   | `/api/buy`       | Compra `{ "asset_id", "shares" }`          |
| POST   | `/api/sell`      | Vende `{ "asset_id", "shares" }`           |
| POST   | `/api/sell_all`  | Vende toda a posição `{ "asset_id" }`      |
| POST   | `/api/reset`     | Reinicia a simulação                       |

---

## 🛠️ Como expandir

- **Novas cotas**: adicione um item em `DEFAULT_ASSETS` (em `simulator.py`).
- **Novos eventos**: edite `_roll_global_event` / `_step_asset` em `simulator.py`.
- **Saldo inicial**: mude `INITIAL_BALANCE` em `simulator.py`.
- **Novos gráficos**: a `ChartLib` em `static/js/chart.js` aceita várias séries.

O código é todo comentado em português para facilitar o aprendizado. 🚀
