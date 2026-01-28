// [Drawing Utils] 그릇 형태 생성 및 고정 반지름 계산
function getBaseRadius(importance) {
    const mapping = { 1: 75, 2: 105, 3: 135, 4: 175, 5: 230 };
    return mapping[importance];
}

function generateBlobPoints(radius) {
    const points = []; const numPoints = 8; 
    for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const rVar = 0.88 + Math.random() * 0.24; 
        points.push({ angle, rVar });
    }
    return points;
}

function drawBlobPath(ctx, cx, cy, points, currentRadius) {
    ctx.beginPath();
    const canvasPoints = points.map(p => ({
        x: Math.cos(p.angle) * (currentRadius * p.rVar),
        y: Math.sin(p.angle) * (currentRadius * p.rVar)
    }));
    const len = canvasPoints.length;
    ctx.moveTo((canvasPoints[len-1].x + canvasPoints[0].x)/2 + cx, (canvasPoints[len-1].y + canvasPoints[0].y)/2 + cy);
    for(let i = 0; i < len; i++) {
        let p1 = canvasPoints[i]; let p2 = canvasPoints[(i + 1) % len];
        let midX = (p1.x + p2.x) / 2; let midY = (p1.y + p2.y) / 2;
        ctx.quadraticCurveTo(p1.x + cx, p1.y + cy, midX + cx, midY + cy);
    }
    ctx.closePath();
}

// [추가] 이미지에서 5가지 대표 색상을 추출하는 로직
function extractImagePalette(img, count = 5) {
    const cvs = document.createElement('canvas');
    const ctx = cvs.getContext('2d');
    cvs.width = img.width; cvs.height = img.height;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, cvs.width, cvs.height).data;
    const palette = [];
    for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * (data.length / 4)) * 4;
        palette.push(`rgb(${data[idx]}, ${data[idx+1]}, ${data[idx+2]})`);
    }
    return palette;
}