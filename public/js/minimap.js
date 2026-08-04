import { WORLD_RADIUS } from './vehicle.js';

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = canvas.width;
    this.mapR = this.size / 2 - 6;
    this.scale = this.mapR / WORLD_RADIUS;
    this.lastPlayers = '';
  }

  update(own, players) {
    const ctx = this.ctx;
    const size = this.size;
    const cx = size / 2;
    const cy = size / 2;

    ctx.clearRect(0, 0, size, size);

    // background disc
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, this.mapR + 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10, 16, 30, 0.78)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // world boundary
    ctx.beginPath();
    ctx.arc(cx, cy, this.mapR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,90,90,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    const px = (wx) => cx + (wx - own.position.x) * this.scale;
    const py = (wz) => cy + (wz - own.position.z) * this.scale;

    // runway (along -Z/+Z through center)
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, py(200));
    ctx.lineTo(cx, py(-200));
    ctx.stroke();

    // center tower
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();

    // remote players
    const ids = [];
    for (const p of players.values()) {
      ids.push(p.id);
      let dotX = px(p.x);
      let dotY = py(p.z);
      const dx = dotX - cx;
      const dy = dotY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > this.mapR - 3) {
        dotX = cx + (dx / dist) * (this.mapR - 3);
        dotY = cy + (dy / dist) * (this.mapR - 3);
      }
      ctx.beginPath();
      ctx.arc(dotX, dotY, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = p.color || '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.stroke();
    }

    // own position: cyan triangle with direction
    const fwd = own.forward;
    const fdx = fwd.x;
    const fdz = fwd.z;
    const tipAngle = Math.atan2(fdz, fdx) + Math.PI / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tipAngle);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fillStyle = '#33ccff';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();
  }
}
