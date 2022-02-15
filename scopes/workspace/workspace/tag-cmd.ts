import chalk from 'chalk';
import semver, { ReleaseType } from 'semver';
import { Command, CommandOptions } from '@teambit/cli';
import { tagAction } from '@teambit/legacy/dist/api/consumer';
import {
  TagResults,
  NOTHING_TO_TAG_MSG,
  AUTO_TAGGED_MSG,
  BasicTagParams,
} from '@teambit/legacy/dist/api/consumer/lib/tag';
import { isString } from '@teambit/legacy/dist/utils';
import { DEFAULT_BIT_RELEASE_TYPE, BASE_DOCS_DOMAIN, WILDCARD_HELP } from '@teambit/legacy/dist/constants';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import { isFeatureEnabled, BUILD_ON_CI } from '@teambit/legacy/dist/api/consumer/lib/feature-toggle';

export class Tag implements Command {
  name = 'tag [id...]';
  group = 'development';
  shortDescription = 'record component changes and lock versions';
  description = `record component changes and lock versions.
if component ids are entered, you can specify a version per id using "@" sign, e.g. bit tag foo@1.0.0 bar@minor baz@major
https://${BASE_DOCS_DOMAIN}/docs/tag-component-version
${WILDCARD_HELP('tag')}`;
  alias = 't';
  loader = true;
  options = [
    ['m', 'message <message>', 'log message describing the user changes'],
    ['a', 'all [version]', 'tag all new and modified components'],
    ['s', 'scope [version]', 'tag all components of the current scope'],
    [
      '',
      'editor [editor]',
      'EXPERIMENTAL. open an editor to edit the tag messages per component, optionally specify the editor-name, default to vim',
    ],
    ['', 'snapped [version]', 'tag components that their head is a snap (not a tag)'],
    ['', 'ver <version>', 'tag specified components with the given version'],
    ['p', 'patch', 'increment the patch version number'],
    ['', 'minor', 'increment the minor version number'],
    ['', 'major', 'increment the major version number'],
    ['', 'pre-release [identifier]', 'EXPERIMENTAL. increment a pre-release version (e.g. 1.0.0-dev.1)'],
    ['f', 'force', 'force-tag even if tests are failing and even when component has not changed'],
    ['v', 'verbose', 'show specs output on failure'],
    ['', 'ignore-unresolved-dependencies', 'DEPRECATED. use --ignore-issues instead'],
    ['i', 'ignore-issues', 'ignore component issues (shown in "bit status" as "issues found")'],
    ['I', 'ignore-newest-version', 'ignore existing of newer versions (default = false)'],
    ['', 'skip-tests', 'skip running component tests during tag process'],
    ['', 'skip-auto-tag', 'skip auto tagging dependents'],
    ['b', 'build', 'EXPERIMENTAL. not needed for now. run the pipeline build and complete the tag'],
    ['', 'soft', 'do not persist. only keep note of the changes to be made'],
    ['', 'persist', 'persist the changes generated by --soft tag'],
    ['', 'disable-deploy-pipeline', 'DEPRECATED. use --disable-tag-pipeline instead'],
    ['', 'disable-tag-pipeline', 'skip the tag pipeline to avoid publishing the components'],
    ['', 'force-deploy', 'run the tag pipeline although the build failed'],
    [
      '',
      'increment-by <number>',
      '(default to 1) increment semver flag (patch/minor/major) by. e.g. incrementing patch by 2: 0.0.1 -> 0.0.3.',
    ],
  ] as CommandOptions;
  migration = true;
  remoteOp = true; // In case a compiler / tester is not installed

  // eslint-disable-next-line complexity
  async report(
    [id = []]: [string[]],
    {
      message = '',
      ver,
      all = false,
      editor = '',
      snapped = false,
      patch,
      minor,
      major,
      preRelease,
      force = false,
      verbose = false,
      ignoreUnresolvedDependencies,
      ignoreIssues = false,
      ignoreNewestVersion = false,
      skipTests = false,
      skipAutoTag = false,
      scope,
      build,
      soft = false,
      persist = false,
      disableDeployPipeline = false,
      disableTagPipeline = false,
      forceDeploy = false,
      incrementBy = 1,
    }: {
      all?: boolean | string;
      snapped?: boolean | string;
      ver?: string;
      patch?: boolean;
      minor?: boolean;
      major?: boolean;
      ignoreUnresolvedDependencies?: boolean;
      ignoreIssues?: boolean;
      scope?: string | boolean;
      incrementBy?: number;
      disableDeployPipeline?: boolean;
      disableTagPipeline?: boolean;
    } & Partial<BasicTagParams>
  ): Promise<string> {
    build = isFeatureEnabled(BUILD_ON_CI) ? Boolean(build) : true;
    if (soft) build = false;
    function getVersion(): string | undefined {
      if (scope && isString(scope)) return scope;
      if (all && isString(all)) return all;
      if (snapped && isString(snapped)) return snapped;
      return ver;
    }

    if (!id.length && !all && !snapped && !scope && !persist) {
      throw new GeneralError('missing [id]. to tag all components, please use --all flag');
    }
    if (id.length && all) {
      throw new GeneralError(
        'you can use either a specific component [id] to tag a particular component or --all flag to tag them all'
      );
    }
    if (typeof ignoreUnresolvedDependencies === 'boolean') {
      ignoreIssues = ignoreUnresolvedDependencies;
    }
    if (id.length === 2) {
      const secondArg = id[1];
      // previously, the synopsis of this command was `bit tag [id] [version]`, show a descriptive
      // error when users still use it.
      if (semver.valid(secondArg)) {
        throw new GeneralError(
          `seems like you entered a version as the second arg, this is not supported anymore, please use "@" sign or --ver flag instead`
        );
      }
    }
    const disableTagAndSnapPipelines = disableTagPipeline || disableDeployPipeline;
    if (disableTagAndSnapPipelines && forceDeploy) {
      throw new GeneralError('you can use either force-deploy or disable-tag-pipeline, but not both');
    }
    if (all && persist) {
      throw new GeneralError('you can use either --all or --persist, but not both');
    }
    if (editor && persist) {
      throw new GeneralError('you can use either --editor or --persist, but not both');
    }
    if (editor && message) {
      throw new GeneralError('you can use either --editor or --message, but not both');
    }

    const releaseFlags = [patch, minor, major, preRelease].filter((x) => x);
    if (releaseFlags.length > 1) {
      throw new GeneralError('you can use only one of the following - patch, minor, major, pre-release');
    }

    let releaseType: ReleaseType = DEFAULT_BIT_RELEASE_TYPE;
    const includeImported = Boolean(scope && all);

    if (major) releaseType = 'major';
    else if (minor) releaseType = 'minor';
    else if (patch) releaseType = 'patch';
    else if (preRelease) releaseType = 'prerelease';

    const params = {
      ids: id,
      all: Boolean(all),
      snapped: Boolean(snapped),
      editor,
      message,
      exactVersion: getVersion(),
      releaseType,
      preRelease: typeof preRelease === 'string' ? preRelease : '',
      force,
      verbose,
      ignoreIssues,
      ignoreNewestVersion,
      skipTests,
      skipAutoTag,
      build,
      soft,
      persist,
      scope,
      includeImported,
      disableTagAndSnapPipelines,
      forceDeploy,
      incrementBy,
    };

    const results = await tagAction(params);
    if (!results) return chalk.yellow(NOTHING_TO_TAG_MSG);
    const { taggedComponents, autoTaggedResults, warnings, newComponents }: TagResults = results;
    const changedComponents = taggedComponents.filter((component) => !newComponents.searchWithoutVersion(component.id));
    const addedComponents = taggedComponents.filter((component) => newComponents.searchWithoutVersion(component.id));
    const autoTaggedCount = autoTaggedResults ? autoTaggedResults.length : 0;

    const warningsOutput = warnings && warnings.length ? `${chalk.yellow(warnings.join('\n'))}\n\n` : '';
    const tagExplanationPersist = `\n(use "bit export [collection]" to push these components to a remote")
(use "bit untag" to unstage versions)\n`;
    const tagExplanationSoft = `\n(use "bit tag --persist" to persist the changes")
(use "bit untag --soft" to remove the soft-tags)\n`;

    const tagExplanation = results.isSoftTag ? tagExplanationSoft : tagExplanationPersist;

    const outputComponents = (comps) => {
      return comps
        .map((component) => {
          let componentOutput = `     > ${component.id.toString()}`;
          const autoTag = autoTaggedResults.filter((result) =>
            result.triggeredBy.searchWithoutScopeAndVersion(component.id)
          );
          if (autoTag.length) {
            const autoTagComp = autoTag.map((a) => a.component.id.toString());
            componentOutput += `\n       ${AUTO_TAGGED_MSG}:
            ${autoTagComp.join('\n            ')}`;
          }
          return componentOutput;
        })
        .join('\n');
    };

    const publishOutput = () => {
      const { publishedPackages } = results;
      if (!publishedPackages || !publishedPackages.length) return '';
      const successTitle = `\n\n${chalk.green(
        `published the following ${publishedPackages.length} component(s) successfully\n`
      )}`;
      const successCompsStr = publishedPackages.join('\n');
      const successOutput = successCompsStr ? successTitle + successCompsStr : '';
      return successOutput;
    };

    const softTagPrefix = results.isSoftTag ? 'soft-tagged ' : '';
    const outputIfExists = (label, explanation, components) => {
      if (!components.length) return '';
      return `\n${chalk.underline(softTagPrefix + label)}\n(${explanation})\n${outputComponents(components)}\n`;
    };

    const newDesc = results.isSoftTag
      ? 'set to be tagged first version for components'
      : 'first version for components';
    const changedDesc = results.isSoftTag
      ? 'components that set to get a version bump'
      : 'components that got a version bump';
    const softTagClarification = results.isSoftTag
      ? chalk.bold(
          'keep in mind that this is a soft-tag (changes recorded to be tagged), to persist the changes use --persist flag'
        )
      : '';
    return (
      warningsOutput +
      chalk.green(
        `${taggedComponents.length + autoTaggedCount} component(s) ${results.isSoftTag ? 'soft-' : ''}tagged`
      ) +
      tagExplanation +
      outputIfExists('new components', newDesc, addedComponents) +
      outputIfExists('changed components', changedDesc, changedComponents) +
      publishOutput() +
      softTagClarification
    );
  }
}
