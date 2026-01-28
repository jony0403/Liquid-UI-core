// [logic.js] 흰색 허용 & 바디 색상 추출

(function() {
  window.LiquidLogic = {
    getTopImages: function() {
      const candidates = [];
      const root = document.querySelector('.wiki-content') || document.querySelector('#mw-content-text') || document.querySelector('#dic_area') || document.querySelector('article') || document.body;
      if (!root) return [];
      const allImgs = Array.from(root.querySelectorAll('img'));

      for (let img of allImgs) {
        if (candidates.length >= 3) break;
        
        const renderedW = img.clientWidth;
        const renderedH = img.clientHeight;
        if (renderedW < 150 || renderedH < 150) continue;
        if (img.offsetParent === null || window.getComputedStyle(img).opacity === '0') continue;

        let bestSrc = img.getAttribute('src');
        const srcset = img.getAttribute('srcset');
        if (srcset) {
            const sources = srcset.split(',').map(s => s.trim().split(/\s+/));
            if (sources.length > 0) bestSrc = sources[sources.length - 1][0];
        }
        bestSrc = img.getAttribute('data-src') || img.getAttribute('data-original') || bestSrc;

        if (!bestSrc || bestSrc.startsWith('data:')) continue;
        if (bestSrc.startsWith('//')) bestSrc = 'https:' + bestSrc;
        else if (bestSrc.startsWith('/')) bestSrc = window.location.origin + bestSrc;

        if (img.closest('.ad') || img.closest('[id*="ad"]') || img.closest('iframe')) continue;

        if (!candidates.includes(bestSrc)) candidates.push(bestSrc);
      }
      return candidates;
    },

    // [색상 추출 로직 개선]
    getSiteColors: function() {
      let primary = null;

      // 1. 메타 태그 (최우선)
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) {
        primary = metaTheme.content;
      }

      // 2. 헤더/네비게이션 배경
      if (!primary) {
        const header = document.querySelector('header') || document.querySelector('nav') || document.querySelector('.header');
        if (header) {
          const bg = window.getComputedStyle(header).backgroundColor;
          if (this.isValidColor(bg)) primary = bg;
        }
      }

      // 3. [추가] Body 배경색 (최후의 보루 - 흰색 사이트 대응)
      if (!primary || primary === 'rgba(0, 0, 0, 0)') {
         const bodyBg = window.getComputedStyle(document.body).backgroundColor;
         if (this.isValidColor(bodyBg)) primary = bodyBg;
      }

      // 4. 그래도 없으면 그냥 흰색
      if (!primary) primary = "#ffffff";

      return { primary: primary };
    },

    // [유효성 검사 완화] 흰색도 통과시킴
    isValidColor: function(color) {
      if (!color) return false;
      if (color === 'rgba(0, 0, 0, 0)' || color === 'transparent') return false;
      
      const rgb = color.match(/\d+/g);
      if (!rgb || rgb.length < 3) return false;
      
      const a = rgb[3] ? parseFloat(rgb[3]) : 1;
      if (a === 0) return false; // 완전 투명만 거름

      // 밝기 제한 삭제함. (흰색 허용)
      return true;
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