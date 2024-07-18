import type { AnyWgslData } from './std140/types';
import type { ResolutionCtx, Wgsl, WgslResolvable } from './types';
import { code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';

// ----------
// Public API
// ----------

export type VariableScope = 'private';

export interface WgslVar<TDataType extends AnyWgslData> extends WgslResolvable {
  $name(label: string): WgslVar<TDataType>;
}

/**
 * Creates a variable, with an optional initial value.
 */
export const variable = <TDataType extends AnyWgslData>(
  dataType: TDataType,
  initialValue?: Wgsl,
): WgslVar<TDataType> => new WgslVarImpl(dataType, initialValue, 'private');

// --------------
// Implementation
// --------------

class WgslVarImpl<TDataType extends AnyWgslData> implements WgslVar<TDataType> {
  public identifier = new WgslIdentifier();

  constructor(
    private readonly _dataType: TDataType,
    private readonly _initialValue: Wgsl | undefined,
    public readonly scope: VariableScope,
  ) {}

  $name(debugLabel: string) {
    this.identifier.$name(debugLabel);
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    if (this._initialValue) {
      ctx.addDependency(
        code`var<${this.scope}> ${this.identifier}: ${this._dataType} = ${this._initialValue};`,
      );
    } else {
      ctx.addDependency(
        code`var<${this.scope}> ${this.identifier}: ${this._dataType};`,
      );
    }

    return ctx.resolve(this.identifier);
  }
}
