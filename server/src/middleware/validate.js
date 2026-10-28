import ApiError from '../utils/ApiError.js';

/**
 * Validates req.body / req.query / req.params against Zod schemas.
 * Parsed (coerced, stripped) values are exposed on req.valid so controllers never
 * touch raw input. Express 5 makes req.query read-only, hence a separate object.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    req.valid = req.valid ?? {};
    const issues = [];
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (result.success) {
        req.valid[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          issues.push({ field: [part, ...issue.path].join('.'), message: issue.message });
        }
      }
    }
    if (issues.length) {
      throw ApiError.badRequest('Some fields are invalid', { code: 'VALIDATION_ERROR', details: issues });
    }
    next();
  };
}
