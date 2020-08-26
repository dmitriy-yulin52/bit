import { ConsumableLink } from '@teambit/documenter.ui.consumable-link';
import { Subtitle } from '@teambit/documenter.ui.sub-title';
import { ScopeLabels } from '@teambit/staged-components.scope-labels';
import { ScopeTitle } from '@teambit/staged-components.scope-title';
import { AccountObj, UserAvatar } from '@teambit/staged-components.workspace-components.avatar';
import classNames from 'classnames';
import React from 'react';

import styles from './scope-details.module.scss';

type ScopeDetailsProps = {
  org: string;
  scopeName: string;
  visibility: string;
  license: string;
  subtitle: string;
  contributors: AccountObj[];
} & React.HTMLAttributes<HTMLDivElement>;

export function ScopeDetails({
  org,
  scopeName,
  visibility,
  license,
  subtitle,
  contributors,
  className,
  ...rest
}: ScopeDetailsProps) {
  return (
    <div {...rest} className={classNames(styles.scopeTitle, className)}>
      <div className={styles.titleRow}>
        <ScopeTitle org={org} scopeName={scopeName} />
        <ScopeLabels visibility={visibility} license={license} />
      </div>
      <Subtitle>{subtitle}</Subtitle>
      <div className={styles.contributors}>
        {contributors.map((user, index) => {
          return <UserAvatar key={index} size={32} account={user} className={styles.avatar} />;
        })}
      </div>
      <ConsumableLink
        title="Export to this scope"
        link={`bit export ${org}.${scopeName}`}
        className={styles.copyLink}
      />
    </div>
  );
}
