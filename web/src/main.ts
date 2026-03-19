function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported");

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);
  };

  window.addEventListener("resize", resize);
  resize();

  return ctx;
}

function main() {
  const canvas = document.getElementById("colony") as HTMLCanvasElement;
  if (!canvas) throw new Error("Canvas element not found");

  setupCanvas(canvas);

  console.log("Bridge Colony Map initialized");
}

main();
