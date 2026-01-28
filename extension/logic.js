// [logic.js] 렌더링 크기(Visible Size) 기반 Top 3 수집

(function() {
  window.LiquidLogic = {
    getTopImages: function() {
      const candidates = [];
      
      // 1. 탐색 영역 (본문 전체)
      const root = document.querySelector('.wiki-content')      // 나무위키
                || document.querySelector('#mw-content-text')   // 위키피디아
                || document.querySelector('#dic_area')
                || document.querySelector('article')
                || document.body;

      if (!root) return [];

      const allImgs = Array.from(root.querySelectorAll('img'));
      
      // [검열 삭제] 밴 리스트 없음. 오직 크기로만 승부.

      for (let img of allImgs) {
        if (candidates.length >= 3) break; // 최대 3개 차면 즉시 종료 (속도 최적화)

        // [핵심 1] 렌더링 크기 체크 (화면에 보이는 실제 크기)
        // 원본(natural)이 아니라 현재 화면에 그려진(client) 크기를 본다.
        const renderedW = img.clientWidth; // 패딩 포함, 테두리 제외한 너비
        const renderedH = img.clientHeight;

        // 화면상 150px 미만으로 보이는 건 아이콘/장식으로 간주하고 버림.
        if (renderedW < 150 || renderedH < 150) continue;

        // [투명망토 컷] 크기는 큰데 숨겨진(display:none, opacity:0) 놈들은 제외
        if (img.offsetParent === null || window.getComputedStyle(img).opacity === '0') continue;

        // [소스 추출]
        let bestSrc = img.getAttribute('src');
        const srcset = img.getAttribute('srcset');
        
        // 위키피디아 등 고화질 대응 (가장 큰거 가져옴)
        if (srcset) {
            const sources = srcset.split(',').map(s => s.trim().split(/\s+/));
            if (sources.length > 0) bestSrc = sources[sources.length - 1][0];
        }
        bestSrc = img.getAttribute('data-src') || img.getAttribute('data-original') || bestSrc;

        if (!bestSrc || bestSrc.startsWith('data:')) continue;
        
        // https://ko.wikipedia.org/wiki/%EC%A0%95%EA%B7%9C%ED%99%94 //로 시작하면 https 붙여줌 (위키피디아 필수)
        if (bestSrc.startsWith('//')) {
            bestSrc = 'https:' + bestSrc;
        } else if (bestSrc.startsWith('/')) {
            bestSrc = window.location.origin + bestSrc;
        }

        // [광고 영역 차단] 이것만은 최소한의 예의로 남김 (구글 애드센스 등)
        if (img.closest('.ad') || img.closest('[id*="ad"]') || img.closest('iframe')) continue;

        // [중복 체크 및 추가]
        // 점수 계산 안 함. 위에서부터 조건 맞으면 그냥 담음.
        const existing = candidates.find(c => c === bestSrc);
        if (!existing) {
            candidates.push(bestSrc);
        }
      }

      // 그대로 리턴 (위에서부터 순서대로 담았으므로 정렬 필요 없음)
      return candidates;
    },

    fetchSummary: async function(text) {
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
  };
})();