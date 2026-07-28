// 날짜 / 시간 도구 정밀 테스트.
// 로컬 시간 의존 결과가 결정적이 되도록 시간대를 서울로 고정한다.
import { test, toolCase } from '../helpers.js';

test.use({ timezoneId: 'Asia/Seoul' });

const cases = [
  // Unix 타임스탬프
  {
    name: 'unix-time: 초 단위 타임스탬프', tool: 'unix-time', inputs: '1700000000',
    kv: {
      'Unix (초)': '1700000000', 'Unix (밀리초)': '1700000000000',
      'ISO 8601 (UTC)': '2023-11-14T22:13:20.000Z', '요일': '수요일', '연중 일수': '319일째',
    },
  },
  {
    name: 'unix-time: 밀리초 단위 타임스탬프', tool: 'unix-time', inputs: '1700000000000',
    kv: { 'ISO 8601 (UTC)': '2023-11-14T22:13:20.000Z', 'Unix (초)': '1700000000' },
  },
  {
    name: 'unix-time: 날짜 문자열 입력 (로컬 해석)', tool: 'unix-time', inputs: '2024-03-01 12:00',
    kv: { 'Unix (초)': '1709262000', 'ISO 8601 (UTC)': '2024-03-01T03:00:00.000Z' },
  },
  { name: 'unix-time: 인식 불가 입력은 에러', tool: 'unix-time', inputs: 'abc', htmlError: '인식할 수 없는 날짜/타임스탬프입니다.' },

  // 날짜-시간 형식 변환
  {
    name: 'datetime-format: 기본 패턴과 표준 형식', tool: 'datetime-format', inputs: '2024-01-15 14:30',
    kv: {
      '커스텀': '2024-01-15 14:30:00', 'ISO 8601': '2024-01-15T05:30:00.000Z',
      'Unix (초)': '1705296600', 'YYYYMMDD': '20240115',
    },
  },
  {
    name: 'datetime-format: 커스텀 패턴 토큰', tool: 'datetime-format',
    options: { '커스텀 패턴': 'YYYY년 M월 D일 dddd' }, inputs: '2024-01-15 14:30',
    kv: { '커스텀': '2024년 1월 15일 월요일' },
  },

  // Windows FILETIME
  {
    name: 'filetime: FILETIME → 날짜', tool: 'filetime', inputs: '133516656000000000',
    kv: { 'ISO 8601': '2024-02-06T04:00:00.000Z', 'Unix (초)': '1707192000' },
  },
  {
    name: 'filetime: 날짜 → FILETIME', tool: 'filetime', inputs: '2024-02-06T04:00:00Z',
    kv: { 'FILETIME (10진)': '133516656000000000' },
  },

  // UTC ↔ 시간대 변환
  {
    name: 'utc-local: UTC 입력을 각 시간대로 표시', tool: 'utc-local',
    options: { '입력 해석': 'utc' }, inputs: '2024-01-15 12:00',
    kv: { 'UTC (UTC)': /12:00:00/, '서울 (Asia/Seoul)': /9:00:00/, '도쿄 (Asia/Tokyo)': /9:00:00/ },
  },

  // 날짜 계산기
  {
    name: 'date-calc: 개월 더하기는 말일로 클램프 (윤년)', tool: 'date-calc',
    options: { '계산': 'add', '기준일': '2024-01-31', '더할 값 (± 가능)': 1, '단위': 'm' },
    kv: { '결과': '2024-02-29 (목)', 'ISO 8601': '2024-02-29' },
  },
  {
    name: 'date-calc: 년 더하기도 말일로 클램프', tool: 'date-calc',
    options: { '계산': 'add', '기준일': '2024-02-29', '더할 값 (± 가능)': 1, '단위': 'y' },
    kv: { '결과': '2025-02-28 (금)' },
  },
  {
    name: 'date-calc: 일 빼기', tool: 'date-calc',
    options: { '계산': 'add', '기준일': '2024-03-01', '더할 값 (± 가능)': -30, '단위': 'd' },
    kv: { '결과': '2024-01-31 (수)' },
  },
  {
    name: 'date-calc: 두 날짜 차이 / D-day / 영업일', tool: 'date-calc',
    options: { '계산': 'diff', '기준일': '2024-01-01', '목표일 (차이 모드)': '2024-12-31' },
    kv: {
      'D-day': 'D-365', '일수 차이': '365일', '주 단위': '52주 1일',
      '달력 기준': '0년 11개월 30일', '영업일 (주말 제외)': '261일',
    },
  },
];

for (const c of cases) toolCase(c);
