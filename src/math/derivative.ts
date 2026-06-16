/**
 * Compute the derivative of a polynomial term a*x^n.
 *
 * For f(x) = x^2, the derivative is 2*x (power rule: d/dx x^n = n*x^(n-1)).
 *
 * @param coefficient - The coefficient a in a*x^n.
 * @param exponent    - The exponent n in a*x^n.
 * @returns An object `{ coefficient, exponent }` representing the derivative term.
 */
export function derivativeTerm(
  coefficient: number,
  exponent: number,
): { coefficient: number; exponent: number } {
  if (exponent === 0) {
    // derivative of constant is 0
    return { coefficient: 0, exponent: 0 };
  }
  return {
    coefficient: coefficient * exponent,
    exponent: exponent - 1,
  };
}

/**
 * Compute the derivative of f(x) = x^2.
 *
 * By the power rule: d/dx x^2 = 2*x^1 = 2x.
 *
 * @param x - The point at which to evaluate the derivative (optional, for
 *            computing the slope at a specific point).
 * @returns If called with no arguments, returns the derivative function.
 *          If called with a number, returns the slope at that point.
 */
export function derivativeOfX2(x?: number): number | ((x: number) => number) {
  // d/dx x^2 = 2x
  const slope = (xVal: number): number => 2 * xVal;
  return x === undefined ? slope : slope(x);
}
