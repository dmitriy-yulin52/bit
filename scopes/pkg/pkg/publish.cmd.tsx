import { ComponentResult } from '@teambit/builder';
import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';

import { Publisher, PublisherOptions } from './publisher';

type PublishArgs = [string];

export class PublishCmd implements Command {
  name = 'publish <component-pattern>';
  description = 'publish components to npm (npm publish)';
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  options = [
    ['d', 'dry-run', 'npm publish --dry-run'],
    ['', 'allow-staged', 'allow publish components that were not exported yet (not recommended)'],
    ['j', 'json', 'return the output as JSON'],
  ] as CommandOptions;
  alias = '';
  private = true;
  group = 'collaborate';

  constructor(private publisher: Publisher) {}

  async report(args: PublishArgs, options: PublisherOptions) {
    const result = await this.json(args, options);
    const publishResults: ComponentResult[] = result.data;
    if (!publishResults.length) return 'no components were found candidate for publish';

    const publishOrDryRun = options.dryRun ? 'dry-run' : 'published';
    const title = chalk.white.bold(`successfully ${publishOrDryRun} the following components\n`);
    const output = publishResults
      .map((publishResult) => {
        const compName = publishResult.component.id.toString();
        const getData = () => {
          if (publishResult.errors?.length) {
            return chalk.red(publishResult.errors.join('\n'));
          }
          return chalk.green((publishResult.metadata?.publishedPackage as string) || '');
        };
        return `${chalk.bold(compName)}\n${getData()}\n`;
      })
      .join('\n');
    return title + output;
  }

  async json([pattern]: PublishArgs, options: PublisherOptions): Promise<{ data: ComponentResult[]; code: number }> {
    const packResult = await this.publisher.publish(pattern, options);
    return {
      data: packResult,
      code: 0,
    };
  }
}
