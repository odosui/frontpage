export type Selection = {
  value: string
  start: number
  end: number
}

const MARK = '**'

/**
 * What cmd-B does to a textarea: wrap the selection in `**`, or take them off
 * again if they are already there.
 *
 * Pure, so the rules are testable without a dom — the component only has to
 * put the caret back where this says.
 */
export function toggleBold({ value, start, end }: Selection): Selection {
  const selected = value.slice(start, end)

  // nothing selected: leave the markers with the caret between them, ready to
  // type into
  if (start === end) {
    return {
      value: `${value.slice(0, start)}${MARK}${MARK}${value.slice(end)}`,
      start: start + MARK.length,
      end: start + MARK.length,
    }
  }

  // the selection is itself marked — **like this** — so unmark it
  if (
    selected.length > MARK.length * 2 &&
    selected.startsWith(MARK) &&
    selected.endsWith(MARK)
  ) {
    const inner = selected.slice(MARK.length, -MARK.length)
    return {
      value: `${value.slice(0, start)}${inner}${value.slice(end)}`,
      start,
      end: end - MARK.length * 2,
    }
  }

  // the markers sit just outside the selection, which is what happens when the
  // reader double-clicks a word that was already bold
  if (
    value.slice(start - MARK.length, start) === MARK &&
    value.slice(end, end + MARK.length) === MARK
  ) {
    return {
      value:
        value.slice(0, start - MARK.length) +
        selected +
        value.slice(end + MARK.length),
      start: start - MARK.length,
      end: end - MARK.length,
    }
  }

  return {
    value: `${value.slice(0, start)}${MARK}${selected}${MARK}${value.slice(end)}`,
    start: start + MARK.length,
    end: end + MARK.length,
  }
}
