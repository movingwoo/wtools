// 문자열 / 텍스트 유틸리티
import { tool, makeIO, h, kvTable, strToBytes, bytesToHex, copyBtn, copyText } from '../core.js';

const CAT = '문자열 / 텍스트';

function splitWords(text) {
  return text
    .replace(/(?<=[a-z0-9])(?=[A-Z])/g, ' ')
    .replace(/(?<=[A-Z])(?=[A-Z][a-z])/g, ' ')
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
        // NFKD는 한글 음절도 옛 자모로 분해하므로, 악센트 제거 후 NFC로 재결합해야 한글이 유지된다.
        let s = text.normalize('NFKD').replace(/[̀-ͯ]/g, '').normalize('NFC');
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

/* ---------- 유니코드 문자 분석 ----------
   이름 데이터베이스(UnicodeData.txt)는 통째로 싣기에 너무 커서, 눈에 보이지 않아
   실제로 문제를 일으키는 문자만 이름을 들고 있고 나머지는 속성으로 분류한다. */
const SPECIAL_CHARS = {
  0x0009: ['탭 (TAB)', 'control'],
  0x000a: ['줄바꿈 (LF)', 'control'],
  0x000d: ['캐리지 리턴 (CR)', 'control'],
  0x0020: ['공백 (SPACE)', 'space'],
  0x00a0: ['줄바꿈 없는 공백 (NBSP)', 'space'],
  0x00ad: ['소프트 하이픈 (SHY)', 'hidden'],
  0x061c: ['아랍 문자 표시 (ALM)', 'bidi'],
  0x1680: ['오검 공백', 'space'],
  0x180e: ['몽골 모음 구분자', 'hidden'],
  0x200b: ['제로폭 공백 (ZWSP)', 'hidden'],
  0x200c: ['제로폭 비접합자 (ZWNJ)', 'hidden'],
  0x200d: ['제로폭 접합자 (ZWJ)', 'hidden'],
  0x200e: ['좌우 표시 (LRM)', 'bidi'],
  0x200f: ['우좌 표시 (RLM)', 'bidi'],
  0x202a: ['좌우 삽입 (LRE)', 'bidi'],
  0x202b: ['우좌 삽입 (RLE)', 'bidi'],
  0x202c: ['서식 종료 (PDF)', 'bidi'],
  0x202d: ['좌우 강제 (LRO)', 'bidi'],
  0x202e: ['우좌 강제 (RLO)', 'bidi'],
  0x202f: ['좁은 NBSP', 'space'],
  0x205f: ['중간 수학 공백', 'space'],
  0x2060: ['단어 결합자 (WJ)', 'hidden'],
  0x2066: ['좌우 격리 (LRI)', 'bidi'],
  0x2067: ['우좌 격리 (RLI)', 'bidi'],
  0x2068: ['첫 강한 문자 격리 (FSI)', 'bidi'],
  0x2069: ['격리 종료 (PDI)', 'bidi'],
  0x3000: ['전각 공백', 'space'],
  0xfeff: ['BOM / 제로폭 NBSP', 'hidden'],
  0xfffc: ['오브젝트 대체 문자', 'hidden'],
  0xfffd: ['대체 문자 (깨진 인코딩)', 'hidden'],
};
// 라틴 문자와 헷갈리는 키릴·그리스 문자. 섞여 있으면 위장 문자열일 가능성이 높다.
const LOOKALIKES = {
  'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't',
  'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ԛ': 'q', 'ԝ': 'w',
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T',
  'У': 'Y', 'Х': 'X', 'І': 'I', 'Ј': 'J', 'Ѕ': 'S',
  'α': 'a', 'ο': 'o', 'ρ': 'p', 'ν': 'v', 'τ': 't', 'υ': 'u', 'χ': 'x', 'ι': 'i', 'κ': 'k',
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N',
  'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
};

const SCRIPTS = [
  ['Hangul', '한글'], ['Han', '한자'], ['Hiragana', '히라가나'], ['Katakana', '가타카나'],
  ['Latin', '라틴'], ['Cyrillic', '키릴'], ['Greek', '그리스'], ['Arabic', '아랍'],
  ['Hebrew', '히브리'], ['Thai', '태국'], ['Devanagari', '데바나가리'],
];
const CATEGORIES = [
  [/\p{L}/u, '문자'], [/\p{N}/u, '숫자'], [/\p{M}/u, '결합 표시'], [/\p{P}/u, '구두점'],
  [/\p{S}/u, '기호'], [/\p{Z}/u, '공백'], [/\p{C}/u, '제어/서식'],
];

function describeChar(ch) {
  const cp = ch.codePointAt(0);
  const special = SPECIAL_CHARS[cp];
  if (special) return special[0];
  if (/\p{Extended_Pictographic}/u.test(ch)) return '그림문자(이모지)';
  if (cp >= 0xfe00 && cp <= 0xfe0f) return `변이 선택자 VS${cp - 0xfe00 + 1}`;
  if (cp >= 0xe0000 && cp <= 0xe007f) return '태그 문자 (숨김)';
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) return '제어 문자';
  for (const [script, label] of SCRIPTS)
    if (new RegExp(`\\p{Script=${script}}`, 'u').test(ch)) return label;
  for (const [re, label] of CATEGORIES) if (re.test(ch)) return label;
  return '알 수 없음';
}
const codePointLabel = (cp) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');

tool({
  id: 'unicode-inspect', cat: CAT, name: '유니코드 문자 분석기',
  desc: '문자마다 코드포인트, UTF-8/UTF-16 바이트, 종류를 표로 보여줍니다.',
  keywords: 'unicode codepoint inspect utf8 utf16 character 문자 코드포인트 분석 grapheme',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '텍스트', rows: 4, value: '한A👍🏽' }],
      options: [{ id: 'limit', label: '최대 표시 문자 수', type: 'number', value: 300, size: 80 }],
      outputHTML: true, runOnLoad: true,
      process(text, o) {
        if (!text) return '';
        const chars = [...text];
        const limit = Math.max(1, Math.trunc(+o.limit) || 300);
        const graphemes = typeof Intl.Segmenter === 'function'
          ? [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(text)].length
          : null;
        const box = h('div', null, kvTable([
          ['코드포인트 수', chars.length],
          ['UTF-16 길이 (JS length)', text.length],
          ['UTF-8 바이트', strToBytes(text).length],
          ...(graphemes == null ? [] : [['자소(grapheme) 수', graphemes]]),
        ]));
        const shown = chars.slice(0, limit);
        box.append(h('h3', null, '문자별 상세'),
          h('table', { class: 'grid' },
            h('tr', null, ['#', '문자', '코드포인트', '종류', 'UTF-8', 'UTF-16'].map((x) => h('th', null, x))),
            shown.map((ch, idx) => {
              const cp = ch.codePointAt(0);
              const printable = !(cp < 0x20 || SPECIAL_CHARS[cp]?.[1] === 'hidden' || SPECIAL_CHARS[cp]?.[1] === 'bidi');
              const utf16 = [...ch].flatMap((c) => [...Array(c.length)].map((_, i) => c.charCodeAt(i)));
              return h('tr', null,
                h('td', null, idx),
                h('td', { class: 'mono' }, printable ? ch : '·'),
                h('td', { class: 'mono' }, codePointLabel(cp)),
                h('td', null, describeChar(ch)),
                h('td', { class: 'mono' }, bytesToHex(strToBytes(ch)).replace(/..(?=.)/g, '$& ')),
                h('td', { class: 'mono' }, utf16.map((u) => u.toString(16).toUpperCase().padStart(4, '0')).join(' ')));
            })));
        if (chars.length > shown.length)
          box.append(h('p', { class: 'note' }, `${chars.length - shown.length}자를 더 표시하려면 최대 표시 문자 수를 늘리세요.`));
        return box;
      },
      note: '눈에 보이지 않는 문자는 문자 칸에 · 로 표시합니다.',
    });
  },
});

/* 정리 대상: 지워야 하는 문자와 일반 공백으로 바꿔야 하는 문자를 나눠 둔다.
   전부 눈에 보이지 않는 문자라 소스에 그대로 적으면 읽을 수 없어 이스케이프로 쓴다.
   지움: 소프트 하이픈, 몽골 모음 구분자, 제로폭·양방향 서식, BOM, 태그 문자
   공백화: NBSP, 오검 공백, 유럽 활자 공백, 좁은 NBSP, 중간 수학 공백, 전각 공백 */
const REMOVE_RE = /[\u00ad\u180e\u200b-\u200f\u2060-\u2064\u2066-\u206f\ufeff\ufffc]|[\u{e0000}-\u{e007f}]/gu;
const SPACE_RE = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g;
// 데모 입력: 키릴 "\u0430" + 제로폭 공백 + 소프트 하이픈이 섞인 위장 이메일 주소
const DEMO_HIDDEN = '\u0430dmin\u200b@exam\u00adple.com';

function findSuspects(text) {
  const found = [];
  const chars = [...text];
  let offset = 0;
  const hasLatin = /\p{Script=Latin}/u.test(text);
  for (const ch of chars) {
    const cp = ch.codePointAt(0);
    const kind = SPECIAL_CHARS[cp]?.[1];
    let reason = null;
    if (kind === 'hidden') reason = '보이지 않는 문자';
    else if (kind === 'bidi') reason = '양방향 서식 문자';
    else if (kind === 'space' && cp !== 0x20) reason = '일반 공백이 아닌 공백';
    else if (cp >= 0xe0000 && cp <= 0xe007f) reason = '태그 문자 (보이지 않음)';
    else if ((cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) && cp !== 9 && cp !== 10 && cp !== 13) reason = '제어 문자';
    else if (hasLatin && LOOKALIKES[ch]) reason = `라틴 문자 "${LOOKALIKES[ch]}"와 혼동되는 문자`;
    else if (cp >= 0xff01 && cp <= 0xff5e) reason = '전각 ASCII 문자';
    if (reason) found.push({ offset, ch, cp, reason });
    offset += ch.length;
  }
  return found;
}

function cleanText(text, { homoglyph, fullwidth }) {
  let out = text.replace(REMOVE_RE, '').replace(SPACE_RE, ' ');
  if (homoglyph) out = [...out].map((ch) => LOOKALIKES[ch] ?? ch).join('');
  if (fullwidth) out = out.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  return out;
}

tool({
  id: 'invisible-chars', cat: CAT, name: '숨은 문자 탐지 / 정리',
  desc: '제로폭 문자, BOM, 양방향 서식, 특수 공백, 혼동되는 위장 문자를 찾아내고 제거합니다.',
  keywords: 'zero width zwsp bom nbsp invisible hidden homoglyph bidi trojan source 제로폭 숨은문자 공백 위장',
  render(root) {
    root.append(h('h3', null, '검사'));
    makeIO(root, {
      inputs: [{ id: 'input', label: '텍스트', rows: 5, value: DEMO_HIDDEN }],
      outputHTML: true, runOnLoad: true,
      process(text) {
        if (!text) return '';
        const found = findSuspects(text);
        if (!found.length)
          return h('p', { style: { color: 'var(--ok)', fontWeight: '700' } }, '✔ 의심스러운 문자가 없습니다.');
        const box = h('div', null, h('p', { style: { fontWeight: '700', color: 'var(--danger)' } },
          `⚠ ${found.length}개의 의심 문자를 찾았습니다.`));
        box.append(h('table', { class: 'grid' },
          h('tr', null, ['위치', '코드포인트', '이름', '이유'].map((x) => h('th', null, x))),
          found.slice(0, 300).map((item) => h('tr', null,
            h('td', null, item.offset),
            h('td', { class: 'mono' }, codePointLabel(item.cp)),
            h('td', null, describeChar(item.ch)),
            h('td', null, item.reason)))));
        return box;
      },
      note: '위치는 JavaScript 문자열 인덱스(UTF-16) 기준입니다.',
    });

    root.append(h('h3', { style: { marginTop: '26px' } }, '정리'));
    makeIO(root, {
      inputs: [{ id: 'input', label: '텍스트', rows: 5, value: DEMO_HIDDEN }],
      options: [
        { id: 'homoglyph', label: '위장 문자를 라틴 문자로', type: 'checkbox', value: true },
        { id: 'fullwidth', label: '전각 ASCII를 반각으로', type: 'checkbox', value: true },
      ],
      outputRows: 6, runOnLoad: true,
      process(text, o) {
        if (!text) return '';
        const cleaned = cleanText(text, o);
        const removed = [...text].length - [...cleaned].length;
        return cleaned + `\n\n// ${removed}자 제거, ${text === cleaned ? '변경 없음' : '정리 완료'}`;
      },
      note: '보이지 않는 문자는 지우고, 특수 공백은 일반 공백으로 바꿉니다.',
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

/* 전체 이모지: 로컬 검색 데이터(한국어+영어 라벨/검색어)를 도구를 열 때 한 번만 로드.
   스킨톤 변형은 제외한 기본형만 사용한다. 로드 실패 시 위의 큐레이션 목록으로 폴백. */
const EMOJI_CAT = [[0, '표정'], [1, '사람'], [3, '동물/자연'], [4, '음식/음료'], [5, '여행/장소'], [6, '활동'], [7, '사물'], [8, '기호'], [9, '깃발']];
const EMOJI_GROUPS = new Set(EMOJI_CAT.map(([value]) => value));
const EMOJI_DATA_URL = new URL('../../assets/data/emoji.json', import.meta.url);
let emojiAll = null;
async function loadAllEmojis(signal) {
  if (emojiAll) return emojiAll;
  const response = await fetch(EMOJI_DATA_URL, { signal });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const data = await response.json();
  if (data?.version !== 1 || !Array.isArray(data.emoji)) throw new Error('이모지 데이터 형식이 올바르지 않습니다.');
  const loaded = data.emoji.map((row) => {
    if (!Array.isArray(row) || row.length !== 4 || typeof row[0] !== 'string'
      || !EMOJI_GROUPS.has(row[1]) || typeof row[2] !== 'string' || typeof row[3] !== 'string') {
      throw new Error('이모지 데이터 항목이 올바르지 않습니다.');
    }
    const [e, g, t, keywords] = row;
    return { e, g, t, kw: `${t} ${keywords}`.toLowerCase() };
  });
  if (!loaded.length) throw new Error('이모지 데이터가 비어 있습니다.');
  emojiAll = loaded;
  return loaded;
}

tool({
  id: 'emoji-picker', cat: CAT, name: '이모지 피커',
  desc: '유니코드 전체 이모지(약 1,900개)를 한국어/영어로 검색하고 클릭해서 복사합니다.',
  keywords: 'emoji picker copy unicode',
  render(root) {
    const CHUNK = 200; // 한 번에 그리는 개수 — 나머지는 스크롤 시 추가 로드
    const searchBox = h('input', { type: 'text', placeholder: '검색 (예: 하트, fire, 웃음)', style: { flex: '1', minWidth: '0' } });
    const catSel = h('select', { 'aria-label': '카테고리' },
      h('option', { value: '' }, '전체 카테고리'),
      EMOJI_CAT.map(([v, l]) => h('option', { value: v }, l)));
    const info = h('p', {
      class: 'note', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true',
    }, '이모지 데이터 불러오는 중...');
    const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: '6px', marginTop: '12px' } });
    const sentinel = h('div', { style: { height: '1px' } });
    let list = [], filtered = [], shown = 0, warn = '', raf = 0, active = true;
    const controller = new AbortController();

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
            try {
              await copyText(e);
              info.classList.remove('error');
              info.textContent = `${e} 복사됨! (${t})`;
            } catch (error) {
              info.classList.add('error');
              info.textContent = error.message;
            }
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
        raf = requestAnimationFrame(fillViewport);
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
    const observer = new IntersectionObserver((es) => { if (es[0].isIntersecting) fillViewport(); }, { rootMargin: '300px' });
    observer.observe(sentinel);

    searchBox.addEventListener('input', apply);
    catSel.addEventListener('change', apply);
    root.append(h('div', { style: { display: 'flex', gap: '8px' } }, searchBox, catSel), info, grid, sentinel);

    loadAllEmojis(controller.signal)
      .then((all) => { if (!active) return; list = all; apply(); })
      .catch(() => {
        if (!active) return;
        list = EMOJIS.map(([e, kw]) => ({ e, g: -1, t: kw, kw: kw.toLowerCase() }));
        warn = '⚠ 로컬 전체 목록을 불러오지 못해 기본 목록으로 표시합니다. ';
        apply();
      });
    return () => {
      active = false;
      controller.abort();
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  },
});

const FIGLET_FONT_FILES = new Map(
  ['Standard', 'Big', 'Small', 'Slant', 'Banner', 'Block', 'Doom', 'Ghost', 'Shadow', 'Speed']
    .map((name) => [name, `../../assets/data/figlet/${name}.flf`]),
);
const figletFonts = new Map();
let figletEnginePromise;

function loadFigletEngine() {
  if (!figletEnginePromise) {
    figletEnginePromise = import('../lib/text/figlet.js').catch((error) => {
      figletEnginePromise = null;
      throw error;
    });
  }
  return figletEnginePromise;
}

function loadFigletFont(name) {
  const relative = FIGLET_FONT_FILES.get(name);
  if (!relative) return Promise.reject(new Error('지원하지 않는 FIGlet 폰트입니다.'));
  if (!figletFonts.has(name)) {
    const loading = (async () => {
      const [{ parseFigFont, renderFiglet }, response] = await Promise.all([
        loadFigletEngine(), fetch(new URL(relative, import.meta.url)),
      ]);
      if (!response.ok) throw new Error(`내장 폰트를 불러오지 못했습니다. (HTTP ${response.status})`);
      try {
        return { font: parseFigFont(await response.text()), renderFiglet };
      } catch (error) {
        throw new Error('내장 폰트 데이터가 올바르지 않습니다.', { cause: error });
      }
    })().catch((error) => {
      figletFonts.delete(name);
      throw error;
    });
    figletFonts.set(name, loading);
  }
  return figletFonts.get(name);
}

tool({
  id: 'ascii-art', cat: CAT, name: 'ASCII 텍스트 배너 생성기',
  desc: '영문과 숫자를 큰 ASCII 문자 배너로 변환합니다. (FIGlet)',
  keywords: 'ascii art figlet banner 텍스트 배너 아스키 아트',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '텍스트 (영문/숫자)', rows: 2, value: 'WTools' }],
      options: [{ id: 'font', label: '폰트', type: 'select', values: ['Standard', 'Big', 'Small', 'Slant', 'Banner', 'Block', 'Doom', 'Ghost', 'Shadow', 'Speed'] }],
      outputRows: 14,
      async process(text, o) {
        if (!text.trim()) return '';
        if (/[^\x20-\x7e\r\n]/.test(text)) {
          throw new Error('영문, 숫자 및 ASCII 기호만 입력해 주세요.');
        }
        const { font, renderFiglet } = await loadFigletFont(o.font);
        return renderFiglet(text, font);
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
      inputs: [{ id: 'input', label: '입력', rows: 5, value: 'dkssudgktpdy! dhsmfeh gksdudzlfmf RkaQkrgoTspdy' }],
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
