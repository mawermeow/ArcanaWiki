export function dotProduct(left: number[], right: number[]): number {
  if (left.length !== right.length) {
    throw new Error(`Vector dimension mismatch: ${left.length} !== ${right.length}`);
  }
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    sum += left[index] * right[index];
  }
  return sum;
}

export function vectorMagnitude(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

export function cosineSimilarity(left: number[], right: number[]): number {
  const leftMagnitude = vectorMagnitude(left);
  const rightMagnitude = vectorMagnitude(right);
  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }
  return dotProduct(left, right) / (leftMagnitude * rightMagnitude);
}
