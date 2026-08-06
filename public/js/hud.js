const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(network) {
    this.network = network;
    this.speedEl = $('speed-num');
    this.nitroFill = $('nitro-fill');
    this.nitroLabel = document.querySelector('.nitro-label');
    this.onlineEl = $('players-online');
    this.warningEl = $('warning');
    this.chatLog = $('chat-log');
    this.chatInput = $('chat-input');
    this.statusEl = $('server-status');
    this.nameInput = $('name-input');
    this.playerNameEl = $('player-name');
    this.healthBar = $('health-fill');
    this.shootIndicator = $('shoot-indicator');
    this.killFeedEl = $('kill-feed');
    this.hitFlashEl = $('hit-flash');
    this.chatTimer = null;
    this.warnTimer = null;
    this.killFeedTimer = null;

    this.lastSpeed = -1;
    this.lastNitro = -1;
    this.lastCount = -1;
    this.lastOverboost = false;
    this.lastHealth = -1;

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

  setPlayerName(name) {
    if (this.playerNameEl) this.playerNameEl.textContent = name;
  }

  update(v) {
    const { mode, speed, nitro, overboost, boostFrac, players, health, maxHealth, cooldown, shootRate } = v;


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

    if (health !== undefined && health !== this.lastHealth) {
      this.lastHealth = health;
      if (this.healthBar) {
        const hp = Math.max(0, health / maxHealth) * 100;
        this.healthBar.style.width = `${hp}%`;
        this.healthBar.className = '';
        if (hp <= 33) this.healthBar.classList.add('health-critical');
        else if (hp <= 66) this.healthBar.classList.add('health-warning');
      }
    }

    if (this.shootIndicator) {
      const ready = cooldown <= 0;
      this.shootIndicator.classList.toggle('ready', ready);
      this.shootIndicator.classList.toggle('cooldown', !ready);
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

  showHitFlash() {
    if (!this.hitFlashEl) return;
    this.hitFlashEl.classList.add('active');
    setTimeout(() => this.hitFlashEl.classList.remove('active'), 200);
  }

  showKillFeed(killerName, victimName) {
    if (!this.killFeedEl) return;
    const entry = document.createElement('div');
    entry.className = 'kill-entry';
    entry.innerHTML = `<span class="killer">${killerName}</span> eliminated <span class="victim">${victimName}</span>`;
    this.killFeedEl.appendChild(entry);
    while (this.killFeedEl.children.length > 5) {
      this.killFeedEl.removeChild(this.killFeedEl.firstChild);
    }
    clearTimeout(this.killFeedTimer);
    this.killFeedTimer = setTimeout(() => {
      this.killFeedEl.innerHTML = '';
    }, 5000);
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
    nameEl.style.color = mine ? '#00ccff' : '#ff00ff';
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
