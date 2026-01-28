// [Physics Engine] Matter.js 관리 및 레이아웃 시스템
const { Engine, Runner, Bodies, Composite, World } = Matter;
const engine = Engine.create(); engine.gravity.y = 1.8;
let particles = [];
let containers = [];

// [수정] 단색 또는 색상 배열(팔레트)을 모두 지원하는 폭발 로직
function spawnExplosion(x, y, colorOrPalette, imp, count, vx = 0, vy = 0) {
    const isPalette = Array.isArray(colorOrPalette);
    for (let i = 0; i < count + imp * 2; i++) {
        const r = 6 + Math.random() * 12;
        const color = isPalette ? colorOrPalette[Math.floor(Math.random() * colorOrPalette.length)] : colorOrPalette;
        const pBody = Bodies.circle(x, y, r, { 
            friction: 0.001, restitution: 0.5, 
            force: { x: (Math.random()-0.5)*0.05 + vx, y: (Math.random()-0.5)*0.05 + vy } 
        });
        particles.push({ body: pBody, radius: r, color }); Composite.add(engine.world, pBody);
    }
}

function toggleExpand(id) {
    const c = containers.find(item => item.id === id);
    c.expanded = !c.expanded;
    c.txt.classList.toggle('expanded');
    const base = getBaseRadius(c.importance);
    c.targetR = c.expanded ? Math.min(base * 2.2, Math.min(window.innerWidth, window.innerHeight) * 0.45) : base;
    spawnExplosion(c.x, c.y, c.palette || c.color, c.importance, 50);
}

function resolveLayout() {
    const cX = window.innerWidth / 2, cY = window.innerHeight / 2;
    const pad = 135; const area = window.innerWidth * window.innerHeight;
    
    // [수정] 창 크기 싱크로율 개선: 더 넓은 공간을 허용하도록 divisor 조정 (450000 -> 180000)
    const maxVisible = Math.max(1, Math.floor(area / 180000));
    const sorted = [...containers].sort((a, b) => b.importance - a.importance);
    let visibleCount = 0;

    sorted.forEach((c, i) => {
        const shouldBeVisible = i < maxVisible;
        if (shouldBeVisible) visibleCount++;
        
        if (c.visible && !shouldBeVisible) {
            spawnExplosion(c.x, c.y, c.palette || c.color, c.importance, 30);
            c.visible = false; 
            c.txt.style.opacity = '0';
        } else if (!c.visible && shouldBeVisible) {
            c.visible = true; 
            spawnExplosion(c.x, c.y, c.palette || c.color, c.importance, 25);
        }
    });

    sorted.forEach((c1) => {
        if (!c1.visible) return;

        if (visibleCount === 1 && c1.importance === 5) {
            const margin = 20;
            const screenLimit = Math.min(window.innerWidth, window.innerHeight) / 2 - margin;
            if (getBaseRadius(5) > screenLimit) {
                c1.targetR = Math.max(60, screenLimit);
            } else if (!c1.expanded) {
                c1.targetR = getBaseRadius(5);
            }
        } else if (c1.importance === 5 && !c1.expanded) {
            c1.targetR = getBaseRadius(5);
        }

        c1.curR += (c1.targetR - c1.curR) * 0.12; 

        if (c1.type === 'image') {
            c1.txt.style.opacity = '0';
        } else if (c1.visible) {
            const isAnimating = Math.abs(c1.curR - c1.targetR) > 1.0;
            c1.txt.style.opacity = isAnimating ? '0' : '1';
            const containerWidth = c1.curR * 2 * 0.72;
            c1.txt.style.maxWidth = `${containerWidth}px`;
            const summaryFS = Math.max(12, containerWidth * 0.15);
            c1.txt.querySelector('.summary').style.fontSize = `${summaryFS}px`;
            if (c1.expanded) {
                const originalFS = Math.max(10, containerWidth * 0.08);
                c1.txt.querySelector('.original-content').style.fontSize = `${originalFS}px`;
            }
        }

        c1.vx = (cX - c1.x) * 0.05; c1.vy = (cY - c1.y) * 0.05;
        sorted.forEach((c2) => {
            if (c1 === c2 || !c2.visible) return;
            const dx = c2.x - c1.x, dy = c2.y - c1.y, dist = Math.sqrt(dx*dx + dy*dy), touch = (c1.curR + c2.curR);
            if (dist < touch + pad) {
                const force = (touch + pad - dist) * 0.1;
                c1.x -= (dx/dist) * force; c1.y -= (dy/dist) * force;
            }
        });
        c1.x += c1.vx; c1.y += c1.vy;
        const margin = 10;
        c1.x = Math.max(c1.curR + margin, Math.min(window.innerWidth - c1.curR - margin, c1.x));
        c1.y = Math.max(c1.curR + margin, Math.min(window.innerHeight - c1.curR - margin, c1.y));
        c1.txt.style.left = `${c1.x}px`; c1.txt.style.top = `${c1.y}px`;
    });
}