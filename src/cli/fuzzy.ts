export function distance(left: string, right: string): number {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array<number>(columns).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }

  for (let column = 0; column < columns; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitution = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitution,
      );
    }
  }

  return matrix[left.length][right.length];
}

export function suggest(input: string, candidates: readonly string[]): string | undefined {
  let best: { candidate: string; distance: number } | undefined;

  for (const candidate of candidates) {
    const current = distance(input, candidate);

    if (!best || current < best.distance) {
      best = { candidate, distance: current };
    }
  }

  return best && best.distance <= 2 ? best.candidate : undefined;
}
