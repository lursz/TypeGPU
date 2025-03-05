import type { ExampleControlParam } from './exampleControlAtom';
import type { ExampleState } from './exampleState';

type Labelless<T> = T extends unknown ? Omit<T, 'label'> : never;

export async function executeExample(
  exampleCode: Record<string, string>,
  exampleSources: Record<string, string>,
): Promise<ExampleState> {
  const cleanupCallbacks: (() => unknown)[] = [];
  let disposed = false;
  const controlParams: ExampleControlParam[] = [];

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    for (const cb of cleanupCallbacks) {
      cb();
    }
  };

  function addParameters(
    options: Record<string, Labelless<ExampleControlParam>>,
  ) {
    for (const [label, value] of Object.entries(options)) {
      const param = {
        ...value,
        label,
      };

      controlParams.push(param);

      // Eager run to initialize the values.
      initializeParam(param);
    }
  }

  function initializeParam(param: ExampleControlParam) {
    if ('onSelectChange' in param) {
      return param.onSelectChange(param.initial ?? param.options[0]);
    }
    if ('onToggleChange' in param) {
      return param.onToggleChange(param.initial ?? false);
    }
    if ('onSliderChange' in param) {
      return param.onSliderChange(param.initial ?? param.min ?? 0);
    }
  }

  function myExtractUrlFromViteImport(importFn: any): string | undefined  {
    const filePath = String(importFn);
    const match = filePath.match(/\(\)\s*=>\s*import\("([^"]+)"\)/);
    if (match?.[1]) {
      console.log(match[1])
      return match[1];
    }
  }
  
  function noCacheImport(importFn: any): any {
    const url = `${myExtractUrlFromViteImport(importFn)}&update=${Date.now()}`;
  
    // @vite-ignore
    return import(url);
  }
  

  const entryExampleFile = await noCacheImport(exampleSources['index.ts']);
  const controls = entryExampleFile.controls;
  if (controls) {
    addParameters(controls);
  }

  // clean-up
  if (entryExampleFile.onCleanup) {
    cleanupCallbacks.push(entryExampleFile.onCleanup);
  }
  return {
    dispose,
    controlParams,
  };
}
