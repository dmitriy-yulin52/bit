import { Command } from '../cli';
import { UiMain } from './ui.main.runtime';

export class UIBuildCmd implements Command {
  name = 'ui-build [type]';
  description = 'build production assets for deployment.';
  alias = 'c';
  private = true;
  group = 'development';
  shortDescription = '';
  options = [];

  constructor(
    /**
     * access to the extension instance.
     */
    private ui: UiMain
  ) {}

  async report([type]: [string]): Promise<string> {
    // teambit.bit/variants should be the one to take care of component patterns.
    const stats = await this.ui.build(type);
    return stats.toString();
  }
}
