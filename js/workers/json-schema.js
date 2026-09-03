import { stringifySchemaSample, validateJsonSchema, validateSchema } from '../lib/data/json-schema.js';

self.addEventListener('message', ({ data }) => {
  try {
    let schema;
    try { schema = JSON.parse(data.schemaText); }
    catch (error) {
      self.postMessage({ parseError: 'schema', message: error.message });
      return;
    }
    const schemaResult = validateSchema(schema);
    if (!schemaResult.valid) {
      self.postMessage({ schemaErrors: schemaResult.errors });
      return;
    }
    if (data.action === 'sample') {
      try {
        self.postMessage({ sample: stringifySchemaSample(schema, { schemaResult }) });
      } catch (error) {
        self.postMessage({ engineError: { code: error?.code, params: error?.params || [] } });
      }
      return;
    }
    let value;
    try { value = JSON.parse(data.jsonText); }
    catch (error) {
      self.postMessage({ parseError: 'json', message: error.message });
      return;
    }
    const result = validateJsonSchema(value, schema, { schemaResult });
    self.postMessage({ result: { valid: result.valid, errors: result.errors } });
  } catch (error) {
    self.postMessage({ engineError: {
      code: error?.code || 'WORKER_ERROR',
      params: error?.params || [],
      message: error?.message || String(error),
    } });
  }
});
