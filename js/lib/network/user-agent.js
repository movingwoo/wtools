// User-Agent parser for the browser, engine, OS, device, and CPU fields exposed by W-Tools.

const MAX_UA_LENGTH = 8192;

export const USER_AGENT_SUPPORT = Object.freeze({
  reviewed: '2026-08-25',
  scope: '주요 데스크톱·모바일 브라우저와 Android WebView, Facebook·Instagram·KakaoTalk·LINE 등 대표 인앱 브라우저',
  limitations: '축소되거나 동결된 UA만으로 Windows 11, iPadOS 세부 버전, Brave·Arc처럼 토큰을 노출하지 않는 브라우저는 구분할 수 없습니다.',
});

function version(value) {
  return value?.replace(/_/g, '.');
}

function result(name, rawVersion) {
  const parsedVersion = version(rawVersion);
  return {
    ...(name ? { name } : {}),
    ...(parsedVersion ? { version: parsedVersion, major: parsedVersion.split('.')[0] } : {}),
  };
}

function match(ua, expression) {
  return expression.exec(ua);
}

function parseBrowser(ua) {
  let found;
  found = match(ua, /\[(?:FBAN\/MessengerForiOS|FB_IAB\/MESSENGER);[\s\S]*?FBAV\/([\d.]+)/i);
  if (found) return result('Facebook Messenger', found[1]);
  found = match(ua, /\[(?:FBAN\/[^;\]]+|FB_IAB\/[^;\]]+);[\s\S]*?FBAV\/([\d.]+)/i);
  if (found) return result('Facebook', found[1]);
  const rules = [
    [/\bInstagram[ /]([\d.]+)/i, 'Instagram'],
    [/\bKAKAOTALK\/([\d.]+)/i, 'KakaoTalk'],
    [/\bLine\/([\d.]+)/i, 'LINE'],
    [/\bWhale\/([\d.]+)/i, 'Whale'],
    [/\bElectron\/([\d.]+)/i, 'Electron'],
    [/(?:EdgiOS|EdgA|Edg|Edge)\/([\d.]+)/i, 'Edge'],
    [/(?:OPiOS|OPR)\/([\d.]+)/i, 'Opera'],
    [/SamsungBrowser\/([\d.]+)/i, 'Samsung Internet'],
    [/HuaweiBrowser\/([\d.]+)/i, 'Huawei Browser'],
    [/Vivaldi\/([\d.]+)/i, 'Vivaldi'],
    [/YaBrowser\/([\d.]+)/i, 'Yandex'],
    [/DuckDuckGo\/([\d.]+)/i, 'DuckDuckGo'],
    [/FxiOS\/([\d.]+)/i, 'Firefox'],
    [/Firefox\/([\d.]+)/i, 'Firefox'],
    [/HeadlessChrome\/([\d.]+)/i, 'Chrome Headless'],
  ];
  for (const [expression, name] of rules) {
    found = match(ua, expression);
    if (found) return result(name, found[1]);
  }

  found = match(ua, /(?:Chrome|CrMo)\/([\d.]+)/i);
  if (found && /(?:;\s*wv\)|\bVersion\/4\.0\b)/i.test(ua)) return result('Chrome WebView', found[1]);
  found = match(ua, /CriOS\/([\d.]+)/i);
  if (found) return result('Chrome', found[1]);
  found = match(ua, /(?:Chrome|Chromium|CrMo)\/([\d.]+)/i);
  if (found) return result('Chrome', found[1]);

  found = match(ua, /MSIE\s([\d.]+)/i) || match(ua, /Trident\/[\d.]+[\s\S]*?rv:([\d.]+)/i);
  if (found) return result('IE', found[1]);
  found = match(ua, /Android[\s\S]*?Version\/([\d.]+)[\s\S]*?Safari\//i);
  if (found) return result('Android Browser', found[1]);
  found = match(ua, /Version\/([\d.]+)[\s\S]*?Mobile\/[\w.]+[\s\S]*?Safari\//i);
  if (found) return result('Mobile Safari', found[1]);
  found = match(ua, /Version\/([\d.]+)[\s\S]*?Safari\//i);
  if (found) return result('Safari', found[1]);
  return {};
}

function parseEngine(ua, browser) {
  let found = match(ua, /Trident\/([\d.]+)/i);
  if (found) return result('Trident', found[1]);
  found = match(ua, /Edge\/([\d.]+)/i);
  if (found) return result('EdgeHTML', found[1]);
  found = match(ua, /Presto\/([\d.]+)/i);
  if (found) return result('Presto', found[1]);
  found = match(ua, /rv:([\d.]+)[\s\S]*?Gecko\//i);
  if (found && /Firefox\//i.test(ua)) return result('Gecko', found[1]);

  const blink = !/(?:CriOS|FxiOS|EdgiOS|OPiOS)\//i.test(ua)
    && /(?:Chrome|Chromium|CrMo|EdgA?|OPR|SamsungBrowser|Vivaldi|YaBrowser)\//i.test(ua);
  if (blink) {
    found = match(ua, /(?:Chrome|Chromium|CrMo)\/([\d.]+)/i)
      || match(ua, /(?:EdgA?|OPR|SamsungBrowser|Vivaldi|YaBrowser)\/([\d.]+)/i);
    return result('Blink', found?.[1] || browser.version);
  }
  found = match(ua, /AppleWebKit\/([\d.]+)/i);
  if (found) return result('WebKit', found[1]);
  found = match(ua, /Gecko\/([\d.]+)/i);
  if (found) return result('Gecko', found[1]);
  return {};
}

const WINDOWS_VERSIONS = Object.freeze({
  '10.0': '10', '6.4': '10', '6.3': '8.1', '6.2': '8', '6.1': '7',
  '6.0': 'Vista', '5.2': 'XP', '5.1': 'XP', '5.0': '2000',
});

function parseOs(ua) {
  let found = match(ua, /Windows Phone(?: OS)?[\s/]([\d.]+)/i);
  if (found) return result('Windows Phone', found[1]);
  found = match(ua, /Windows NT\s([\d.]+)/i);
  if (found) return result('Windows', WINDOWS_VERSIONS[found[1]] || found[1]);
  found = match(ua, /\bInstagram[\s\S]*?Android\s*\(\d+\/([\d.]+)/i);
  if (found) return result('Android', found[1]);
  found = match(ua, /Android[\s/-]?([\d._]+)?/i);
  if (found) return result('Android', found[1]);
  found = match(ua, /(?:CPU (?:iPhone )?OS|iPhone OS)\s([\d_]+)/i);
  if (found) return result('iOS', found[1]);
  if (/\bMacintosh\b[\s\S]*?\bMobile\//i.test(ua)) return result('iPadOS');
  found = match(ua, /Mac OS X[\s/]([\d_]+)/i);
  if (found) return result('Mac OS', found[1]);
  found = match(ua, /CrOS\s(?:[^;\s]+)\s([\d.]+)/i);
  if (found) return result('Chrome OS', found[1]);
  found = match(ua, /Tizen[\s/]([\d.]+)/i);
  if (found) return result('Tizen', found[1]);
  found = match(ua, /(?:webOS|hpwOS)[\s/]([\d.]+)/i);
  if (found) return result('webOS', found[1]);
  if (/Ubuntu/i.test(ua)) return result('Ubuntu');
  if (/Fedora/i.test(ua)) return result('Fedora');
  if (/Debian/i.test(ua)) return result('Debian');
  found = match(ua, /Linux(?:\s|;)(?:[^;)]+;\s*)?([a-z0-9_64-]+)/i);
  if (found) return result('Linux', found[1]);
  if (/Linux/i.test(ua)) return result('Linux');
  return {};
}

function androidModel(ua) {
  const instagram = match(ua, /\bInstagram[\s\S]*?Android\s*\((?:[^;]+;){4}\s*([^;)]+)/i);
  if (instagram) return instagram[1].trim();
  const section = match(ua, /\(([^)]*\bAndroid\b[^)]*)\)/i)?.[1];
  if (!section) return '';
  const parts = section.split(';').map((part) => part.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    let candidate = parts[i].replace(/\s+Build\/[\s\S]*$/i, '').trim();
    if (!candidate || /^(?:wv|mobile|tablet|[a-z]{2}(?:[-_][a-z]{2})?)$/i.test(candidate)
      || /^(?:android[\s/]|linux\b)/i.test(candidate)) continue;
    if (/^(?:[a-z0-9_]+\s+)?(?:x86_64|i[3-6]86|armv\d+l?|aarch64)$/i.test(candidate)) continue;
    if (candidate === 'K') return '';
    return candidate;
  }
  return '';
}

function androidVendor(model) {
  const vendors = [
    [/^(?:SM-|GT-|SCH-|SGH-|SAMSUNG)/i, 'Samsung'],
    [/^(?:Pixel|Nexus)/i, 'Google'],
    [/^(?:HUAWEI|HONOR|[A-Z]{3}-L\d{2})/i, 'Huawei'],
    [/^(?:Mi\s|MI\s|Redmi|POCO)/i, 'Xiaomi'],
    [/^(?:OnePlus|ONEPLUS)/i, 'OnePlus'],
    [/^(?:LG-|LGE)/i, 'LG'],
    [/^(?:HTC)/i, 'HTC'],
    [/^(?:moto\s|Motorola)/i, 'Motorola'],
    [/^(?:Sony|Xperia)/i, 'Sony'],
    [/^(?:KF[A-Z0-9]+|Kindle)/i, 'Amazon'],
  ];
  return vendors.find(([expression]) => expression.test(model))?.[1];
}

function parseDevice(ua) {
  if (/\biPad\b/i.test(ua)) return { vendor: 'Apple', model: 'iPad', type: 'tablet' };
  if (/\biPod\b/i.test(ua)) return { vendor: 'Apple', model: 'iPod', type: 'mobile' };
  if (/\biPhone\b/i.test(ua)) return { vendor: 'Apple', model: 'iPhone', type: 'mobile' };
  if (/\bMacintosh\b[\s\S]*?\bMobile\//i.test(ua)) return { vendor: 'Apple', model: 'iPad', type: 'tablet' };
  if (/\bMacintosh\b/i.test(ua)) return { vendor: 'Apple', model: 'Macintosh' };
  if (/Windows Phone/i.test(ua)) {
    const model = match(ua, /Microsoft;\s*([^;)]+)/i)?.[1]?.trim();
    return { vendor: 'Microsoft', ...(model ? { model } : {}), type: 'mobile' };
  }
  if (/Android/i.test(ua)) {
    const model = androidModel(ua);
    const vendor = androidVendor(model);
    const mobileApp = /^Instagram[\s\S]*?Android\s*\(/i.test(ua);
    const type = /\b(?:Tablet|Nexus 7|Nexus 9|SM-T|KF[A-Z0-9]+)\b/i.test(ua) || (!mobileApp && !/\bMobile\b/i.test(ua))
      ? 'tablet' : 'mobile';
    return { ...(vendor ? { vendor } : {}), ...(model ? { model } : {}), type };
  }
  const tv = match(ua, /\b(?:SMART-TV|SmartTV|HbbTV)\b/i);
  if (tv) return { type: 'smarttv' };
  return {};
}

function parseCpu(ua) {
  if (/(?:AMD64|x86_64|Win64;\s*x64|WOW64)/i.test(ua)) return { architecture: 'amd64' };
  if (/(?:aarch64|arm64)/i.test(ua)) return { architecture: 'arm64' };
  if (/(?:i[3-6]86|Win32|\bx86\b)/i.test(ua)) return { architecture: 'ia32' };
  if (/(?:armv\d+l?|\barm\b)/i.test(ua)) return { architecture: 'arm' };
  if (/(?:ppc|powerpc)/i.test(ua)) return { architecture: 'ppc' };
  if (/sparc/i.test(ua)) return { architecture: 'sparc' };
  return {};
}

export function parseUserAgent(input) {
  if (typeof input !== 'string') throw new TypeError('User-Agent는 문자열이어야 합니다.');
  if (input.length > MAX_UA_LENGTH) throw new RangeError(`User-Agent는 ${MAX_UA_LENGTH.toLocaleString()}자 이하여야 합니다.`);
  const ua = input.trim();
  if (!ua) return { browser: {}, engine: {}, os: {}, device: {}, cpu: {} };
  const browser = parseBrowser(ua);
  return {
    browser,
    engine: parseEngine(ua, browser),
    os: parseOs(ua),
    device: parseDevice(ua),
    cpu: parseCpu(ua),
  };
}
