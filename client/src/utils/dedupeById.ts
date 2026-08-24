type Identifiable = {
  id: PropertyKey
}

/** Combines lists in order, keeping the first value found for each id. */
export function dedupeById<T extends Identifiable>(
  ...lists: ReadonlyArray<ReadonlyArray<T>>
): T[] {
  const seen = new Set<PropertyKey>()
  const unique: T[] = []

  for (const list of lists) {
    for (const value of list) {
      if (seen.has(value.id)) continue
      seen.add(value.id)
      unique.push(value)
    }
  }

  return unique
}
