import React, { createContext, useContext } from 'react';

/** Below this list width, desktop uses the mobile horizontal card row (never 1-up tiles). */
export const BOX_TILE_GRID_MIN_WIDTH = 520;

/** Prefer ~3 cards per row once the section list is wide enough. */
export const BOX_TILE_GRID_THREE_COL_MIN_WIDTH = 720;

export type BoxItemVisualVariant = 'card' | 'tile';

const BoxItemVisualVariantContext = createContext<BoxItemVisualVariant>('card');

export function BoxItemVisualVariantProvider({
  value,
  children,
}: {
  value: BoxItemVisualVariant;
  children: React.ReactNode;
}) {
  return (
    <BoxItemVisualVariantContext.Provider value={value}>{children}</BoxItemVisualVariantContext.Provider>
  );
}

/** card = mobile horizontal row; tile = desktop image-top grid cell. */
export function useBoxItemVisualVariant(): BoxItemVisualVariant {
  return useContext(BoxItemVisualVariantContext);
}
