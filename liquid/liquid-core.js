// [Core Logic] 초기화 및 루프 (이미지 렌더링 포함)
const canvas = document.getElementById('particle-canvas'); 
const ctx = canvas.getContext('2d');
const imgCache = {}; 

function init() {
    const uiLayer = document.getElementById('ui-layer');
    dataItems.forEach((item) => {
        const radius = getBaseRadius(item.importance);
        const txt = document.createElement('div');
        txt.className = 'text-container';
        txt.innerHTML = `<div class="summary">${item.title || ''}</div><div class="original-content">${item.original || ''}</div>`;
        uiLayer.appendChild(txt);

        const container = {
            ...item, txt, radius, targetR: radius, curR: radius, color: colorPalette[item.importance],
            x: window.innerWidth * item.xPct, y: window.innerHeight * item.yPct, vx: 0, vy: 0,
            visible: true, expanded: false, level: 0.8, isDying: false,
            blobPoints: generateBlobPoints(radius),
            palette: null // 이미지 팔레트 저장용
        };

        if (item.type === 'image' && item.imageUrl) {
            const img = new Image();
            img.crossOrigin = "Anonymous"; // 팔레트 추출을 위한 크로스오리진 허용
            img.src = item.imageUrl;
            img.onload = () => {
                imgCache[item.id] = img;
                container.palette = extractImagePalette(img, 5); // [핵심] 로드 후 색상 추출
            };
        }

        containers.push(container);
    });
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mX = e.clientX - rect.left; const mY = e.clientY - rect.top;
        containers.forEach(c => { if (c.visible && Math.sqrt((mX - c.x)**2 + (mY - c.y)**2) < c.curR) toggleExpand(c.id); });
    });
    resize(); Runner.run(Runner.create(), engine); render();
}

function resize() {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight; 
    containers.forEach(c => {
        const base = getBaseRadius(c.importance);
        if(!c.expanded) { c.radius = base; c.targetR = base; }
        else c.targetR = Math.min(base * 2.2, Math.min(window.innerWidth, window.innerHeight) * 0.45);
    });
}

let _lastX = window.screenX, _lastY = window.screenY;
function render() {
    const dX = window.screenX - _lastX, dY = window.screenY - _lastY;
    _lastX = window.screenX; _lastY = window.screenY;
    const shake = Math.sqrt(dX * dX + dY * dY);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    resolveLayout();

    containers.forEach(c => {
        if (!c.visible) return;
        if (shake > 15 && c.level > 0.1) { 
            c.level -= 0.02; 
            // [수정] 흔들 때도 이미지 팔레트 색상을 사용
            spawnExplosion(c.x, c.y - c.curR*0.5, c.palette || c.color, 1, 4, -dX*0.01, -dY*0.01); 
        }
        if (c.level < 0.8) c.level += 0.003;

        ctx.save();
        drawBlobPath(ctx, c.x, c.y, c.blobPoints, c.curR);
        ctx.clip(); 
        if (c.type === 'image' && imgCache[c.id]) {
            const img = imgCache[c.id];
            const size = c.curR * 2;
            ctx.drawImage(img, c.x - c.curR, c.y - c.curR, size, size);
        } else {
            const fH = c.curR * 2 * c.level; const tR = Math.max(-15, Math.min(15, dX * -0.5));
            ctx.translate(c.x, c.y + c.curR - fH); ctx.rotate(tR * Math.PI / 180);
            ctx.fillStyle = c.color; ctx.fillRect(-c.curR * 4, 0, c.curR * 8, c.curR * 4);
        }
        ctx.restore();
    });

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        ctx.beginPath(); ctx.arc(p.body.position.x, p.body.position.y, p.radius, 0, Math.PI * 2); 
        ctx.fillStyle = p.color; ctx.fill();
        if (p.body.position.y > canvas.height + 100) { World.remove(engine.world, p.body); particles.splice(i, 1); }
    }
    requestAnimationFrame(render);
}

window.onresize = resize;
window.onload = init;