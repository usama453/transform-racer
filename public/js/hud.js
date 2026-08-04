const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(network) {
    this.network = network;
    this.modeEl = $('mode-value');
    this.speedEl = $('speed-num');
    this.nitroFill = $('nitro-fill');
    this.nitroLabel = document.querySelector('.nitro-label');
    this.onlineEl = $('players-online');
    this.warningEl = $('warning');
    this.chatLog = $('chat-log');
    this.chatInput = $('chat-input');
    this.statusEl = $('server-status');
    this.nameInput = $('name-input');
    this.chatTimer = null;
    this.warnTimer = null;

    this.lastSpeed = -1;
    this.lastNitro = -1;
    this.lastMode = '';
    this.lastCount = -1;
    this.lastOverboost = false;

    network.onChat = (msg) => this.addChatMessage(msg.name, msg.text, msg.id === network.myId);
  }

  setConnecting(text) {
    if (this.statusEl) {
      this.statusEl.textContent = text;
      this.statusEl.className = 'connecting';
    }
  }

  setConnected() {
    if (this.statusEl) {
      this.statusEl.textContent = 'Connected - click JOIN to play';
      this.statusEl.className = 'connected';
    }
  }

  setError(text) {
    if (this.statusEl) {
      this.statusEl.textContent = text;
      this.statusEl.className = 'error';
    }
  }

  setOnline(count) {
    if (count === this.lastCount) return;
    this.lastCount = count;
    this.onlineEl.textContent = `${count} online`;
  }

  update(v) {
    const { mode, speed, nitro, overboost, boostFrac, players } = v;

    if (mode !== this.lastMode) {
      this.lastMode = mode;
      this.modeEl.textContent = mode === 'plane' ? 'FLIGHT' : 'CAR';
      this.modeEl.classList.toggle('flight', mode === 'plane');
    }

    const kmh = Math.round(speed * 3.6);
    if (kmh !== this.lastSpeed) {
      this.lastSpeed = kmh;
      this.speedEl.textContent = kmh;
    }

    const frac = overboost ? boostFrac : 1;
    const pct = Math.round(frac * 100);
    if (pct !== this.lastNitro) {
      this.lastNitro = pct;
      this.nitroFill.style.width = `${pct}%`;
      this.nitroFill.classList.toggle('low', frac < 0.25);
    }
    if (overboost !== this.lastOverboost) {
      this.lastOverboost = overboost;
      this.nitroLabel.textContent = overboost ? '2X BOOST ACTIVE' : 'NITROUS / BOOST';
    }

    this.setOnline(players);
  }

  showWarning(text) {
    this.warningEl.textContent = text;
    this.warningEl.classList.remove('hidden');
    clearTimeout(this.warnTimer);
    this.warnTimer = setTimeout(() => {
      this.warningEl.classList.add('hidden');
    }, 1800);
  }

  openChat() {
    this.chatInput.classList.add('active');
    this.chatInput.focus();
  }

  closeChat() {
    this.chatInput.classList.remove('active');
    this.chatInput.blur();
  }

  addChatMessage(name, text, mine) {
    const div = document.createElement('div');
    div.className = 'msg';
    const nameEl = document.createElement('span');
    nameEl.className = 'name';
    nameEl.style.color = mine ? '#4dc3ff' : '#ffd84d';
    nameEl.textContent = name + ':';
    div.appendChild(nameEl);
    div.appendChild(document.createTextNode(text));
    this.chatLog.appendChild(div);

    while (this.chatLog.children.length > 12) {
      this.chatLog.removeChild(this.chatLog.firstChild);
    }
    requestAnimationFrame(() => div.classList.add('visible'));
    clearTimeout(this.chatTimer);
    this.chatTimer = setTimeout(() => {
      this.chatLog.innerHTML = '';
    }, 20000);
  }
}
