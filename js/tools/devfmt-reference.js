// 코드 포맷팅 / 개발 유틸리티 — 참조표 / 계산기
import { tool, makeIO, h, formLabel, kvTable, copyBtn } from '../core.js';

const CAT = '코드 포맷팅 / 개발 유틸리티';

/* ---------- Crontab ---------- */
const CRON_FIELDS = ['분', '시', '일', '월', '요일'];
const MONTH_KO = ['', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
const DOW_KO = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
function descField(expr, idx) {
  const unit = CRON_FIELDS[idx];
  const name = (v) => idx === 3 ? (MONTH_KO[v] || v) : idx === 4 ? (DOW_KO[v] ?? v) : v;
  if (expr === '*') return null;
  return expr.split(',').map((part) => {
    let m;
    if ((m = part.match(/^\*\/(\d+)$/))) return `${m[1]}${idx <= 1 ? unit : ''} ${unit} 간격마다`;
    if ((m = part.match(/^(\d+)-(\d+)\/(\d+)$/))) return `${name(+m[1])}~${name(+m[2])} 사이 ${m[3]} 간격`;
    if ((m = part.match(/^(\d+)-(\d+)$/))) return `${name(+m[1])}~${name(+m[2])}`;
    if ((m = part.match(/^(\d+)\/(\d+)$/))) return `${name(+m[1])}부터 ${m[2]} 간격`;
    return `${name(isNaN(+part) ? part : +part)}`;
  }).join(', ') + ` (${unit})`;
}

tool({
  id: 'crontab', cat: CAT, name: 'Crontab 표현식 생성/설명',
  desc: 'cron 표현식을 사람이 읽을 수 있는 설명으로 풀어주고 자주 쓰는 패턴을 제공합니다.',
  keywords: 'cron crontab schedule expression job scheduler',
  render(root) {
    const presets = [
      ['* * * * *', '매분'], ['*/5 * * * *', '5분마다'], ['0 * * * *', '매시 정각'],
      ['0 0 * * *', '매일 자정'], ['0 9 * * 1-5', '평일 오전 9시'], ['0 0 * * 0', '매주 일요일 자정'],
      ['0 0 1 * *', '매월 1일 자정'], ['0 0 1 1 *', '매년 1월 1일'], ['30 4 * * 6', '토요일 새벽 4:30'],
    ];
    const io = makeIO(root, {
      inputs: [{ id: 'input', label: 'cron 표현식 (분 시 일 월 요일)', rows: 1, value: '*/15 9-18 * * 1-5' }],
      outputHTML: true, runOnLoad: true,
      process(text) {
        const parts = text.trim().split(/\s+/);
        if (parts.length !== 5) throw new Error('cron 표현식은 5개 필드(분 시 일 월 요일)여야 합니다.');
        const rows = parts.map((p, i) => [CRON_FIELDS[i], p + (descField(p, i) ? ' → ' + descField(p, i) : ' → 매 ' + CRON_FIELDS[i])]);
        const descs = parts.map((p, i) => descField(p, i)).filter(Boolean);
        return h('div', null,
          h('p', { style: { fontWeight: 700 } }, descs.length ? descs.join(' / ') + ' 에 실행' : '매분 실행'),
          kvTable(rows));
      },
    });
    root.append(h('h4', null, '자주 쓰는 패턴'),
      h('div', { class: 'btn-row' }, presets.map(([expr, label]) =>
        h('button', { class: 'btn small', type: 'button', onclick: () => { io.inputEls.input.value = expr; io.run(); } }, `${label} (${expr})`))));
  },
});

tool({
  id: 'chmod', cat: CAT, name: 'chmod 계산기',
  desc: '권한 체크박스, 8진수, 심볼릭(rwxr-xr--) 표기를 상호 변환합니다.',
  keywords: 'chmod permission unix 755',
  render(root) {
    const who = ['소유자(u)', '그룹(g)', '기타(o)'];
    const perms = ['읽기(r)', '쓰기(w)', '실행(x)'];
    const boxes = [];
    const grid = h('table', { class: 'grid' },
      h('tr', null, h('th', null, ''), perms.map((p) => h('th', null, p))),
      who.map((w, wi) => h('tr', null, h('th', null, w),
        perms.map((_, pi) => {
          const cb = h('input', { type: 'checkbox', 'aria-label': `${who[wi]} ${perms[pi]}` });
          boxes[wi * 3 + pi] = cb;
          cb.addEventListener('change', update);
          return h('td', { style: { textAlign: 'center' } }, cb);
        }))));
    const octInput = h('input', { type: 'text', value: '755', style: { width: '90px' }, class: 'mono' });
    const symOut = h('span', { class: 'mono', style: { fontSize: '18px', fontWeight: '700' } });
    const cmdOut = h('code', { class: 'mono' });

    function fromOctal() {
      const v = octInput.value.trim();
      if (!/^[0-7]{3,4}$/.test(v)) return;
      const digits = v.slice(-3).split('').map(Number);
      digits.forEach((d, wi) => {
        boxes[wi * 3].checked = !!(d & 4);
        boxes[wi * 3 + 1].checked = !!(d & 2);
        boxes[wi * 3 + 2].checked = !!(d & 1);
      });
      render();
    }
    function update() {
      const digits = [0, 1, 2].map((wi) =>
        (boxes[wi * 3].checked ? 4 : 0) + (boxes[wi * 3 + 1].checked ? 2 : 0) + (boxes[wi * 3 + 2].checked ? 1 : 0));
      octInput.value = digits.join('');
      render();
    }
    function render() {
      const chars = 'rwx';
      let sym = '';
      boxes.forEach((cb, i) => (sym += cb.checked ? chars[i % 3] : '-'));
      symOut.textContent = sym;
      cmdOut.textContent = `chmod ${octInput.value} 파일명`;
    }
    octInput.addEventListener('input', fromOctal);
    root.append(
      h('div', { class: 'opt-row', style: { marginBottom: '14px' } },
        h('span', { class: 'opt-item' }, formLabel(octInput, '8진수'), octInput),
        h('span', { class: 'opt-item' }, h('span', null, '심볼릭'), symOut)),
      grid,
      h('p', null, cmdOut, ' ', copyLater()));
    function copyLater() {
      return copyBtn(() => cmdOut.textContent);
    }
    fromOctal();
  },
});

tool({
  id: 'git-cheatsheet', cat: CAT, name: 'Git 치트시트',
  desc: '자주 쓰는 Git 명령어 모음입니다.',
  keywords: 'git cheat sheet command',
  render(root) {
    const sections = {
      '기본': [
        ['git init', '저장소 초기화'], ['git clone <url>', '저장소 복제'],
        ['git status', '변경 상태 확인'], ['git add <파일>', '스테이징'], ['git add -p', '변경 덩어리별 선택 스테이징'],
        ['git commit -m "메시지"', '커밋'], ['git commit --amend', '마지막 커밋 수정'],
      ],
      '브랜치': [
        ['git branch', '브랜치 목록'], ['git switch -c <이름>', '브랜치 생성 후 이동'],
        ['git switch <이름>', '브랜치 이동'], ['git merge <브랜치>', '병합'],
        ['git rebase <브랜치>', '리베이스'], ['git branch -d <이름>', '브랜치 삭제'],
        ['git cherry-pick <해시>', '특정 커밋만 가져오기'],
      ],
      '원격': [
        ['git remote -v', '원격 저장소 확인'], ['git fetch', '원격 변경 가져오기(병합 안 함)'],
        ['git pull --rebase', '가져와서 리베이스'], ['git push -u origin <브랜치>', '푸시 + 업스트림 설정'],
        ['git push --force-with-lease', '안전한 강제 푸시'],
      ],
      '되돌리기': [
        ['git restore <파일>', '작업 트리 변경 취소'], ['git restore --staged <파일>', '스테이징 취소'],
        ['git reset --soft HEAD~1', '커밋 취소(변경 유지)'], ['git reset --hard HEAD~1', '커밋+변경 모두 취소 ⚠'],
        ['git revert <해시>', '커밋을 뒤집는 새 커밋'], ['git reflog', '모든 HEAD 이동 이력(복구용)'],
      ],
      '조회': [
        ['git log --oneline --graph', '히스토리 그래프'], ['git diff', '변경 내용'], ['git diff --staged', '스테이징된 변경'],
        ['git blame <파일>', '라인별 마지막 수정자'], ['git show <해시>', '커밋 상세'],
        ['git stash / git stash pop', '변경 임시 저장/복원'], ['git bisect start', '이진 탐색으로 버그 커밋 찾기'],
      ],
    };
    for (const [title, cmds] of Object.entries(sections)) {
      root.append(h('h3', null, title),
        h('table', { class: 'kv' }, cmds.map(([c, d]) => h('tr', null, h('th', { class: 'mono', style: { fontWeight: 400 } }, c), h('td', { style: { fontFamily: 'inherit' } }, d)))));
    }
  },
});
