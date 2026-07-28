import { createSketch } from "prefab-sketch";

const canvas = document.getElementById("sketch");
const trailsInput = document.getElementById("trails");
const gridInput = document.getElementById("grid");
const resetButton = document.getElementById("reset");
const fpsOutput = document.getElementById("fps");
const frameOutput = document.getElementById("frame");
const sizeOutput = document.getElementById("size");
const pointerOutput = document.getElementById("pointer");

let pulses = [];
let lastTelemetryAt = performance.now();
let lastTelemetryFrame = 0;
let interactionReported = false;

function reportInteraction(kind) {
  if (!interactionReported) {
    interactionReported = true;
    Prototir.event("module_demo_started", { module: "prefab-sketch", kind });
  }
}

const sketch = createSketch({
  canvas,
  draw(ctx, state) {
    const { t, dt, frame, width, height, mouse } = state;
    const trails = trailsInput.checked;

    ctx.fillStyle = trails ? "rgba(2, 11, 18, 0.16)" : "#020b12";
    ctx.fillRect(0, 0, width, height);

    if (gridInput.checked) {
      ctx.strokeStyle = "rgba(102, 229, 255, 0.075)";
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 48) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    const targetX = mouse.x || width * 0.52;
    const targetY = mouse.y || height * 0.58;
    const nodeCount = Math.max(12, Math.min(34, Math.round(width / 32)));

    ctx.lineWidth = 1;
    for (let i = 0; i < nodeCount; i += 1) {
      const ratio = i / nodeCount;
      const angle = ratio * Math.PI * 2 + t * (0.16 + ratio * 0.3);
      const radius = 55 + ratio * Math.min(width, height) * 0.34;
      const x = targetX + Math.cos(angle * 1.7) * radius;
      const y = targetY + Math.sin(angle) * radius * 0.58;
      const distance = Math.hypot(x - targetX, y - targetY);

      ctx.strokeStyle = `rgba(102, 229, 255, ${0.08 + ratio * 0.14})`;
      ctx.beginPath();
      ctx.moveTo(targetX, targetY);
      ctx.lineTo(x, y);
      ctx.stroke();

      ctx.fillStyle = ratio > 0.76 ? "#edf7ff" : "#66e5ff";
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + (1 - ratio) * 2.5, 0, Math.PI * 2);
      ctx.fill();

      if (distance < 110) {
        ctx.strokeStyle = "rgba(237, 247, 255, 0.22)";
        ctx.strokeRect(x - 5, y - 5, 10, 10);
      }
    }

    if (mouse.down && frame % 5 === 0) {
      pulses.push({ x: targetX, y: targetY, radius: 4, alpha: 0.9 });
    }

    for (const pulse of pulses) {
      pulse.radius += dt * 145;
      pulse.alpha -= dt * 0.55;
      ctx.strokeStyle = `rgba(102, 229, 255, ${Math.max(0, pulse.alpha)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    pulses = pulses.filter((pulse) => pulse.alpha > 0 && pulse.radius < 280);

    ctx.fillStyle = mouse.down ? "#edf7ff" : "#66e5ff";
    ctx.beginPath();
    ctx.arc(targetX, targetY, mouse.down ? 7 : 4, 0, Math.PI * 2);
    ctx.fill();

    const now = performance.now();
    if (now - lastTelemetryAt >= 250) {
      const elapsed = (now - lastTelemetryAt) / 1000;
      fpsOutput.textContent = String(
        Math.round((frame - lastTelemetryFrame) / elapsed),
      );
      frameOutput.textContent = String(frame);
      sizeOutput.textContent = `${Math.round(width)}×${Math.round(height)}`;
      pointerOutput.textContent = `${Math.round(targetX)},${Math.round(targetY)}`;
      lastTelemetryAt = now;
      lastTelemetryFrame = frame;
    }
  },
});

canvas.addEventListener("pointerdown", () => reportInteraction("pointer"));
trailsInput.addEventListener("change", () => reportInteraction("trails"));
gridInput.addEventListener("change", () => reportInteraction("grid"));
resetButton.addEventListener("click", () => {
  pulses = [];
  reportInteraction("reset");
  Prototir.event("module_demo_reset", { module: "prefab-sketch" });
});

Prototir.ready();
