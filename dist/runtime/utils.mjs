export const deepmerge = (a, b) => {
  const result = { ...a };
  for (const key in b) {
    if (typeof b[key] === "object" && b[key] !== null) {
      result[key] = deepmerge(result[key] || {}, b[key]);
    } else {
      result[key] = b[key];
    }
  }
  return result;
};
