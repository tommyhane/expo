import { EXPO_ROUTER_CTX_IGNORE } from 'expo-router/_ctx-shared';
import fs from 'node:fs';
import path from 'node:path';

import { getTypedRoutesDeclarationFile } from './generate';
import { isTypedRoute } from '../matchers';
import requireContext, {
  RequireContextPonyFill,
} from '../testing-library/require-context-ponyfill';

const defaultCtx = requireContext(process.env.EXPO_ROUTER_APP_ROOT, true, EXPO_ROUTER_CTX_IGNORE);

export type { RequireContextPonyFill } from '../testing-library/require-context-ponyfill';

/**
 * This file is imported via `@expo/cli`. While users should be using the same SDK version of `expo-router` as `@expo/cli`,
 * this export allows us to ensure that the version of the `expo-router` package is compatible with the version of `@expo/cli`.
 */
export const version = 52;

/**
 * Generate a Metro watch handler that regenerates the typed routes declaration file
 */
export function getWatchHandler(
  outputDir: string,
  { ctx = defaultCtx, regenerateFn = regenerateDeclarations } = {} // Exposed for testing
) {
  const routeFiles = new Set(ctx.keys().filter((key) => isTypedRoute(key)));

  return async function callback({ filePath, type }: { filePath: string; type: string }) {
    // Sanity check that we are in an Expo Router project
    if (!process.env.EXPO_ROUTER_APP_ROOT) return;

    let shouldRegenerate = false;
    let relativePath = path.relative(process.env.EXPO_ROUTER_APP_ROOT, filePath);
    const isInsideAppRoot = !relativePath.startsWith('../');
    const basename = path.basename(relativePath);

    if (!isInsideAppRoot) return;

    // require.context paths always start with './' when relative to the root
    relativePath = `./${relativePath}`;

    if (type === 'delete') {
      ctx.__delete(relativePath);
      if (routeFiles.has(relativePath)) {
        routeFiles.delete(relativePath);
        shouldRegenerate = true;
      }
    } else if (type === 'add') {
      ctx.__add(relativePath);
      if (isTypedRoute(basename)) {
        routeFiles.add(relativePath);
        shouldRegenerate = true;
      }
    } else {
      shouldRegenerate = routeFiles.has(relativePath);
    }

    if (shouldRegenerate) {
      // TODO(@kitten): This was altered from `regenerateFn(outputDir, ctx)` which, as per the types, is incorrect
      // It's unclear whether fixing this will have other unintended consequences!
      regenerateFn(outputDir, {}, ctx);
    }
  };
}

/**
 * Regenerate the declaration file.
 *
 * This function needs to be debounced due to Metro's handling of renaming folders.
 * For example, if you have the file /(tabs)/route.tsx and you rename the folder to /(tabs,test)/route.tsx
 *
 * Metro will fire 2 filesystem events:
 *  - ADD /(tabs,test)/router.tsx
 *  - DELETE /(tabs)/router.tsx
 *
 * If you process the types after the ADD, then they will crash as you will have conflicting routes
 */
export const regenerateDeclarations = debounce(
  (
    outputDir: string,
    options: { partialTypedGroups?: boolean } = {},
    ctx: RequireContextPonyFill = defaultCtx
  ) => {
    // Don't crash the process, just log the error. The user will most likely fix it and continue
    try {
      const file = getTypedRoutesDeclarationFile(ctx, options);
      if (!file) return;
      fs.writeFileSync(path.resolve(outputDir, './router.d.ts'), file);
    } catch (error) {
      console.error(error);
    }
  }
);

/**
 * Debounce a function to only run once after a period of inactivity
 * If called while waiting, it will reset the timer
 */
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  timeout: number = 1000
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
    }, timeout);
  };
}
