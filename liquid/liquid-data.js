// [Data Logic] 데이터 아이템 및 컬러 설정
const dataItems = [
    { id: 'i1', title: '생성형 AI', original: '사용자의 요구에 따라 텍스트, 이미지, 오디오 등 새로운 콘텐츠를 직접 생성해내는 인공지능 기술의 총칭입니다. 현대 AI 패러다임의 핵심입니다.', importance: 5, xPct: 0.5, yPct: 0.5 },
    { id: 'i2', title: 'LLM (대규모 언어 모델)', original: '수조 개의 파라미터를 학습하여 인간처럼 자연스러운 문장을 생성하는 모델입니다. GPT-4와 Llama 3가 대표적인 사례로 꼽힙니다.', importance: 4, xPct: 0.3, yPct: 0.3 },
    
    // 이미지 버블 예시
    { id: 'img1', type: 'image', imageUrl: 'https://picsum.photos/seed/picsum/600/600', importance: 3, xPct: 0.7, yPct: 0.3 },
    
    { id: 'i4', title: '멀티모달 학습', original: '텍스트뿐만 아니라 시각, 청각 정보를 동시에 처리하는 기술입니다. 인간처럼 보고 듣고 말하는 통합적인 인지 능력을 구현하는 것이 목표입니다.', importance: 2, xPct: 0.3, yPct: 0.7 },
    { id: 'i5', title: '할루시네이션(환각)', original: 'AI가 존재하지 않는 정보를 마치 사실인 것처럼 그럴싸하게 답변하는 오류 현상입니다. 현재 기술적 한계이자 해결해야 할 핵심 과제입니다.', importance: 1, xPct: 0.7, yPct: 0.7 }
];

const colorPalette = { 5: '#001a33', 4: '#003366', 3: '#004d99', 2: '#3385ff', 1: '#99c2ff' };