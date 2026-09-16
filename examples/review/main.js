const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
let seed = 1, paused = false, angle = 0;
function draw() {
  ctx.fillStyle = '#173d42'; ctx.fillRect(0, 0, 960, 540);
  ctx.strokeStyle = '#326169'; ctx.lineWidth = 2;
  for (let radius = 70; radius < 270; radius += 55) { ctx.beginPath(); ctx.ellipse(480,270,radius*1.5,radius*.8,0,0,Math.PI*2); ctx.stroke(); }
  for (let i=0;i<18;i++) {
    const a = angle + i * 2.4; const r = 65 + (i%4)*52;
    ctx.fillStyle = ['#cafa82','#ffb478','#64ccd1'][(i+seed)%3];
    ctx.beginPath(); ctx.arc(480+Math.cos(a)*r*1.5,270+Math.sin(a)*r*.8,6+i%5*3,0,Math.PI*2);ctx.fill();
  }
  ctx.fillStyle = '#e9f5ed';ctx.font='20px system-ui';ctx.fillText('ORBIT GARDEN / SEED '+seed,32,45);
}
function loop() { if(!paused) angle += .003; draw(); requestAnimationFrame(loop); } loop();
document.querySelector('#color').onclick = () => { seed++; document.querySelector('#state').textContent = 'Seed '+seed; };
Prototir.review.enable({ project:'orbit-garden',build:'review-demo-1',
  capture:async () => { draw(); return canvas.toDataURL('image/png'); },
  context:() => 'Garden / seed '+seed,
  onOpenChange:open => { paused=open; }
});
Prototir.ready();
