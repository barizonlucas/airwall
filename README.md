<div align="center">

# 🧱 Airwall

**Transforme qualquer superfície em um quadro interativo — usando apenas um navegador e um projetor.**

Airwall combina **MediaPipe Hands**, **React**, **WebSockets** e **FastAPI** para capturar gestos da mão via webcam e projetá-los em tempo real como desenhos de laser e apagador, sem nenhum hardware especial além do que você já tem.

---

`Tracker (webcam)` → `WebSocket Broker (FastAPI)` → `Projector (canvas fullscreen)`

</div>

---

## ✨ Como Funciona

1. O **Tracker** abre a webcam do notebook/celular e usa **MediaPipe Hands** diretamente no browser para detectar 21 landmarks da mão.
2. Uma heurística leve classifica o gesto em **DRAW** (dedo indicador), **ERASE** (mão aberta) ou **IDLE**.
3. As coordenadas suavizadas por um filtro **EMA** são enviadas via **WebSocket** a um broker local.
4. O **Projector**, aberto em qualquer outro dispositivo (ex: um tablet Android conectado ao projetor), recebe as coordenadas e desenha no `<canvas>` em tela cheia — laser neon para DRAW, apagador para ERASE.

> **Sem cloud, sem conta, sem instalação nativa.** Tudo roda na rede local via browser.

---

## 📐 Arquitetura

```
┌──────────────────────────────────────────────────────────────────────┐
│  Rede Local (LAN / Wi-Fi)                                           │
│                                                                      │
│  ┌─────────────┐    WebSocket     ┌──────────────┐                  │
│  │   Tracker    │ ──────────────▶ │    Broker     │                  │
│  │  (React)     │   /ws/draw      │   (FastAPI)   │                  │
│  │  MediaPipe   │                 │   uvicorn     │                  │
│  │  no Browser  │                 └──────┬───────┘                  │
│  └─────────────┘                        │                            │
│                                          │  broadcast                │
│                              ┌───────────┴───────────┐              │
│                              ▼                       ▼              │
│                     ┌──────────────┐        ┌──────────────┐        │
│                     │  Projector 1  │        │  Projector N  │        │
│                     │  (Canvas)     │        │  (Canvas)     │        │
│                     └──────────────┘        └──────────────┘        │
└──────────────────────────────────────────────────────────────────────┘
```

### Por que Client-Side + Mensageria Local?

| Decisão | Justificativa |
|---------|---------------|
| **Processamento no browser** | MediaPipe Hands roda via WebAssembly/GPU diretamente no navegador. Zero dependência de servidor para IA — o broker é apenas um retransmissor de mensagens JSON. |
| **WebSocket local** | Latência ponta-a-ponta abaixo de **5ms** na mesma rede Wi-Fi. Sem roundtrip para a nuvem, sem jitter de internet. |
| **Broker stateless** | O servidor não processa nem armazena dados — apenas faz broadcast. Pode rodar em qualquer máquina da rede, até em um Raspberry Pi. |
| **Suavização client-side (EMA)** | O filtro de jitter roda no Tracker antes do envio, eliminando tremores sem adicionar latência de rede. |

---

## 🚀 Quick Start

### Pré-requisitos

- **Python 3.11+** (para o Broker)
- **Node.js 18+** (para o Cliente Web)
- Dispositivos na **mesma rede Wi-Fi / LAN**

### 1. Descubra seu IP local

```bash
# macOS
ifconfig | grep "inet " | grep -v 127.0.0.1

# Linux
hostname -I

# Windows
ipconfig | findstr IPv4
```

Anote o IP (ex: `192.168.1.42`). Você vai usá-lo nos passos seguintes.

---

### 2. Rodando o Broker (FastAPI)

```bash
cd server

# Crie e ative o ambiente virtual
python3 -m venv .venv
source .venv/bin/activate        # Linux/macOS
# .venv\Scripts\activate         # Windows

# Instale as dependências
pip install -r requirements.txt

# Inicie o broker na rede local
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Verifique se está rodando:

```bash
curl http://localhost:8000/health
# → {"status":"ok","connections":0}
```

O broker agora aceita conexões em `ws://<SEU-IP>:8000/ws/draw`.

---

### 3. Rodando o Cliente Web (React)

```bash
cd tracker

# Instale as dependências
npm install

# Inicie o dev server apontando para o broker
VITE_WS_URL=ws://<SEU-IP>:8000/ws/draw npm run dev
```

> O Vite já está configurado com `host: true`, então outros dispositivos na rede podem acessar o app pelo IP.

---

### 4. Abrindo as Views

| View | URL | Dispositivo |
|------|-----|-------------|
| **Tracker** | `http://<SEU-IP>:5173/` | Notebook/celular com webcam |
| **Projector** | `http://<SEU-IP>:5173/#projector` | Tablet/computador conectado ao projetor |

#### 📱 No Android conectado ao projetor

1. Conecte o dispositivo Android na mesma rede Wi-Fi.
2. Abra o **Chrome** e navegue até:
   ```
   http://<SEU-IP>:5173/#projector
   ```
3. Toque nos **três pontos (⋮)** → **"Adicionar à tela inicial"** para um atalho direto.
4. Ative o **modo tela cheia** (F11 no desktop ou rotação paisagem no Android).

A tela ficará completamente preta aguardando os comandos de desenho do Tracker.

---

## 🗂️ Estrutura do Projeto

```
airwall/
├── server/                        # Broker WebSocket (FastAPI + uvicorn)
│   ├── main.py                    # App, CORS, endpoints /health e /ws/draw
│   ├── connection_manager.py      # Gerenciador de conexões WebSocket
│   ├── models.py                  # Schema Pydantic (DrawMessage)
│   ├── requirements.txt           # Dependências Python
│   └── README.md                  # Docs específicos do servidor
│
├── tracker/                       # Cliente Web (Vite + React + TypeScript)
│   ├── src/
│   │   ├── components/
│   │   │   ├── TrackerView.tsx    # Webcam + MediaPipe + envio WS
│   │   │   └── ProjectorView.tsx  # Canvas fullscreen (laser + eraser)
│   │   ├── lib/
│   │   │   ├── gestures.ts        # Heurística DRAW / ERASE / IDLE
│   │   │   ├── drawHand.ts        # Renderização de landmarks no canvas
│   │   │   └── smoothing.ts       # Filtros EMA e SMA anti-jitter
│   │   ├── types/
│   │   │   └── mediapipe.d.ts     # Type declarations MediaPipe
│   │   ├── App.tsx                # Hash router (#tracker / #projector)
│   │   ├── main.tsx               # Entry point React
│   │   └── index.css              # Design system (dark theme)
│   ├── index.html                 # CDN scripts do MediaPipe
│   ├── vite.config.ts             # Dev server com host: true
│   └── package.json
│
└── .gitignore
```

---

## 🎮 Gestos Reconhecidos

| Gesto | Descrição | Ação no Projector |
|-------|-----------|-------------------|
| ☝️ **Dedo indicador** | Apenas o indicador estendido | **DRAW** — linha laser neon |
| 🖐️ **Mão aberta** | Todos os dedos estendidos | **ERASE** — apagador circular |
| ✊ **Qualquer outro** | Mão fechada, repouso, etc. | **IDLE** — pausa (nenhuma ação) |

---

## ⚙️ Configuração

### Variáveis de ambiente (Tracker)

| Variável | Default | Descrição |
|----------|---------|-----------|
| `VITE_WS_URL` | `ws://localhost:8000/ws/draw` | URL do WebSocket broker |

### Constantes ajustáveis

| Constante | Arquivo | Default | Descrição |
|-----------|---------|---------|-----------|
| `SMOOTH_ALPHA` | `TrackerView.tsx` | `0.35` | Fator EMA (↓ = mais suave) |
| `MOVE_THRESHOLD` | `TrackerView.tsx` | `0.005` | Delta mínimo para envio WS |
| `LASER_WIDTH` | `ProjectorView.tsx` | `3` | Espessura da linha laser (px) |
| `ERASER_RADIUS` | `ProjectorView.tsx` | `32` | Raio do apagador (px) |
| `GLOW_RADIUS` | `ProjectorView.tsx` | `18` | Raio do brilho neon (px) |

---

## 📄 Payload WebSocket

```json
{
  "x": 0.4231,
  "y": 0.7819,
  "state": "DRAW"
}
```

| Campo   | Tipo   | Range / Valores |
|---------|--------|-----------------|
| `x`     | float  | `0.0` (esquerda) → `1.0` (direita) |
| `y`     | float  | `0.0` (topo) → `1.0` (base) |
| `state` | string | `DRAW` · `ERASE` · `IDLE` |

---

## 🛠️ Tech Stack

| Camada | Tecnologia |
|--------|-----------|
| Gesture AI | MediaPipe Hands (WebAssembly, in-browser) |
| Frontend | React 19 · TypeScript · Vite 8 |
| Broker | FastAPI · uvicorn · WebSockets |
| Transporte | WebSocket (JSON sobre LAN) |

---

## 📝 License

MIT
