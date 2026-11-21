import { Trans } from 'react-i18next'

import { GITHUB_ISSUES_URL } from '../../config'
import { InfoPanel } from '../ui'

type TransWrapperProps = {
  i18nKey: string
  className?: string
}

export function TransWrapper({ i18nKey, className = 'content-section' }: TransWrapperProps) {
  return (
    <div className={className}>
      <Trans
        i18nKey={i18nKey as any}
        parent="div"
        components={{
          infoPanel: <InfoPanel />,
          githubIssuesLink: (
            <a
              href={GITHUB_ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-padel-500 hover:underline"
            />
          ),
        }}
      />
    </div>
  )
}
