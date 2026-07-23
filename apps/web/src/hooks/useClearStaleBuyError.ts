'use client'

import { useEffect } from 'react'
import type { TxStep } from '@/hooks/useBuyPixels'

/**
 * Clears a stale buy error the moment the pixel selection changes.
 *
 * A failed buy (e.g. more pixels than the balance covers) leaves its red error
 * frozen on the drawer. Without this, pruning the selection down to an
 * affordable amount still showed the old failure — the reported bug where
 * unselecting a pixel kept the same "insufficient funds" error on screen.
 *
 * Keyed on `selection` only (not `step`) so it fires on selection edits and
 * never on the failure itself — including `step` would reset the error the
 * instant it was set.
 */
export const useClearStaleBuyError = (
  selection: Set<number>,
  step: TxStep,
  reset: () => void,
): void => {
  useEffect(() => {
    if (step === 'error') reset()
    // Intentionally excludes `step`/`reset`: this must react to selection
    // edits, not to entering the error state (see doc comment).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection])
}
