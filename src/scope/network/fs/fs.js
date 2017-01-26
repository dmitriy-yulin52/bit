/** @flow */
import loadScope from '../../scope-loader';
import Scope from '../../scope';
import ComponentObjects from '../../component-objects';
import { BitIds, BitId } from '../../../bit-id';
import { FsScopeNotLoaded } from '../exceptions';
import { flatten } from '../../../utils';
import type { ScopeDescriptor } from '../../scope';

export default class Fs {
  scopePath: string;
  scope: ?Scope;

  constructor(scopePath: string) {
    this.scopePath = scopePath;
  }

  close() {
    return this;
  }

  getScope(): Scope {
    if (!this.scope) throw new FsScopeNotLoaded();
    return this.scope;
  }

  describeScope(): Promise<ScopeDescriptor> {
    return Promise.resolve(this.getScope().describe());
  }

  push(componentObjects: ComponentObjects): Promise<ComponentObjects> {
    return this.getScope().export(componentObjects);
  }

  fetch(bitIds: BitIds): Promise<ComponentObjects[]> {
    return this.getScope().getObjects(bitIds)
      .then(bitsMatrix => flatten(bitsMatrix));
  }

  fetchAll(ids: BitIds): Promise<ComponentObjects[]> {
    return this.getScope().getObjects(ids);
  }

  fetchOnes(bitIds: BitIds): Promise<ComponentObjects[]> {
    return this.getScope().manyOneObjects(bitIds);
  }

  list(): Promise<[]> {
    return this.getScope().list();
  }

  search(): Promise<[]> {
    throw new Error('not implemented yet');
  }

  show(bitId: BitId): Promise<> {
    return this.getScope()
    .loadComponent(bitId);
  }

  connect() {
    return loadScope(this.scopePath).then((scope) => {
      this.scope = scope;
      return this;
    });
  }
}
