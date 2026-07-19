// 문자열 / 텍스트 유틸리티
import { tool, makeIO, h, kvTable, strToBytes, loadScript, LIB, copyBtn } from '../core.js';

const CAT = '문자열 / 텍스트';

function splitWords(text) {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-./]+/)
    .filter(Boolean);
}

tool({
  id: 'case-convert', cat: CAT, name: '대소문자 변환',
  desc: 'camelCase, snake_case, kebab-case, PascalCase 등으로 변환합니다.',
  keywords: 'camel snake kebab pascal case',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', rows: 3, value: 'hello world example' }],
      outputHTML: true, runOnLoad: true,
      process(text) {
        if (!text.trim()) return '';
        const words = splitWords(text.trim());
        const lower = words.map((w) => w.toLowerCase());
        const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        return kvTable([
          ['camelCase', lower[0] + words.slice(1).map(cap).join('')],
          ['PascalCase', words.map(cap).join('')],
          ['snake_case', lower.join('_')],
          ['SCREAMING_SNAKE', lower.join('_').toUpperCase()],
          ['kebab-case', lower.join('-')],
          ['Train-Case', words.map(cap).join('-')],
          ['dot.case', lower.join('.')],
          ['flatcase', lower.join('')],
          ['UPPERCASE', text.toUpperCase()],
          ['lowercase', text.toLowerCase()],
          ['Sentence case', cap(text.trim())],
          ['Title Case', text.trim().split(/\s+/).map(cap).join(' ')],
          ['aLtErNaTiNg', [...text].map((c, i) => i % 2 ? c.toUpperCase() : c.toLowerCase()).join('')],
        ]);
      },
    });
  },
});

const HOMOGLYPH = { a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', y: 'у', i: 'і', s: 'ѕ', A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };
const LEET = { a: '4', e: '3', i: '1', o: '0', s: '5', t: '7', b: '8', g: '9', l: '|' };

tool({
  id: 'obfuscator', cat: CAT, name: '문자열 난독화',
  desc: '텍스트를 눈으로는 비슷하지만 다른 문자로 바꾸거나(호모글리프), 제로폭 문자 삽입, 전각, 리트 표기 등으로 난독화합니다.',
  keywords: 'obfuscate homoglyph zero width leet',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', rows: 4, value: 'password example' }],
      options: [{ id: 'mode', label: '방식', type: 'select', values: [['homo', '호모글리프 (키릴 유사문자)'], ['zw', '제로폭 문자 삽입'], ['full', '전각 문자'], ['leet', '리트(1337)'], ['rev', '역순'], ['strike', '취소선 결합문자'], ['zwremove', '제로폭 문자 제거(복원)']] }],
      process(text, o) {
        switch (o.mode) {
          case 'homo': return [...text].map((c) => HOMOGLYPH[c] ?? c).join('');
          case 'zw': return [...text].join('\u200b');
          case 'zwremove': return text.replace(/[\u200b-\u200d\ufeff\u2060]/g, '');
          case 'full': return [...text].map((c) => {
            const cp = c.codePointAt(0);
            if (cp === 32) return '　';
            return cp >= 33 && cp <= 126 ? String.fromCodePoint(cp + 0xfee0) : c;
          }).join('');
          case 'leet': return [...text].map((c) => LEET[c.toLowerCase()] ?? c).join('');
          case 'rev': return [...text].reverse().join('');
          case 'strike': return [...text].map((c) => c + '\u0336').join('');
        }
      },
      runOnLoad: true,
    });
  },
});

tool({
  id: 'slugify', cat: CAT, name: 'Slugify (URL 슬러그)',
  desc: '제목을 URL에 쓸 수 있는 슬러그로 변환합니다.',
  keywords: 'slug url seo',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', rows: 3, value: 'Hello World — 안녕하세요, 반갑습니다!' }],
      options: [
        { id: 'sep', label: '구분자', type: 'select', values: [['-', '하이픈(-)'], ['_', '언더스코어(_)']] },
        { id: 'keepKo', label: '한글 유지', type: 'checkbox', value: true },
      ],
      process(text, o) {
        let s = text.normalize('NFKD').replace(/[̀-ͯ]/g, '');
        const keep = o.keepKo ? 'a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ' : 'a-z0-9';
        s = s.toLowerCase()
          .replace(new RegExp(`[^${keep}\\s-_]`, 'g'), '')
          .trim()
          .replace(/[\s_-]+/g, o.sep);
        return s.replace(new RegExp(`^\\${o.sep}+|\\${o.sep}+$`, 'g'), '');
      },
      runOnLoad: true,
    });
  },
});

tool({
  id: 'text-stats', cat: CAT, name: '텍스트 통계',
  desc: '글자 수, 단어 수, 줄 수, 바이트 수 등 텍스트 통계를 표시합니다.',
  keywords: 'count characters words lines statistics',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '텍스트', rows: 10, placeholder: '통계를 낼 텍스트를 입력하세요.' }],
      outputHTML: true,
      process(text) {
        const chars = [...text];
        const words = text.trim() ? text.trim().split(/\s+/) : [];
        const lines = text ? text.split('\n') : [];
        const sentences = text.split(/[.!?。！？]+[\s\n]|[.!?。！？]+$/).filter((s) => s.trim());
        const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
        const freq = {};
        for (const c of chars) if (c.trim()) freq[c] = (freq[c] || 0) + 1;
        const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10);
        return h('div', null, kvTable([
          ['글자 수 (공백 포함)', chars.length],
          ['글자 수 (공백 제외)', chars.filter((c) => c.trim()).length],
          ['바이트 (UTF-8)', strToBytes(text).length],
          ['단어 수', words.length],
          ['줄 수', lines.length],
          ['빈 줄 제외 줄 수', lines.filter((l) => l.trim()).length],
          ['문장 수 (추정)', sentences.length],
          ['문단 수', paragraphs.length],
          ['고유 단어 수', new Set(words.map((w) => w.toLowerCase())).size],
        ]), top.length ? h('div', null, h('h4', null, '최빈 문자 Top 10'),
          h('p', { class: 'mono' }, top.map(([c, n]) => `${c}:${n}`).join('  '))) : null);
      },
    });
  },
});

const EMOJIS = [
  ['😀', '웃음 grinning smile'], ['😂', '눈물웃음 joy lol'], ['🤣', '데굴데굴 rofl'], ['😊', '미소 blush'], ['😍', '하트눈 love'],
  ['🥰', '사랑 hearts'], ['😘', '뽀뽀 kiss'], ['😎', '선글라스 cool'], ['🤔', '생각 thinking'], ['😅', '진땀 sweat smile'],
  ['😭', '엉엉 sob cry'], ['😢', '눈물 cry'], ['😡', '화남 angry'], ['🤬', '욕 cursing'], ['😱', '비명 scream'],
  ['😴', '잠 sleep'], ['🤒', '아픔 sick'], ['🤯', '폭발 mind blown'], ['🥳', '파티 party'], ['😇', '천사 angel'],
  ['🙃', '거꾸로 upside down'], ['😉', '윙크 wink'], ['🤗', '포옹 hug'], ['🤫', '쉿 shush'], ['🙄', '눈굴리기 eye roll'],
  ['😬', '이 악물기 grimace'], ['🥺', '애원 pleading'],
  ['👍', '좋아요 thumbs up'], ['👎', '싫어요 thumbs down'], ['👏', '박수 clap'], ['🙏', '기도 부탁 pray please'], ['🙌', '만세 raised hands'],
  ['🤝', '악수 handshake'], ['💪', '근육 muscle strong'], ['👀', '눈 eyes'], ['👋', '인사 wave'], ['✌️', '브이 victory'],
  ['🤞', '행운 crossed fingers'], ['👌', 'OK'], ['✋', '손바닥 stop hand'], ['🖐️', '손 hand'], ['☝️', '검지 point up'],
  ['❤️', '하트 heart red'], ['🧡', '주황하트'], ['💛', '노랑하트'], ['💚', '초록하트'], ['💙', '파랑하트'],
  ['💜', '보라하트'], ['🖤', '검정하트'], ['🤍', '흰하트'], ['💔', '이별 broken heart'], ['💕', '두하트'], ['✨', '반짝 sparkles'],
  ['🔥', '불 fire hot'], ['💯', '백점 100'], ['💢', '분노 anger'], ['💥', '충돌 boom'], ['💦', '땀 물방울 sweat'],
  ['⭐', '별 star'], ['🌟', '빛나는별 glowing star'], ['🎉', '축하 party popper tada'], ['🎊', '색종이 confetti'], ['🎁', '선물 gift'],
  ['🎂', '케이크 birthday cake'], ['🍰', '조각케이크'], ['☕', '커피 coffee'], ['🍺', '맥주 beer'], ['🍕', '피자 pizza'],
  ['🍔', '햄버거 burger'], ['🍜', '라면 국수 noodle'], ['🍚', '밥 rice'], ['🍎', '사과 apple'], ['🍌', '바나나 banana'],
  ['🐶', '강아지 dog'], ['🐱', '고양이 cat'], ['🐭', '쥐 mouse'], ['🐰', '토끼 rabbit'], ['🦊', '여우 fox'],
  ['🐻', '곰 bear'], ['🐼', '판다 panda'], ['🦁', '사자 lion'], ['🐯', '호랑이 tiger'], ['🐸', '개구리 frog'],
  ['🐢', '거북 turtle'], ['🐟', '물고기 fish'], ['🦋', '나비 butterfly'], ['🌸', '벚꽃 cherry blossom'], ['🌹', '장미 rose'],
  ['🌻', '해바라기 sunflower'], ['🌲', '나무 tree'], ['🌍', '지구 earth'], ['🌙', '달 moon'], ['☀️', '해 sun'],
  ['☁️', '구름 cloud'], ['🌧️', '비 rain'], ['⛈️', '천둥 storm'], ['❄️', '눈 snow'], ['🌈', '무지개 rainbow'],
  ['⚡', '번개 lightning zap'], ['💧', '물방울 droplet'], ['🌊', '파도 wave ocean'],
  ['💻', '노트북 laptop computer'], ['🖥️', '데스크톱 desktop'], ['⌨️', '키보드 keyboard'], ['🖱️', '마우스 mouse'], ['📱', '휴대폰 phone'],
  ['⌚', '시계 watch'], ['📷', '카메라 camera'], ['🎧', '헤드폰 headphone'], ['🔋', '배터리 battery'], ['💡', '전구 아이디어 idea bulb'],
  ['🔒', '잠금 lock'], ['🔓', '열림 unlock'], ['🔑', '열쇠 key'], ['🛠️', '도구 tools'], ['⚙️', '설정 톱니 gear settings'],
  ['🐛', '벌레 버그 bug'], ['🚀', '로켓 발사 rocket launch'], ['📦', '패키지 상자 package box'], ['📄', '문서 document'], ['📁', '폴더 folder'],
  ['📊', '차트 chart bar'], ['📈', '상승 chart up'], ['📉', '하락 chart down'], ['📅', '달력 calendar'], ['📌', '핀 pin'],
  ['📎', '클립 clip'], ['✏️', '연필 pencil'], ['✅', '체크 완료 check done'], ['❌', '엑스 취소 cross x'], ['⚠️', '경고 warning'],
  ['❓', '물음표 question'], ['❗', '느낌표 exclamation'], ['🚫', '금지 prohibited'], ['♻️', '재활용 recycle'], ['🔍', '검색 돋보기 search'],
  ['🔗', '링크 link'], ['✉️', '메일 편지 mail'], ['📢', '확성기 공지 announcement'], ['🔔', '알림 종 bell'], ['🕐', '시계 clock'],
  ['🚗', '자동차 car'], ['🚕', '택시 taxi'], ['🚌', '버스 bus'], ['🚲', '자전거 bicycle'], ['✈️', '비행기 airplane'],
  ['🚄', '기차 train'], ['🏠', '집 house home'], ['🏢', '빌딩 office'], ['🏥', '병원 hospital'], ['🏫', '학교 school'],
  ['⚽', '축구 soccer'], ['⚾', '야구 baseball'], ['🏀', '농구 basketball'], ['🎮', '게임 game'], ['🎲', '주사위 dice'],
  ['🎵', '음표 music note'], ['🎤', '마이크 mic'], ['🎬', '영화 movie'], ['🏆', '트로피 우승 trophy'], ['🥇', '금메달 gold medal'],
].filter(([, k]) => k);

/* 전체 이모지: emojibase 데이터(한국어+영어 라벨/태그)를 도구를 열 때 한 번만 로드.
   스킨톤 변형은 제외한 기본형만 사용한다. 로드 실패 시 위의 큐레이션 목록으로 폴백. */
const EMOJI_CAT = [[0, '표정'], [1, '사람'], [3, '동물/자연'], [4, '음식/음료'], [5, '여행/장소'], [6, '활동'], [7, '사물'], [8, '기호'], [9, '깃발']];
let emojiAll = null;
async function loadAllEmojis() {
  if (emojiAll) return emojiAll;
  const base = 'https://cdn.jsdelivr.net/npm/emojibase-data@16.0.3';
  const [ko, en] = await Promise.all(['/ko/compact.json', '/en/compact.json'].map((p) =>
    fetch(base + p).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })));
  const enMap = new Map(en.map((x) => [x.hexcode, x]));
  emojiAll = ko
    .filter((x) => x.group != null && x.group !== 2) // 그룹 2는 스킨톤 등 조합용 컴포넌트
    .sort((a, b) => a.group - b.group || (a.order ?? 0) - (b.order ?? 0))
    .map((x) => {
      const e = enMap.get(x.hexcode);
      return { e: x.unicode, g: x.group, t: x.label, kw: [x.label, ...(x.tags || []), e?.label, ...(e?.tags || [])].join(' ').toLowerCase() };
    });
  return emojiAll;
}

tool({
  id: 'emoji-picker', cat: CAT, name: '이모지 피커',
  desc: '유니코드 전체 이모지(약 1,900개)를 한국어/영어로 검색하고 클릭해서 복사합니다.',
  keywords: 'emoji picker copy unicode',
  render(root) {
    const CHUNK = 200; // 한 번에 그리는 개수 — 나머지는 스크롤 시 추가 로드
    const searchBox = h('input', { type: 'text', placeholder: '검색 (예: 하트, fire, 웃음)', style: { flex: '1', minWidth: '0' } });
    const catSel = h('select', null,
      h('option', { value: '' }, '전체 카테고리'),
      EMOJI_CAT.map(([v, l]) => h('option', { value: v }, l)));
    const info = h('p', { class: 'note' }, '이모지 데이터 로드 중... (도구를 열 때 한 번만 내려받습니다)');
    const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: '6px', marginTop: '12px' } });
    const sentinel = h('div', { style: { height: '1px' } });
    let list = [], filtered = [], shown = 0, warn = '';

    function updateInfo() {
      const count = shown < filtered.length
        ? `${filtered.length.toLocaleString()}개 중 ${shown.toLocaleString()}개 표시 (스크롤하면 더 불러옵니다)`
        : `${filtered.length.toLocaleString()}개`;
      info.textContent = `${warn}${count} — 클릭하면 클립보드에 복사됩니다.`;
    }
    function more() {
      const frag = document.createDocumentFragment();
      for (const { e, t } of filtered.slice(shown, shown + CHUNK)) {
        frag.append(h('button', {
          class: 'btn', type: 'button', title: t,
          style: { fontSize: '24px', padding: '8px 4px' },
          onclick: async () => {
            await navigator.clipboard.writeText(e);
            info.textContent = `${e} 복사됨! (${t})`;
          },
        }, e));
      }
      shown = Math.min(shown + CHUNK, filtered.length);
      grid.append(frag);
      updateInfo();
    }
    // 화면이 커서 sentinel이 계속 보이는 경우에도 채워지도록 반복 확인
    function fillViewport() {
      if (shown >= filtered.length || !sentinel.isConnected) return;
      if (sentinel.getBoundingClientRect().top < window.innerHeight + 300) {
        more();
        requestAnimationFrame(fillViewport);
      }
    }
    function apply() {
      const q = searchBox.value.trim().toLowerCase();
      const g = catSel.value;
      filtered = list.filter((x) => (g === '' || x.g === +g) && (!q || x.kw.includes(q) || x.e === q));
      grid.innerHTML = '';
      shown = 0;
      more();
      fillViewport();
    }
    new IntersectionObserver((es) => { if (es[0].isIntersecting) fillViewport(); }, { rootMargin: '300px' }).observe(sentinel);

    searchBox.addEventListener('input', apply);
    catSel.addEventListener('change', apply);
    root.append(h('div', { style: { display: 'flex', gap: '8px' } }, searchBox, catSel), info, grid, sentinel);

    loadAllEmojis()
      .then((all) => { list = all; apply(); })
      .catch(() => {
        list = EMOJIS.map(([e, kw]) => ({ e, g: -1, t: kw, kw: kw.toLowerCase() }));
        warn = '⚠ 전체 목록 로드 실패(네트워크 확인) — 기본 목록으로 표시. ';
        apply();
      });
  },
});

tool({
  id: 'ascii-art', cat: CAT, name: 'ASCII 아트 생성기',
  desc: '텍스트를 큰 ASCII 아트 글자로 변환합니다. (figlet)',
  keywords: 'ascii art figlet banner',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '텍스트 (영문/숫자)', rows: 2, value: 'WTools' }],
      options: [{ id: 'font', label: '폰트', type: 'select', values: ['Standard', 'Big', 'Small', 'Slant', 'Banner', 'Block', 'Doom', 'Ghost', 'Shadow', 'Speed'] }],
      outputRows: 14,
      async process(text, o) {
        if (!text.trim()) return '';
        await loadScript(LIB.figlet);
        figlet.defaults({ fontPath: 'https://cdn.jsdelivr.net/npm/figlet@1.7.0/fonts' });
        return new Promise((res, rej) => {
          figlet.text(text, { font: o.font }, (err, out) => err ? rej(new Error('폰트 로드 실패: ' + err.message)) : res(out));
        });
      },
    });
  },
});

/* ---------- 한글 도구 (두벌식 자판 매핑 / 자모 조합) ---------- */
const CHO = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const JUNG = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
const JONG = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];
const KEY2JAMO = {
  q: 'ㅂ', Q: 'ㅃ', w: 'ㅈ', W: 'ㅉ', e: 'ㄷ', E: 'ㄸ', r: 'ㄱ', R: 'ㄲ', t: 'ㅅ', T: 'ㅆ',
  y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', O: 'ㅒ', p: 'ㅔ', P: 'ㅖ',
  a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ',
  z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ',
};
// 시프트 짝이 없는 대문자는 소문자와 같은 자모로 취급
for (const k of 'yuiasdfghjklzxcvbnm') KEY2JAMO[k.toUpperCase()] ??= KEY2JAMO[k];
const JUNG_COMB = { 'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ', 'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ', 'ㅡㅣ': 'ㅢ' };
const JONG_COMB = { 'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ', 'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ', 'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ', 'ㅂㅅ': 'ㅄ' };
const invertPairs = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, [...k]]));
const JUNG_SPLIT = invertPairs(JUNG_COMB);
const JONG_SPLIT = invertPairs(JONG_COMB);
const JAMO2KEY = {};
for (const [k, j] of Object.entries(KEY2JAMO)) JAMO2KEY[j] ??= k;

function en2ko(text) {
  let out = '', cho = '', jung = '', jong = '';
  const flush = () => {
    if (cho && jung) out += String.fromCharCode(0xac00 + CHO.indexOf(cho) * 588 + JUNG.indexOf(jung) * 28 + JONG.indexOf(jong));
    else out += cho + jung + jong;
    cho = jung = jong = '';
  };
  for (const ch of text) {
    const j = KEY2JAMO[ch];
    if (!j) { flush(); out += ch; continue; }
    if (!JUNG.includes(j)) { // 자음
      if (cho && jung) {
        if (!jong && JONG.includes(j)) jong = j;
        else if (jong && JONG_COMB[jong + j]) jong = JONG_COMB[jong + j];
        else { flush(); cho = j; }
      } else if (cho || jung) { flush(); cho = j; }
      else cho = j;
    } else { // 모음
      if (jong) { // 받침이 다음 글자 초성으로 이동 (겹받침은 분리)
        const [keep, move] = JONG_SPLIT[jong] ? JONG_SPLIT[jong] : ['', jong];
        jong = keep;
        flush();
        cho = move; jung = j;
      } else if (jung) {
        if (JUNG_COMB[jung + j]) jung = JUNG_COMB[jung + j];
        else { flush(); jung = j; }
      } else jung = j;
    }
  }
  flush();
  return out;
}

function decomposeSyllable(ch) {
  const cp = ch.charCodeAt(0);
  if (cp < 0xac00 || cp > 0xd7a3) return null;
  const i = cp - 0xac00;
  return [Math.floor(i / 588), Math.floor(i / 28) % 21, i % 28]; // [초성, 중성, 종성] 인덱스
}

function ko2en(text) {
  let out = '';
  for (const ch of text) {
    const s = decomposeSyllable(ch);
    const jamos = s ? [CHO[s[0]], JUNG[s[1]], JONG[s[2]]] : [ch];
    for (const j of jamos) {
      if (!j) continue;
      for (const q of JUNG_SPLIT[j] || JONG_SPLIT[j] || [j]) out += JAMO2KEY[q] ?? q;
    }
  }
  return out;
}

/* 국어의 로마자 표기법 매핑 — 연음·ㄹㄹ 등 기본 규칙만 반영 */
const RR_CHO = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const RR_JUNG = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const RR_CODA = {
  'ㄱ': 'k', 'ㄲ': 'k', 'ㄳ': 'k', 'ㄺ': 'k', 'ㅋ': 'k', 'ㄴ': 'n', 'ㄵ': 'n', 'ㄶ': 'n',
  'ㄷ': 't', 'ㅅ': 't', 'ㅆ': 't', 'ㅈ': 't', 'ㅊ': 't', 'ㅌ': 't', 'ㅎ': 't',
  'ㄹ': 'l', 'ㄼ': 'l', 'ㄽ': 'l', 'ㄾ': 'l', 'ㅀ': 'l', 'ㅁ': 'm', 'ㄻ': 'm',
  'ㅂ': 'p', 'ㅍ': 'p', 'ㅄ': 'p', 'ㄿ': 'p', 'ㅇ': 'ng',
};
const RR_ONSET = { 'ㄱ': 'g', 'ㄲ': 'kk', 'ㄴ': 'n', 'ㄷ': 'd', 'ㄹ': 'r', 'ㅁ': 'm', 'ㅂ': 'b', 'ㅅ': 's', 'ㅆ': 'ss', 'ㅈ': 'j', 'ㅊ': 'ch', 'ㅋ': 'k', 'ㅌ': 't', 'ㅍ': 'p', 'ㅎ': '' };

function romanize(text) {
  const chars = [...text];
  const syl = chars.map(decomposeSyllable);
  let out = '', pendingOnset = null;
  for (let i = 0; i < chars.length; i++) {
    if (!syl[i]) { out += chars[i]; pendingOnset = null; continue; }
    const [c, v, t] = syl[i];
    const onset = pendingOnset != null ? pendingOnset : RR_CHO[c];
    pendingOnset = null;
    let coda = '';
    if (t) {
      const jongCh = JONG[t];
      const next = syl[i + 1];
      if (next && next[0] === 11 && jongCh !== 'ㅇ') { // 다음 초성이 ㅇ이면 연음
        const split = JONG_SPLIT[jongCh];
        if (split) { coda = RR_CODA[split[0]]; pendingOnset = RR_ONSET[split[1]]; }
        else pendingOnset = RR_ONSET[jongCh];
      } else {
        coda = RR_CODA[jongCh];
        if (next && jongCh === 'ㄹ' && CHO[next[0]] === 'ㄹ') pendingOnset = 'l';
        else if (next && jongCh === 'ㄴ' && CHO[next[0]] === 'ㄹ') { coda = 'l'; pendingOnset = 'l'; }
      }
    }
    out += onset + RR_JUNG[v] + coda;
  }
  return out;
}

tool({
  id: 'hangul-tools', cat: CAT, name: '한글 도구 (한/영 변환·초성·로마자)',
  desc: '한/영 키를 잘못 놓고 친 텍스트 변환(dkssud→안녕), 초성 추출, 로마자 표기, 자모 분해를 제공합니다.',
  keywords: 'hangul korean 한영 오타 변환 초성 로마자 romanize jamo dkssud',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', rows: 5, value: 'dkssudgktpdy! dhksdurgkstlfEo rlvnszlfmf RjwdjTsp dy' }],
      options: [{ id: 'mode', label: '변환', type: 'select', values: [['en2ko', '영타 → 한글'], ['ko2en', '한글 → 영타'], ['cho', '초성 추출'], ['rom', '로마자 표기'], ['jamo', '자모 분해']] }],
      runOnLoad: true,
      note: '로마자 표기는 국어의 로마자 표기법 기준의 단순 변환으로, 자음동화·구개음화 등 일부 음운 변동은 반영되지 않습니다.',
      process(text, o) {
        switch (o.mode) {
          case 'en2ko': return en2ko(text);
          case 'ko2en': return ko2en(text);
          case 'cho': return [...text].map((ch) => { const s = decomposeSyllable(ch); return s ? CHO[s[0]] : ch; }).join('');
          case 'rom': return romanize(text);
          case 'jamo': return [...text].map((ch) => {
            const s = decomposeSyllable(ch);
            if (!s) return ch;
            return [CHO[s[0]], JUNG[s[1]], JONG[s[2]]].flatMap((j) => j ? (JUNG_SPLIT[j] || JONG_SPLIT[j] || [j]) : []).join('');
          }).join('');
        }
      },
    });
  },
});

/* ---------- 로렘 입숨 / 더미 데이터 ---------- */
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const LOREM_WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ');
const KO_NOUNS = ['시스템', '데이터', '서비스', '사용자', '프로젝트', '개발자', '서버', '브라우저', '네트워크', '설계', '기능', '환경', '코드', '문서', '정보', '기술', '과정', '결과', '문제', '방법', '시간', '세상', '마음', '생각', '이야기', '여행', '음악', '커피', '아침', '도시'];
// [현재형, 관형형] 쌍 — '~는 중이다' 활용은 어간이 변해서(만든다→만드는) 단순 어미 교체로는 안 된다
const KO_VERBS = [['만든다', '만드는'], ['바꾼다', '바꾸는'], ['정리한다', '정리하는'], ['확인한다', '확인하는'], ['기록한다', '기록하는'], ['공유한다', '공유하는'], ['시작한다', '시작하는'], ['완성한다', '완성하는'], ['개선한다', '개선하는'], ['설명한다', '설명하는'], ['기다린다', '기다리는'], ['발견한다', '발견하는'], ['연결한다', '연결하는'], ['저장한다', '저장하는']];
const KO_ADJS = ['새로운', '빠른', '단순한', '중요한', '작은', '거대한', '조용한', '따뜻한', '낯선', '익숙한', '편리한', '안전한'];
// 마지막 글자 받침 유무로 조사 선택 (은/는, 을/를 등)
const hasBatchim = (w) => { const s = decomposeSyllable(w[w.length - 1]); return !!s && s[2] > 0; };
const josa = (w, a, b) => w + (hasBatchim(w) ? a : b);

function enSentence(first) {
  if (first) return 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
  const n = 5 + Math.floor(Math.random() * 8);
  const words = Array.from({ length: n }, () => pick(LOREM_WORDS));
  words[0] = words[0][0].toUpperCase() + words[0].slice(1);
  return words.join(' ') + '.';
}
function koSentence() {
  const n1 = pick(KO_NOUNS), n2 = pick(KO_NOUNS), adj = pick(KO_ADJS), [v, ving] = pick(KO_VERBS);
  return pick([
    () => `${josa(adj + ' ' + n1, '은', '는')} ${josa(n2, '을', '를')} ${v}.`,
    () => `${josa(n1, '이', '가')} ${adj} ${josa(n2, '을', '를')} ${ving} 중이다.`,
    () => `우리는 ${josa(n1, '을', '를')} 통해 ${adj} ${josa(n2, '을', '를')} ${v}.`,
    () => `${josa(n1, '은', '는')} 언제나 ${adj} ${josa(n2, '을', '를')} ${v}.`,
  ])();
}

tool({
  id: 'lorem-ipsum', cat: CAT, name: 'Lorem Ipsum / 한글 더미 텍스트',
  desc: '레이아웃 확인용 채움 텍스트를 영문(Lorem Ipsum) 또는 한글로 생성합니다.',
  keywords: 'lorem ipsum dummy filler placeholder text 더미 채움',
  render(root) {
    const io = makeIO(root, {
      inputs: null,
      options: [
        { id: 'lang', label: '언어', type: 'select', values: [['en', '영문 (Lorem Ipsum)'], ['ko', '한글']] },
        { id: 'unit', label: '단위', type: 'select', values: [['para', '문단'], ['sent', '문장'], ['word', '단어']] },
        { id: 'count', label: '개수', type: 'number', value: 3, size: 80 },
      ],
      actions: [{ id: 'gen', label: '생성' }],
      outputRows: 14,
      process(_, o) {
        const n = Math.min(500, Math.max(1, Math.floor(+o.count) || 1));
        const sent = (first) => o.lang === 'en' ? enSentence(first) : koSentence();
        if (o.unit === 'word') {
          return o.lang === 'en'
            ? Array.from({ length: n }, () => pick(LOREM_WORDS)).join(' ')
            : Array.from({ length: n }, () => pick([...KO_NOUNS, ...KO_ADJS])).join(' ');
        }
        if (o.unit === 'sent') return Array.from({ length: n }, (_, i) => sent(i === 0)).join(' ');
        return Array.from({ length: n }, (_, p) => {
          const cnt = 4 + Math.floor(Math.random() * 3);
          return Array.from({ length: cnt }, (_, i) => sent(p === 0 && i === 0)).join(' ');
        }).join('\n\n');
      },
    });
    io.run();
  },
});

const DUMMY_LAST = [...'김이박최정강조윤장임한오서신권황안송'];
const DUMMY_FIRST = ['민준', '서연', '도윤', '지우', '하은', '시우', '지호', '수아', '예준', '하린', '지민', '유진', '현우', '다은', '건우', '소율', '우진', '서현', '연우', '채원'];
const DUMMY_CITY = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '수원', '성남', '고양', '창원', '청주', '전주', '천안', '제주'];
const DUMMY_DOMAIN = ['example.com', 'example.org', 'test.co.kr', 'sample.io'];

tool({
  id: 'dummy-data', cat: CAT, name: '더미 데이터 생성기 (mock)',
  desc: '테스트용 가짜 인물 데이터(이름/이메일/전화번호 등)를 JSON, CSV, SQL로 생성합니다.',
  keywords: 'dummy mock fake data json csv sql seed 테스트 데이터',
  render(root) {
    const io = makeIO(root, {
      inputs: null,
      options: [
        { id: 'count', label: '개수', type: 'number', value: 10, size: 80 },
        { id: 'fmt', label: '형식', type: 'select', values: [['json', 'JSON'], ['csv', 'CSV'], ['sql', 'SQL INSERT']] },
      ],
      actions: [{ id: 'gen', label: '생성' }],
      outputRows: 16,
      note: '이름·연락처는 무작위 조합으로 만든 가짜 데이터입니다.',
      process(_, o) {
        const n = Math.min(1000, Math.max(1, Math.floor(+o.count) || 1));
        const d4 = () => String(1000 + Math.floor(Math.random() * 9000));
        const rows = Array.from({ length: n }, (_, i) => {
          const name = pick(DUMMY_LAST) + pick(DUMMY_FIRST);
          const email = `${romanize(name)}${Math.floor(Math.random() * 90) + 10}@${pick(DUMMY_DOMAIN)}`;
          const created = new Date(Date.now() - Math.floor(Math.random() * 730) * 864e5);
          return {
            id: i + 1, name, email,
            phone: `010-${d4()}-${d4()}`,
            age: 20 + Math.floor(Math.random() * 40),
            city: pick(DUMMY_CITY),
            created_at: created.toISOString().slice(0, 10),
          };
        });
        const cols = Object.keys(rows[0]);
        if (o.fmt === 'json') return JSON.stringify(rows, null, 2);
        if (o.fmt === 'csv') return cols.join(',') + '\n' + rows.map((r) => cols.map((c) => r[c]).join(',')).join('\n');
        const val = (v) => typeof v === 'number' ? v : `'${v}'`;
        return `INSERT INTO users (${cols.join(', ')}) VALUES\n` +
          rows.map((r) => `  (${cols.map((c) => val(r[c])).join(', ')})`).join(',\n') + ';';
      },
    });
    io.run();
  },
});
