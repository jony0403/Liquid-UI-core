// [logic.js] 상남자의 싹쓸이 알고리즘 (Machine Gun Mode)

// 이미지 수집가 (단일 이미지가 아니라 리스트를 반환)
function collectAllImages() {
  const isNamu = window.location.hostname.includes('namu.wiki');
  const candidates = []; // 수집된 이미지 URL 저장소

  // 1. 탐색 영역 설정 (본문 전체)
  // 나무위키: .wiki-content / 네이버: #dic_area 등 / 그 외: body
  const root = document.querySelector('.wiki-content') 
            || document.querySelector('#dic_area') 
            || document.querySelector('#newsct_article')
            || document.body;

  // 2. 모든 이미지 긁어모으기
  const allImgs = Array.from(root.querySelectorAll('img'));

  for (let img of allImgs) {
    const src = img.getAttribute('data-src') || img.getAttribute('data-original') || img.src;
    
    // [기본 필터] 깨진 주소, SVG, 데이터 URI, 아이콘 등은 제외
    if (!src || src.includes('.svg') || src.startsWith('data:')) continue;
    
    // [크기 필터] 50px 미만 아이콘/이모티콘은 컷
    const w = img.naturalWidth || img.clientWidth;
    const h = img.naturalHeight || img.clientHeight;
    if (w < 50 || h < 50) continue;

    // [금지어 필터] 투명 픽셀, 버튼 등
    if (src.includes('pixel') || src.includes('blank')) continue;

    const safeUrl = getSafeUrl(src);
    
    // [중복 제거] 이미 수집한 URL이면 패스
    if (candidates.includes(safeUrl)) continue;

    // [우선순위 정렬] 나무위키 '표(Table)' 안에 있는 놈은 배열 맨 앞으로(unshift), 아니면 뒤로(push)
    if (isNamu && img.closest('.wiki-table')) {
      candidates.unshift(safeUrl);
    } else {
      candidates.push(safeUrl);
    }
  }

  // 3. 만약 하나도 못 찾았다? OG Tag라도 가져옴
  if (candidates.length === 0) {
    const og = document.querySelector('meta[property="og:image"]');
    if (og) candidates.push(og.content);
  }

  return candidates; // 배열 반환
}

// URL 안전 변환기
function getSafeUrl(url) {
  if (!url) return "";
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return window.location.origin + url;
  return url;
}

// 텍스트 분석 요청
async function fetchSummary(text) {
  try {
    const res = await fetch("http://localhost:8000/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_content: text }) 
    });
    return res.body.getReader();
  } catch (e) {
    throw new Error("서버 연결 실패");
  }
}

// 전역 등록
window.LiquidLogic = {
  collectAllImages, // 함수 이름 변경됨
  fetchSummary
};