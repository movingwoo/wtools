self.addEventListener('message', async ({ data }) => {
  try {
    const yaml = await import('../lib/data/yaml.js');
    let result;
    if (data?.action === 'load' && typeof data.text === 'string') result = yaml.load(data.text);
    else if (data?.action === 'dump') result = yaml.dump(data.value, data.options || {});
    else throw new Error('지원하지 않는 YAML Worker 작업입니다.');
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error?.message || String(error), code: error?.code });
  }
}, { once: true });
